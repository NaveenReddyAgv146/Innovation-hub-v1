# Production Readiness — Issues & Remedies

Audit of known scalability, security, and reliability problems across the Innovation Hub codebase.
Issues are grouped by severity. Fix them in order: Critical → High → Medium → Low.

---

## CRITICAL — App will break or become unusable at scale

---

### 1. Dashboard fetches ALL pages sequentially (waterfall pagination)

**Location:** `client/src/pages/Dashboard.jsx` — `loadAllPages` helper

**Why it breaks:**
`loadAllPages` fetches page 1, waits, then page 2, waits, then page 3… in a serial loop. With 5,000 contributions and `limit: 100` that is 50 sequential HTTP round-trips before the dashboard renders anything useful. On a 100ms latency network that is a 5-second minimum load just for the fetch loop — and it gets worse linearly as data grows.

**Fix:**
Stop fetching every page on the dashboard. The dashboard only needs aggregated counts and a small preview list. Pass `limit: 5` or `limit: 10` to get the preview data and rely on the backend's `pagination.total` field for counts. Never loop through all pages on the client.

```js
// Instead of loadAllPages, do two targeted calls:
const [draftRes, liveRes] = await Promise.all([
    pocService.getAll({ page: 1, limit: 5, status: 'draft' }),
    pocService.getAll({ page: 1, limit: 5, status: 'live' }),
]);
const totalDrafts = draftRes.data.pagination?.total ?? 0;
```

---

### 2. TrackDashboard also waterfall-fetches all track pages

**Location:** `client/src/pages/TrackDashboard.jsx` — `fetchDashboard`, lines 50–56

**Why it breaks:**
Same serial loop as above but scoped to one track. With 500 track contributions and `limit: 100`, that is 5 sequential calls before stats are computed. Stats should come from the backend, not from client-side counting of a full dump.

**Fix:**
Use `pagination.total` from the first response for the stat counters instead of counting items client-side. Fetch only the 5 preview rows per section, which is already done for the section cards — remove the initial full-load entirely.

```js
// Remove the initial full-page loop. Stats come from pagination metadata.
const firstRes = await pocService.getAll({ page: 1, limit: 1, track });
const total = firstRes.data.pagination?.total ?? 0;
```

---

### 3. Leaderboard loads ALL finished POCs into server RAM on every request

**Location:** `backend-fastapi/app/api/routes/users.py` — `get_contribution_leaderboard`, line 258

**Why it breaks:**
`db.pocs.find(query).to_list(length=None)` loads every finished contribution into memory before computing scores. At 100,000 finished POCs this is potentially gigabytes of data in RAM per request. If 10 users view the leaderboard concurrently the server runs out of memory.

**Fix:**
Move score aggregation into MongoDB using an aggregation pipeline with `$group`, `$sort`, and `$limit`, so only the top-N results are transferred. Additionally cache the result in Redis or an in-process dict with a 5-minute TTL. Invalidate on POC finish, feedback submission, or hours update.

```python
# Use MongoDB aggregation instead of Python-side compute
pipeline = [
    {"$match": {"status": "finished", **track_filter}},
    {"$unwind": "$approvedUsers"},
    {"$group": {"_id": "$approvedUsers", "count": {"$sum": 1}, ...}},
    {"$sort": {"count": -1}},
    {"$limit": limit},
]
```

---

### 4. `my-credits` and `interests` endpoints also unbounded `to_list(None)`

**Location:** `backend-fastapi/app/api/routes/users.py` — `get_my_credits` line 413, `get_user_interests` line 228

**Why it breaks:**
Same pattern — loads every POC a user participated in, or every POC with interest data, into memory. A power user with 500 finished contributions triggers loading 500 full documents (including large nested arrays) just to compute their score.

**Fix:**
Add projection to only fetch the fields actually needed for the computation. Use MongoDB `$group` aggregation server-side where possible. Add a hard cap: `.to_list(length=5000)` as a safety net even before the full aggregation rewrite.

