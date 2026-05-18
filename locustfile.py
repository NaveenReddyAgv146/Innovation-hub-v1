"""
Innovation Hub — Locust Performance Test Suite
===============================================
Two user classes that mirror real-world traffic distribution:

  ViewerUser  (~70% of load)  Browse, filter, upvote, credits, leaderboard
  AdminUser   (~30% of load)  Review queue, publish, go-live, approve users

─── Quick Start ────────────────────────────────────────────────────────────────
  pip install locust

  # Interactive UI at http://localhost:8089
  locust -f locustfile.py --host=http://localhost:8010

  # Headless / CI mode
  locust -f locustfile.py --host=http://localhost:8010 \
    --users 100 --spawn-rate 10 --run-time 5m --headless \
    --html report.html --csv results

─── Credentials ────────────────────────────────────────────────────────────────
  Fill in the account pools below with real accounts from your database.
  Create at least 2-3 per role so virtual users don't share sessions.
"""

import random
from locust import HttpUser, between, task


# ═══════════════════════════════════════════════════════════════════════════════
#  Test Account Pools — replace with real credentials
# ═══════════════════════════════════════════════════════════════════════════════

VIEWER_ACCOUNTS = [
    {"email": "score.test@agivant.com",    "password": "123456"},
    {"email": "testuser2@agivant.com",     "password": "123456"},
    {"email": "praveen.kumar@agivant.com", "password": "123456"},
    {"email": "sneha.patel@agivant.com",   "password": "123456"},
    {"email": "ananya.iyer@agivant.com",   "password": "123456"},
    {"email": "kavya.reddy@agivant.com",   "password": "123456"},
    {"email": "priya.menon@agivant.com",   "password": "123456"},
    {"email": "arjun.shah@agivant.com",    "password": "123456"},
    {"email": "sanjan.rao2@agivant.com",   "password": "123456"},
    {"email": "user1@agivant.com",         "password": "123456"},
]

ADMIN_ACCOUNTS = [
    {"email": "admin@agivant.com",            "password": "123456"},
    {"email": "solutions.admin@agivant.com",  "password": "123456"},
    {"email": "delivery.admin@agivant.com",   "password": "123456"},
    {"email": "sales.admin@agivant.com",      "password": "123456"},
    {"email": "leadership.admin@agivant.com", "password": "123456"},
    {"email": "learning.admin@agivant.com",   "password": "123456"},
]

# ─── Domain constants (must match backend VALID_TRACKS / VALID_IMPACTS) ────────

TRACKS = [
    "Delivery",
    "GTM/Sales",
    "Learning",
    "Solutions",
    "Organizational Building & Thought Leadership",
]
IMPACTS = ["High", "Medium", "Low"]
COMPLEXITIES = ["High", "Medium", "Low"]
DURATION_UNITS = ["weeks", "months"]
AVAILABILITY_UNITS = ["hours/week", "hours/day"]
SEARCH_KEYWORDS = ["AI", "cloud", "automation", "customer", "delivery", "mobile", "data"]


# ═══════════════════════════════════════════════════════════════════════════════
#  Base Class — handles auth, token refresh, and POC ID seeding
# ═══════════════════════════════════════════════════════════════════════════════