```python
# Projection — only fetch fields used in score computation
pocs = await db.pocs.find(
    query,
    {"track": 1, "impact": 1, "complexity": 1, "adminFeedbacks": 1, "_id": 1}
).to_list(length=5000)
```

---

### 5. No rate limiting on authentication endpoints

**Location:** `backend-fastapi/app/api/routes/auth.py` — `login`, `register`

**Why it breaks:**
Without rate limiting, an attacker can attempt unlimited password guesses against any account (login endpoint) or flood registrations (register endpoint). Either attack exhausts database connections and degrades the service for legitimate users.

**Fix:**
Add SlowAPI (FastAPI-compatible rate limiter). Limit login to 10 attempts per IP per minute, register to 3 per IP per hour.

```python
# requirements.txt: slowapi
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, ...):
    ...
```

---

### 6. Synchronous HTTP call inside async route blocks the event loop

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `_fire_webhook`

**Update (2026-05-15):** Partially addressed — all 4 webhooks (live, published, user_approved, finished) now use `BackgroundTasks.add_task(_fire_webhook, ...)` so the webhook call no longer blocks the HTTP response. However, `_fire_webhook` still uses `urllib.request.urlopen()` (synchronous/blocking) inside the background task. FastAPI runs sync background tasks in a thread-pool executor, so the event loop itself is not blocked — but each webhook call still ties up one thread for its full duration (up to 10 seconds timeout). Under high event volume this can exhaust the thread pool.

**Remaining fix:**
Replace `_fire_webhook` with an async function using `httpx.AsyncClient` and register it directly as an async background task.

```python
import httpx

async def _fire_webhook_async(webhook_url: str, payload: dict[str, Any]) -> None:
    url = webhook_url.strip()
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload)
            if r.status_code >= 400:
                logger.warning("Power Automate [%s] returned %s", payload.get("eventType"), r.status_code)
    except Exception as exc:
        logger.warning("Power Automate [%s] failed: %s", payload.get("eventType"), exc)

# In queue functions — replace:
# background_tasks.add_task(_fire_webhook, webhook_url, payload)
# With:
# background_tasks.add_task(_fire_webhook_async, webhook_url, payload)
```

Also add `httpx` to `requirements.txt`.

---

### 7. POC contact permissions enforced only on the frontend

**Location:** `client/src/pages/PocDetail.jsx` — `isPocContactUser`, `canManage`

**Why it breaks:**
Any authenticated viewer can call `POST /pocs/{id}/go-live`, `POST /pocs/{id}/approve-user`, etc. directly via curl or Postman. The backend has no check for whether the caller is the Point of Contact. The frontend flag is purely cosmetic from a security standpoint.

**Fix:**
Store POC contact as a user ID (not a name string). Add a backend dependency that checks whether the caller is admin, track admin, or the designated POC ID before allowing mutations.

```python
# Store pointOfContactId: ObjectId on the POC document

async def require_admin_or_poc(poc_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    poc = await db.pocs.find_one({"_id": ObjectId(poc_id)}, {"pointOfContactId": 1, "track": 1})
    is_admin = current_user["role"] == "admin"
    is_poc   = str(poc.get("pointOfContactId", "")) == current_user["id"]
    if not (is_admin or is_poc):
        raise HTTPException(403, "Forbidden")
```

Also: name-based matching (`poc.pointOfContact === user.name`) breaks when two users share a name. Switch to ID-based matching on both frontend and backend.

---

## HIGH — Serious degradation under moderate load

---

### 8. N+1 query in hours-summary endpoint

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `get_hours_summary`, around line 1693

**Why it breaks:**
For each contributor in the hours aggregation result, the code runs an individual `db.users.find_one()` inside a loop. A POC with 100 contributors triggers 100 sequential database queries. Response time scales linearly with contributor count. At 1,000 contributors this becomes effectively unusable.

**Fix:**
Collect all user IDs first, fetch them in one query, build a lookup dict.

```python
# Collect all IDs
user_ids = [ObjectId(entry["_id"]["userId"]) for entry in agg if ObjectId.is_valid(entry["_id"]["userId"])]

# Single batch fetch
user_docs = await db.users.find({"_id": {"$in": user_ids}}, {"name": 1, "email": 1}).to_list(None)
users_map = {str(doc["_id"]): doc for doc in user_docs}

# Use map instead of per-iteration query
for entry in agg:
    user = users_map.get(str(entry["_id"]["userId"]), {})
```

---

### 9. Missing compound MongoDB indexes for common query patterns

**Location:** `backend-fastapi/app/core/database.py` — `ensure_indexes`

**Why it breaks:**
The `get_pocs` endpoint filters by `status + track`, `status + author`, and sorts by `createdAt`. Without compound indexes MongoDB performs a full collection scan and then sorts in memory. At 100,000 POCs, each query scans the whole collection. Query time grows linearly with collection size.

**Fix:**
Add these indexes to `ensure_indexes()`:

```python
await db.pocs.create_index([("status", ASCENDING), ("track", ASCENDING)])
await db.pocs.create_index([("status", ASCENDING), ("author", ASCENDING)])
await db.pocs.create_index([("status", ASCENDING), ("createdAt", DESCENDING)])
await db.pocs.create_index([("approvedUsers", ASCENDING)])
await db.pocs.create_index([("creditsAwardedUserIds", ASCENDING)])
await db.contribution_hours.create_index([("pocId", ASCENDING), ("startTime", ASCENDING)])
await db.users.create_index([("name", ASCENDING)])
await db.users.create_index([("email", ASCENDING), ("role", ASCENDING)])
```

---

### 10. MongoDB connection pool not configured

**Location:** `backend-fastapi/app/core/database.py` — `AsyncIOMotorClient` instantiation

**Why it breaks:**
The client uses Motor's default connection pool (100 connections). Under 200+ concurrent requests the pool exhausts and requests queue. With no `minPoolSize` set, cold-start traffic causes connection ramp-up latency spikes. With no `maxIdleTimeMS`, idle connections are never reclaimed.

**Fix:**
```python
self.client = AsyncIOMotorClient(
    settings.mongodb_uri,
    maxPoolSize=150,
    minPoolSize=10,
    maxIdleTimeMS=30_000,
    serverSelectionTimeoutMS=5_000,
)
```

---

### 11. Access tokens stored in localStorage — XSS risk

**Location:** `client/src/store/authStore.js`

**Why it breaks:**
Any JavaScript running on the page (including injected via a stored XSS in a contribution description, title, or feedback field) can read `localStorage` and steal the access token. A single stored XSS vulnerability compromises every user who views the page.

**Fix:**
Store tokens in `httpOnly; Secure; SameSite=Strict` cookies set by the backend. The browser sends them automatically and JavaScript cannot read them. Non-sensitive display data (name, role) stays in the Zustand store (memory only).

```python
# Backend: set-cookie instead of returning token in body
response.set_cookie(
    key="access_token",
    value=access_token,
    httponly=True,
    secure=True,       # HTTPS only
    samesite="strict",
    max_age=900,       # 15 minutes
)
```

---

### 12. No error boundaries — one component crash kills the whole app

**Location:** `client/src/App.jsx` and all page components

**Why it breaks:**
React has no global error handler for component render errors. A null-pointer in Dashboard's interest-pulse chart (e.g., backend returns an unexpected shape) throws during render, React unmounts the entire tree, and the user sees a blank white page.

**Fix:**
Wrap routes in an `ErrorBoundary` class component. Add a per-section boundary around heavy cards so one bad card doesn't kill the whole page.

```jsx
// ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError)
            return <div className="p-6 text-red-500">Something went wrong in this section.</div>;
        return this.props.children;
    }
}

// App.jsx
<ErrorBoundary>
    <Routes>...</Routes>
</ErrorBoundary>
```

---

### 13. JWT secrets have insecure defaults — forged tokens possible

**Location:** `backend-fastapi/app/core/config.py`