class AuthenticatedUser(HttpUser):
    abstract = True
    _credentials_pool: list[dict] = []

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def on_start(self):
        self.access_token: str = ""
        self.refresh_token: str = ""
        self.user_id: str = ""
        self.user_role: str = ""
        self.poc_ids: list[str] = []

        self._login()
        if self.access_token:
            self._seed_poc_ids()

    # ── Auth helpers ───────────────────────────────────────────────────────────

    def _login(self):
        creds = random.choice(self._credentials_pool)
        with self.client.post(
            "/api/auth/login",
            json={"email": creds["email"], "password": creds["password"]},
            catch_response=True,
            name="POST /api/auth/login",
        ) as resp:
            if resp.status_code == 200:
                body = resp.json()
                self.access_token = body.get("accessToken", "")
                self.refresh_token = body.get("refreshToken", "")
                self.user_id = body.get("user", {}).get("id", "")
                self.user_role = body.get("user", {}).get("role", "")
                resp.success()
            else:
                resp.failure(f"Login failed [{resp.status_code}]: {resp.text[:200]}")

    def _do_token_refresh(self):
        if not self.refresh_token:
            self._login()
            return
        with self.client.post(
            "/api/auth/refresh",
            json={"refreshToken": self.refresh_token},
            catch_response=True,
            name="POST /api/auth/refresh",
        ) as resp:
            if resp.status_code == 200:
                body = resp.json()
                self.access_token = body.get("accessToken", "")
                self.refresh_token = body.get("refreshToken", self.refresh_token)
                resp.success()
            else:
                resp.failure(f"Token refresh failed [{resp.status_code}]")
                self._login()

    def _h(self) -> dict:
        """Return Authorization header dict."""
        return {"Authorization": f"Bearer {self.access_token}"}

    # ── Seed helper ────────────────────────────────────────────────────────────

    def _seed_poc_ids(self, status: str = ""):
        """Fetch up to 50 POC IDs to use in subsequent tasks."""
        url = "/api/pocs?page=1&limit=50"
        if status:
            url += f"&status={status}"
        resp = self.client.get(url, headers=self._h(), name="GET /api/pocs (seed)")
        if resp.status_code == 200:
            pocs = resp.json().get("pocs", [])
            self.poc_ids = [p["id"] for p in pocs if p.get("id")]

    def _rand_poc(self) -> str | None:
        return random.choice(self.poc_ids) if self.poc_ids else None

    # ── Shared task: token refresh ─────────────────────────────────────────────

    @task(1)
    def refresh_token_task(self):
        self._do_token_refresh()

    # ── Shared task: get own profile ───────────────────────────────────────────

    @task(2)
    def get_my_profile(self):
        self.client.get("/api/auth/me", headers=self._h(), name="GET /api/auth/me")

    # ── Shared task: leaderboard ───────────────────────────────────────────────

    @task(3)
    def view_leaderboard(self):
        self.client.get(
            "/api/users/leaderboard",
            headers=self._h(),
            name="GET /api/users/leaderboard",
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  Viewer User  — highest concurrency, read-heavy
# ═══════════════════════════════════════════════════════════════════════════════

class ViewerUser(AuthenticatedUser):
    """
    Viewer role: can browse, filter, upvote, and track credits.
    Represents ~70% of real user traffic — run at the highest user count.
    """
    wait_time = between(1, 4)
    _credentials_pool = VIEWER_ACCOUNTS

    # ── POC List — various filter combinations ─────────────────────────────────

    @task(10)
    def list_pocs_default(self):
        """Unfiltered main list — the most-hit endpoint in the app."""
        page = random.randint(1, 3)
        limit = random.choice([10, 20])
        self.client.get(
            f"/api/pocs?page={page}&limit={limit}",
            headers=self._h(),
            name="GET /api/pocs (default list)",
        )

    @task(5)
    def list_pocs_by_status(self):
        status = random.choice(["published", "live", "finished"])
        self.client.get(
            f"/api/pocs?status={status}&page=1&limit=20",
            headers=self._h(),
            name="GET /api/pocs (filter: status)",
        )

    @task(4)
    def list_pocs_by_track(self):
        track = random.choice(TRACKS)
        self.client.get(
            f"/api/pocs?track={track}&page=1&limit=20",
            headers=self._h(),
            name="GET /api/pocs (filter: track)",
        )

    @task(3)
    def list_pocs_by_impact(self):
        impact = random.choice(IMPACTS)
        self.client.get(
            f"/api/pocs?impact={impact}&page=1&limit=20",
            headers=self._h(),
            name="GET /api/pocs (filter: impact)",
        )

    @task(3)
    def search_pocs(self):
        """Triggers MongoDB $regex full-text search."""
        keyword = random.choice(SEARCH_KEYWORDS)
        self.client.get(
            f"/api/pocs?search={keyword}&page=1&limit=20",
            headers=self._h(),
            name="GET /api/pocs (search)",
        )

    @task(5)
    def view_poc_detail(self):
        poc_id = self._rand_poc()
        if poc_id:
            self.client.get(
                f"/api/pocs/{poc_id}",
                headers=self._h(),
                name="GET /api/pocs/:id",
            )

    @task(2)
    def list_interested_pocs(self):
        self.client.get(
            "/api/pocs?interested=true&page=1&limit=20",
            headers=self._h(),
            name="GET /api/pocs (my interested)",
        )

    @task(2)
    def list_involved_pocs(self):
        self.client.get(
            "/api/pocs?involved=true&page=1&limit=20",
            headers=self._h(),
            name="GET /api/pocs (my involved)",
        )

    @task(1)
    def list_poc_contact_pocs(self):
        self.client.get(
            "/api/pocs?pocContact=true&page=1&limit=20",
            headers=self._h(),
            name="GET /api/pocs (pocContact)",
        )

    @task(2)
    def get_poc_voters(self):
        """List of interested/approved users for a POC."""
        poc_id = self._rand_poc()
        if poc_id:
            self.client.get(
                f"/api/pocs/{poc_id}/voters",
                headers=self._h(),
                name="GET /api/pocs/:id/voters",
            )

    # ── Upvote / Remove Interest ───────────────────────────────────────────────

    @task(2)
    def upvote_poc(self):
        """
        Mark interest in a POC.
        400/403 are expected (already voted, POC not published, etc.) — marked success.
        """
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.post(
                f"/api/pocs/{poc_id}/upvote",
                data={
                    "availabilityValue": str(random.randint(2, 10)),
                    "availabilityUnit": random.choice(AVAILABILITY_UNITS),
                },
                headers=self._h(),
                catch_response=True,
                name="POST /api/pocs/:id/upvote",
            ) as resp:
                if resp.status_code in (200, 201, 400, 403):
                    resp.success()
                else:
                    resp.failure(f"Unexpected [{resp.status_code}]")

    @task(1)
    def remove_upvote(self):
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.delete(
                f"/api/pocs/{poc_id}/upvote",
                headers=self._h(),
                catch_response=True,
                name="DELETE /api/pocs/:id/upvote",
            ) as resp:
                if resp.status_code in (200, 400, 404):
                    resp.success()
                else:
                    resp.failure(f"Unexpected [{resp.status_code}]")

    # ── Credits & Directory ────────────────────────────────────────────────────

    @task(3)
    def view_my_credits(self):
        self.client.get(
            "/api/users/my-credits",
            headers=self._h(),
            name="GET /api/users/my-credits",
        )

    @task(2)
    def search_user_directory(self):
        letter = random.choice(["a", "na", "vi", "ra", "sh", "an"])
        self.client.get(
            f"/api/users/directory?search={letter}",
            headers=self._h(),
            name="GET /api/users/directory",
        )




# ═══════════════════════════════════════════════════════════════════════════════
#  Admin User  — review queue, lifecycle actions, user management
# ═══════════════════════════════════════════════════════════════════════════════

class AdminUser(AuthenticatedUser):
    """
    Admin role: reviews contributions, moves them through the lifecycle,
    manages contributors and users.
    Represents ~10% of traffic — low concurrency but high write load.
    """
    wait_time = between(3, 8)
    _credentials_pool = ADMIN_ACCOUNTS

    def on_start(self):
        super().on_start()
        # Admins need to see drafts and all statuses
        self._seed_poc_ids(status="draft")
        all_poc_resp = self.client.get(
            "/api/pocs?page=1&limit=50",
            headers=self._h(),
            name="GET /api/pocs (seed)",
        )
        if all_poc_resp.status_code == 200:
            all_ids = [p["id"] for p in all_poc_resp.json().get("pocs", []) if p.get("id")]
            self.poc_ids = list(set(self.poc_ids + all_ids))

    # ── Browse All Statuses ────────────────────────────────────────────────────

    @task(5)
    def list_all_pocs(self):
        status = random.choice(["draft", "published", "live", "finished", "cancelled", ""])
        url = "/api/pocs?page=1&limit=20"
        if status:
            url += f"&status={status}"
        self.client.get(url, headers=self._h(), name="GET /api/pocs (admin all)")

    @task(4)
    def view_poc_detail(self):
        poc_id = self._rand_poc()
        if poc_id:
            self.client.get(
                f"/api/pocs/{poc_id}",
                headers=self._h(),
                name="GET /api/pocs/:id",
            )

    @task(3)
    def get_poc_voters(self):
        """Review who's interested in a contribution before approving."""
        poc_id = self._rand_poc()
        if poc_id:
            self.client.get(
                f"/api/pocs/{poc_id}/voters",
                headers=self._h(),
                name="GET /api/pocs/:id/voters",
            )

    @task(2)
    def get_hours_summary(self):
        """Admin hours overview for a contribution."""
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.get(
                f"/api/pocs/{poc_id}/hours-summary",
                headers=self._h(),
                catch_response=True,
                name="GET /api/pocs/:id/hours-summary",
            ) as resp:
                if resp.status_code in (200, 403, 404):
                    resp.success()
                else:
                    resp.failure(f"Unexpected [{resp.status_code}]")

    # ── Lifecycle Actions ──────────────────────────────────────────────────────

    @task(3)
    def publish_poc(self):
        """Move draft → published. 400 if already published/live."""
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.post(
                f"/api/pocs/{poc_id}/publish",
                headers=self._h(),
                catch_response=True,
                name="POST /api/pocs/:id/publish",
            ) as resp:
                if resp.status_code in (200, 400, 403, 404):
                    resp.success()
                else:
                    resp.failure(f"Publish failed [{resp.status_code}]")

    @task(2)
    def go_live_poc(self):
        """Move published → live. Also triggers Power Automate webhook."""
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.post(
                f"/api/pocs/{poc_id}/go-live",
                headers=self._h(),
                catch_response=True,
                name="POST /api/pocs/:id/go-live",
            ) as resp:
                if resp.status_code in (200, 400, 403, 404):
                    resp.success()
                else:
                    resp.failure(f"Go-live failed [{resp.status_code}]")

    @task(1)
    def finish_poc(self):
        """Move live → finished. Awards credits to contributors."""
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.post(
                f"/api/pocs/{poc_id}/finish",
                headers=self._h(),
                catch_response=True,
                name="POST /api/pocs/:id/finish",
            ) as resp:
                if resp.status_code in (200, 400, 403, 404):
                    resp.success()
                else:
                    resp.failure(f"Finish failed [{resp.status_code}]")

    @task(1)
    def mark_poc_draft(self):
        """Revert published/live → draft."""
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.post(
                f"/api/pocs/{poc_id}/mark-draft",
                headers=self._h(),
                catch_response=True,
                name="POST /api/pocs/:id/mark-draft",
            ) as resp:
                if resp.status_code in (200, 400, 403, 404):
                    resp.success()
                else:
                    resp.failure(f"Mark-draft failed [{resp.status_code}]")

    @task(1)
    def cancel_poc(self):
        poc_id = self._rand_poc()
        if poc_id:
            with self.client.post(
                f"/api/pocs/{poc_id}/cancel",
                data={"reason": "Cancelled during load test — safe to ignore."},
                headers=self._h(),
                catch_response=True,
                name="POST /api/pocs/:id/cancel",
            ) as resp:
                if resp.status_code in (200, 400, 403, 404):
                    resp.success()
                else:
                    resp.failure(f"Cancel failed [{resp.status_code}]")

    # ── Contributor Management ─────────────────────────────────────────────────

    @task(1)
    def add_contributor(self):
        """
        Directly add a contributor to a published/live POC.
        Requires a valid viewer user ID — uses own ID as a safe stand-in
        (will 400 if already added, which is fine).
        """
        poc_id = self._rand_poc()
        if poc_id and self.user_id:
            with self.client.post(
                f"/api/pocs/{poc_id}/add-contributor",
                data={"userId": self.user_id},
                headers=self._h(),
                catch_response=True,
                name="POST /api/pocs/:id/add-contributor",
            ) as resp:
                # 400 = already contributor / wrong status; 403 = track mismatch
                if resp.status_code in (200, 400, 403, 404):
                    resp.success()
                else:
                    resp.failure(f"Add contributor failed [{resp.status_code}]")

    # ── User Management ────────────────────────────────────────────────────────

    @task(3)
    def list_users(self):
        self.client.get(
            "/api/users?page=1&limit=20",
            headers=self._h(),
            name="GET /api/users (list)",
        )

    @task(2)
    def search_users(self):
        self.client.get(
            f"/api/users?search={random.choice(['a', 'n', 'v', 'r'])}&page=1&limit=10",
            headers=self._h(),
            name="GET /api/users (search)",
        )

    @task(2)
    def view_user_interests(self):
        """Engagement overview — aggregation query, can be slow at scale."""
        self.client.get(
            "/api/users/interests",
            headers=self._h(),
            name="GET /api/users/interests",
        )

    @task(1)
    def create_test_user(self):
        """
        Creates a viewer account. Each run uses a random suffix to avoid 409 conflicts.
        You may want to clean up test users after runs.
        """
        rand = random.randint(10000, 99999)
        with self.client.post(
            "/api/users",
            json={
                "firstName": "Locust",
                "lastName": f"TestUser{rand}",
                "email": f"locust.test{rand}@agivant.com",
                "employeeId": f"LT{rand}",
                "password": "Locust@Test1234",
                "role": "viewer",
                "band": "B3",
                "adminScope": "track",
                "adminTrack": "",
            },
            headers=self._h(),
            catch_response=True,
            name="POST /api/users (create)",
        ) as resp:
            if resp.status_code in (200, 201, 409):
                resp.success()
            else:
                resp.failure(f"Create user failed [{resp.status_code}]: {resp.text[:200]}")