**Why it breaks:**
If `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are not set in `.env`, the app falls back to the string literal default (e.g., `"change_this_access_secret"`). An attacker who knows the default can forge valid JWTs and impersonate any user, including the super admin.

**Fix:**
Remove the defaults so Pydantic raises a `ValidationError` at startup if they are missing. The app should not start at all without proper secrets.

```python
class Settings(BaseSettings):
    jwt_access_secret: str   # No default — required
    jwt_refresh_secret: str  # No default — required
```

---

### 14. Regex search input not sanitised — ReDoS attack possible

**Location:** `backend-fastapi/app/api/routes/pocs.py` and `users.py` — search query parameter

**Why it breaks:**
User-supplied search strings are interpolated directly into MongoDB `$regex` queries. A malicious pattern like `(a+)+$` causes catastrophic backtracking in the regex engine, hanging the database thread. With 10 concurrent such requests all database threads exhaust.

**Fix:**
Escape user input with `re.escape()` before passing to `$regex`. Optionally limit search strings to alphanumeric + spaces and reject anything else.

```python
import re
if search:
    safe_search = re.escape(search.strip()[:100])  # Escape + cap length
    query["$or"] = [
        {"title": {"$regex": safe_search, "$options": "i"}},
        {"description": {"$regex": safe_search, "$options": "i"}},
    ]
```

---

## MEDIUM — Noticeable degradation or data integrity risk at moderate scale

---

### 15. No request cancellation (AbortController) on component unmount

**Location:** `client/src/pages/Dashboard.jsx`, `PocList.jsx`, `PocDetail.jsx`, `TrackDashboard.jsx` — all `useCallback` fetch functions

**Why it breaks:**
When a user navigates away before a fetch completes, the `setState` call fires on an unmounted component. This causes memory leaks and, worse, stale data from a cancelled navigation can overwrite the state of the page the user actually navigated to (race condition).

**Fix:**
Pass an `AbortSignal` through to axios and clean up in the `useEffect` return.

```js
useEffect(() => {
    const controller = new AbortController();
    fetchDashboard(controller.signal);
    return () => controller.abort();
}, [fetchDashboard]);
```

```js
// In endpoints.js, forward signal
getAll: (params, signal) => api.get('/pocs', { params, signal }),
```

---

### 16. Skip/limit pagination is O(n) at large offsets

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `get_pocs` pagination

**Why it breaks:**
`db.pocs.find().skip(offset).limit(limit)` causes MongoDB to scan and discard `offset` documents before returning results. Fetching page 500 (offset 49,900) at limit 100 means MongoDB reads 50,000 documents and throws away 49,900. Response time grows linearly with page number.

**Fix:**
Use cursor-based (keyset) pagination for large datasets. Sort by `_id`, pass the last seen `_id` as a cursor, and query `{"_id": {"$gt": last_id}}` instead of using skip.

```python
# API: accept `after_id` param instead of page
if after_id and ObjectId.is_valid(after_id):
    query["_id"] = {"$gt": ObjectId(after_id)}
pocs = await db.pocs.find(query).sort("_id", ASCENDING).limit(limit).to_list(limit)
```

---

### 17. Large user lists rendered without virtualisation

**Location:** `client/src/pages/PocDetail.jsx` — interested users list (~line 1146) and contributor hours list (~line 1332)

**Why it breaks:**
All matching users are rendered as DOM nodes even when only 6–8 are visible in the scrollable container. At 500 interested users on a popular POC, 500 DOM nodes with avatars, names, and buttons all mount simultaneously. Scrolling becomes janky and the browser tab uses excessive memory.

**Fix:**
Use `react-window` `FixedSizeList` for the scrollable containers, or paginate the list server-side and load more on scroll.

```jsx
import { FixedSizeList } from 'react-window';

<FixedSizeList height={256} itemCount={interestedUsers.length} itemSize={72}>
    {({ index, style }) => (
        <div style={style}>
            <VoterRow user={interestedUsers[index]} />
        </div>
    )}
</FixedSizeList>
```

---

### 18. Filter changes in PocList do not reset pagination

**Location:** `client/src/pages/PocList.jsx` — `syncParams`

**Why it breaks:**
When a user changes the track filter or status filter, the page number in the URL is not cleared. If the user was on page 7 of "Solutions" results and switches to "Learning" (which may have only 2 pages), the app requests page 7 of Learning, gets zero results, and shows an empty list even though Learning has data.

**Fix:**
Reset the page parameter to 1 whenever any filter changes.

```js
const syncParams = useCallback((nextState) => {
    setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', '1'); // Always reset on filter change
        if (nextState.track !== undefined) next.set('track', nextState.track);
        if (nextState.status !== undefined) next.set('status', nextState.status);
        return next;
    });
}, [setSearchParams]);
```

---

### 19. CORS allows all methods and headers

**Location:** `backend-fastapi/app/main.py` — `CORSMiddleware` config

**Why it breaks:**
`allow_methods=["*"]` and `allow_headers=["*"]` permit any HTTP verb and any header from allowed origins. This increases the CORS preflight cost on every non-simple request and needlessly expands the attack surface.

**Fix:**
Explicitly list only the methods and headers the app actually uses.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.client_urls,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

---

### 20. `fetch_poc_or_404` fetches the full document with all nested arrays

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `fetch_poc_or_404`

**Why it breaks:**
The helper runs `find_one()` without projection. Over time, a popular POC accumulates hundreds of entries in `votes`, `approvedUsers`, `interestDetails`, `adminFeedbacks`, and `userFeedbacks`. Every endpoint that calls `fetch_poc_or_404` (there are 15+) loads all of these arrays even when it only needs the `status` field or `author` field to check a permission.

**Fix:**
Add an optional `projection` argument to `fetch_poc_or_404` and pass only the needed fields from each call site.

```python
async def fetch_poc_or_404(poc_id: str, db, projection: dict | None = None):
    doc = await db.pocs.find_one({"_id": ObjectId(poc_id)}, projection)
    if not doc:
        raise HTTPException(404, "Contribution not found")
    return doc

# Call site: only needs status and author for permission check
poc = await fetch_poc_or_404(poc_id, db, {"status": 1, "author": 1, "track": 1})
```

---

### 21. No debounce on concurrent filter triggers in PocList

**Location:** `client/src/pages/PocList.jsx`

**Why it breaks:**
Each filter state (search, status, track) has its own change handler that calls `syncParams` / `fetchPocs`. If a user types a search term while also clicking a status filter, two separate `fetchPocs` calls fire within milliseconds. Both requests race, and whichever responds last wins — potentially showing results for the earlier abandoned search.

**Fix:**
Consolidate all filter changes through a single debounced effect that reads the current filter state.

```js
const filtersRef = useRef({ search, statusFilter, trackFilter });
useEffect(() => { filtersRef.current = { search, statusFilter, trackFilter }; });

useEffect(() => {
    const t = setTimeout(() => fetchPocs(1), 300);
    return () => clearTimeout(t);
}, [search, statusFilter, trackFilter]);
```

---

### 22. Leaderboard scores recomputed from scratch on every request — no caching

**Location:** `backend-fastapi/app/api/routes/users.py` — `get_contribution_leaderboard`

**Why it breaks:**
The leaderboard traverses every finished POC, aggregates hours from a separate collection, looks up every user, and computes a weighted formula — all on each HTTP request. With 10 concurrent leaderboard views, 10 identical expensive computations run in parallel. At 100k finished POCs this can take 10–30 seconds per request.

**Fix:**
Cache the result with a simple in-process dict (or Redis for multi-process deployments) with a 5-minute TTL. Invalidate the cache when a POC is finished, feedback is added, or hours are updated.

```python
_leaderboard_cache: dict[str, tuple[float, list]] = {}
CACHE_TTL = 300  # seconds

async def get_cached_leaderboard(track: str, ...):
    key = f"lb:{track}:{sort_by}"
    if key in _leaderboard_cache:
        ts, data = _leaderboard_cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    result = await _compute_leaderboard(track, ...)
    _leaderboard_cache[key] = (time.time(), result)
    return result
```

---

## LOW — UX or minor correctness issues that surface at scale

---

### 23. No retry logic on failed network requests

**Location:** All frontend pages — `useCallback` fetch functions

**Why it breaks:**
A single transient network hiccup immediately shows an error state to the user. At 10,000 active users on a flaky network, thousands will see error screens even though a retry 500ms later would succeed.

**Fix:**
Add a simple retry with exponential backoff for `GET` requests (not mutations).

```js
async function fetchWithRetry(fn, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try { return await fn(); }
        catch (err) {
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, 2 ** i * 200));
        }
    }
}
```

---

### 24. User role checked from localStorage on route guards — can be stale

**Location:** `client/src/App.jsx` — `SuperAdminRoute` and similar wrappers

**Why it breaks:**
If an admin demotes a user from super-admin to viewer in the User Management panel, the demoted user's browser still has the old role in localStorage. The route guard passes the stale role, and the user retains UI access to admin-only pages until they log out. The backend will block actual API calls, but the user still sees the admin UI.

**Fix:**
Call `/auth/me` on app mount to sync the current role from the server. Treat the in-memory Zustand store as the source of truth, not localStorage.

```js
// App.jsx — on mount
useEffect(() => {
    authService.me().then(res => setUser(res.data)).catch(() => logout());
}, []);
```

---

### 25. File upload reads entire file into memory before validation

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `save_thumbnail`

**Why it breaks:**
`content = await file.read()` reads the complete upload before checking its size. An attacker sending a 1 GB file with a valid `image/jpeg` content-type header exhausts server memory before the size guard runs.

**Fix:**
Read in chunks, stop and reject as soon as the limit is exceeded.

```python
MAX_SIZE = 5 * 1024 * 1024  # 5 MB
content = b""
async for chunk in file.file:
    content += chunk
    if len(content) > MAX_SIZE:
        raise HTTPException(413, "File too large")
```

---

### 26. Contribution hours overlap check is O(n) per slot submission

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `log_hours` endpoint

**Why it breaks:**
When logging hours, all existing slots for that user+POC+date are fetched with `to_list(None)` and overlap-checked in Python. A user with 200 logged slots on one date triggers 200 Python comparisons per new entry. Not critical now but will noticeably slow as hour-logging usage grows.

**Fix:**
Push the overlap check into a MongoDB query using `$elemMatch` or a targeted range query, and cap the fetch at a reasonable bound.

```python
# Query for any existing slot that overlaps the new time range
overlap = await db.contribution_hours.find_one({
    "pocId": poc_oid,
    "userId": user_oid,
    "date": date_str,
    "startTime": {"$lt": end_time},
    "endTime":   {"$gt": start_time},
})
if overlap:
    raise HTTPException(400, "Time slot overlaps an existing entry")
```

---

## Changes Made — 2026-05-15 Session

The following issues were introduced or discovered during the global admin + webhook notification work done in this session.

---

### 27. `queue_published_notifications` hard-caps recipients at 2,000 users

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `queue_published_notifications`, line ~501

**Why it breaks:**
The function fetches all users with `.to_list(length=2000)`. If the organisation grows beyond 2,000 registered users, anyone beyond that limit silently receives no published-contribution notification. There is no warning logged and no indication to the admin.

**Fix:**
Either remove the artificial cap and rely on a proper pagination loop, or batch-send the webhook in chunks:

```python
# Fetch in batches of 500 to avoid loading too many docs at once
BATCH = 500
skip = 0
all_users = []
while True:
    batch = await db.users.find({}, {"name": 1, "email": 1}).skip(skip).limit(BATCH).to_list(BATCH)
    if not batch:
        break
    all_users.extend(batch)
    skip += BATCH
```

Or, since the published webhook sends to a single mailing list (`agivant-all@agivant.com`), skip the recipients array entirely for that flow and just pass an empty list — Power Automate does not need it.

---

### 28. No retry or dead-letter queue for failed webhook calls

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `_fire_webhook`

**Why it breaks:**
If Power Automate is temporarily unavailable when a contribution is published/approved/finished, the webhook call fails with a `URLError`, logs a warning, and the notification is **permanently lost**. There is no retry, no queue, and no way to replay missed events. A 30-second Power Automate outage during a busy period means dozens of users never receive their emails.

**Fix:**
Add a simple retry with exponential backoff inside `_fire_webhook_async`:

```python
async def _fire_webhook_async(webhook_url: str, payload: dict, retries: int = 3) -> None:
    url = webhook_url.strip()
    if not url:
        return
    for attempt in range(1, retries + 1):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(url, json=payload)
                if r.status_code < 400:
                    return
                logger.warning("Attempt %d: Power Automate returned %s", attempt, r.status_code)
        except Exception as exc:
            logger.warning("Attempt %d: Power Automate failed: %s", attempt, exc)
        if attempt < retries:
            await asyncio.sleep(2 ** attempt)  # 2s, 4s backoff
    logger.error("Power Automate [%s] gave up after %d attempts", payload.get("eventType"), retries)
```

For production, consider a proper message queue (Celery + Redis or Azure Service Bus) so events survive server restarts.

---

### 29. Webhook env vars must be set before server startup — URL change requires restart

**Location:** `backend-fastapi/app/core/config.py` — `Settings` (pydantic-settings)

**Why it breaks:**
`settings = Settings()` runs at Python import time. If a Power Automate webhook URL changes (e.g., a flow is recreated), the `.env` must be updated **and the server restarted** for the new URL to take effect. There is no hot-reload path. During the transition window, all webhook calls hit the stale/dead URL and fail silently.

**Fix:**
For development: document clearly that server restart is required after `.env` changes.
For production: read the URL at call time from an environment variable directly, or store URLs in MongoDB (editable via admin UI) and read them fresh on each event:

```python
# Read fresh on every call instead of at import time
def get_webhook_url(event_type: str) -> str:
    return os.getenv(f"POWER_AUTOMATE_{event_type.upper()}_WEBHOOK_URL", "").strip()
```

---

### 30. Global admin check uses `getAssignedAdminTrack` which depends on a legacy email map

**Location:** `client/src/utils/access.js` — `getAssignedAdminTrack`, `LEGACY_TRACK_ADMIN_EMAILS`

**Why it breaks:**
`isGlobalAdmin` returns `true` only when `getAssignedAdminTrack` returns an empty string. `getAssignedAdminTrack` falls back to `LEGACY_TRACK_ADMIN_EMAILS` — a hardcoded map of email → track. If a legacy track-admin email is listed in that map but the user's DB record has `role=admin` and no `adminTrack` field, they will **not** be treated as a global admin even though they should be. This causes silent permission denial that is hard to debug.

**Fix:**
Stop using the legacy email fallback for the `isGlobalAdmin` decision. Only use the `adminTrack` field from the DB:

```js
export const isGlobalAdmin = (user) =>
    isSuperAdmin(user) || (user?.role === 'admin' && !user?.adminTrack);
// No dependency on LEGACY_TRACK_ADMIN_EMAILS — DB field only
```

Remove `LEGACY_TRACK_ADMIN_EMAILS` from `access.js` entirely and ensure all existing track-admin accounts have `adminTrack` set in the database.

---

### 31. `isGlobalAdmin` defined after `getAssignedAdminTrack` — ordering was a ReferenceError risk

**Location:** `client/src/utils/access.js`

**Status:** Fixed during this session.

**What happened:**
`isGlobalAdmin` was originally defined before `getAssignedAdminTrack` which it calls. JavaScript `const` declarations are not hoisted, so calling `getAssignedAdminTrack` before its declaration would throw `ReferenceError: Cannot access 'getAssignedAdminTrack' before initialization` at runtime in certain module bundling scenarios.

**Fix applied:**
Reordered the file so `getAssignedAdminTrack` is declared first, then `isGlobalAdmin` after it.

---

### 32. `approve_poc_user` and `add_contributor_directly` had `BackgroundTasks` after `Form(...)` params — SyntaxError

**Location:** `backend-fastapi/app/api/routes/pocs.py` — `approve_poc_user`, `add_contributor_directly`

**Status:** Fixed during this session.

**What happened:**
Python requires parameters without defaults to come before parameters with defaults. `background_tasks: BackgroundTasks` has no default, but it was placed after `userId: str = Form(...)` which does. This caused `SyntaxError: parameter without a default follows parameter with a default` at startup.

**Fix applied:**
Moved `background_tasks: BackgroundTasks` to be the first parameter after `poc_id` in both functions.

---

## Quick-Reference Priority Table

| # | Issue | File | Severity | Status |
|---|-------|------|----------|--------|
| 1 | Waterfall pagination on Dashboard | Dashboard.jsx | CRITICAL | Open |
| 2 | Waterfall pagination on TrackDashboard | TrackDashboard.jsx | CRITICAL | Open |
| 3 | Leaderboard loads all POCs into RAM | users.py | CRITICAL | Open |
| 4 | my-credits / interests unbounded to_list | users.py | CRITICAL | Open |
| 5 | No rate limiting on auth endpoints | auth.py | CRITICAL | Open |
| 6 | Synchronous webhook blocks event loop | pocs.py | CRITICAL | Partial — moved to BackgroundTasks, still uses urllib |
| 7 | POC contact permissions frontend-only | PocDetail.jsx + pocs.py | CRITICAL | Open |
| 8 | N+1 query in hours-summary | pocs.py | HIGH | Open |
| 9 | Missing compound indexes | database.py | HIGH | Open |
| 10 | Connection pool not configured | database.py | HIGH | Open |
| 11 | Access tokens in localStorage (XSS) | authStore.js | HIGH | Open |
| 12 | No error boundaries | App.jsx | HIGH | Open |
| 13 | JWT secrets have insecure defaults | config.py | HIGH | Open |
| 14 | Regex search input not sanitised (ReDoS) | pocs.py / users.py | HIGH | Open |
| 15 | No request cancellation (AbortController) | all pages | MEDIUM | Open |
| 16 | skip/limit pagination O(n) at large offsets | pocs.py | MEDIUM | Open |
| 17 | Unvirtualised large user/contributor lists | PocDetail.jsx | MEDIUM | Open |
| 18 | Filter change does not reset pagination | PocList.jsx | MEDIUM | Open |
| 19 | CORS allows all methods and headers | main.py | MEDIUM | Open |
| 20 | fetch_poc_or_404 fetches all nested arrays | pocs.py | MEDIUM | Open |
| 21 | Concurrent filters trigger duplicate fetches | PocList.jsx | MEDIUM | Open |
| 22 | Leaderboard scores not cached | users.py | MEDIUM | Open |
| 23 | No retry on transient network failures | all pages | LOW | Open |
| 24 | Route guards read stale role from localStorage | App.jsx | LOW | Open |
| 25 | File upload reads entire file before validation | pocs.py | LOW | Open |
| 26 | Hours overlap check is O(n) in Python | pocs.py | LOW | Open |
| 27 | Published webhook caps recipients at 2,000 | pocs.py | HIGH | Open — added 2026-05-15 |
| 28 | No retry / dead-letter queue for failed webhooks | pocs.py | HIGH | Open — added 2026-05-15 |
| 29 | Webhook URLs require server restart to update | config.py / .env | MEDIUM | Open — added 2026-05-15 |
| 30 | isGlobalAdmin depends on legacy email map | access.js | MEDIUM | Open — added 2026-05-15 |
| 31 | isGlobalAdmin ordering ReferenceError risk | access.js | HIGH | **Fixed 2026-05-15** |
| 32 | BackgroundTasks after Form params — SyntaxError | pocs.py | CRITICAL | **Fixed 2026-05-15** |
