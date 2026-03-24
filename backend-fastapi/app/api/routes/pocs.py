import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error as url_error
from urllib import request as url_request

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_admin_track, get_current_user, is_super_admin_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.utils.serialization import serialize_doc

router = APIRouter(prefix="/pocs", tags=["pocs"])
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[3]
UPLOAD_DIR = BASE_DIR / "uploads"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024
VALID_TRACKS = {
    "Solutions",
    "Delivery",
    "Learning",
    "GTM/Sales",
    "Organizational Building & Thought Leadership",
}
VALID_IMPACTS = {"High", "Medium", "Low"}
IMPACT_CREDIT_MAP = {"High": 10, "Medium": 7, "Low": 5}
VALID_ESTIMATED_DURATION_UNITS = {"days", "weeks", "months", "years"}
VALID_AVAILABILITY_UNITS = {"per day", "per week"}
VALID_STATUSES = {"draft", "published", "live", "finished", "cancelled"}
CANCELABLE_STATUSES = {"draft", "published", "live"}
AVAILABILITY_UNIT_ALIASES = {
    "day": "per day",
    "days": "per day",
    "per day": "per day",
    "week": "per week",
    "weeks": "per week",
    "per week": "per week",
}


def enforce_admin_track_access(current_user: dict[str, Any], track: str) -> None:
    if current_user.get("role") != "admin":
        return
    if is_super_admin_user(current_user):
        return
    admin_track = get_admin_track(current_user)
    if not admin_track:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin track assignment is required for this action",
        )
    if track != admin_track:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You can only manage ideas in the {admin_track} track",
        )


def is_point_of_contact_user(poc: dict[str, Any], current_user: dict[str, Any]) -> bool:
    point_of_contact = str(poc.get("pointOfContact") or "").strip()
    if not point_of_contact:
        return False
    user_email = str(current_user.get("email") or "").strip().lower()
    user_name = str(current_user.get("name") or "").strip().lower()
    poc_value = point_of_contact.lower()
    if user_email and poc_value == user_email:
        return True
    if user_name and poc_value == user_name:
        return True
    return False


def parse_tech_stack(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
    except json.JSONDecodeError:
        return []
    return []


def clean_required_text(field_name: str, value: str, max_length: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} is required")
    if len(cleaned) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} cannot exceed {max_length} characters",
        )
    return cleaned


def clean_optional_text(field_name: str, value: str, max_length: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} cannot be empty")
    if len(cleaned) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} cannot exceed {max_length} characters",
        )
    return cleaned


def parse_estimated_duration_value(raw_value: str | None) -> int:
    cleaned = str(raw_value or "").strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Estimated completion time is required",
        )
    if not cleaned.isdigit():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Estimated completion time must be a positive number",
        )
    value = int(cleaned)
    if value <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Estimated completion time must be greater than zero",
        )
    return value


def parse_estimated_duration_unit(raw_value: str | None) -> str:
    cleaned = str(raw_value or "").strip().lower()
    if cleaned not in VALID_ESTIMATED_DURATION_UNITS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Estimated completion unit must be days, weeks, months, or years",
        )
    return cleaned


def parse_availability_value(raw_value: str | None) -> int | None:
    cleaned = str(raw_value or "").strip()
    if not cleaned:
        return None
    if not cleaned.isdigit():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Availability must be a positive number",
        )
    value = int(cleaned)
    if value <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Availability must be greater than zero",
        )
    return value


def parse_availability_unit(raw_value: str | None) -> str | None:
    cleaned = str(raw_value or "").strip().lower()
    if not cleaned:
        return None
    normalized = AVAILABILITY_UNIT_ALIASES.get(cleaned)
    if normalized not in VALID_AVAILABILITY_UNITS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Availability unit must be per day or per week",
        )
    return normalized


async def save_thumbnail(file: UploadFile | None) -> str:
    if not file:
        return ""

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, WebP, and GIF images are allowed",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 5MB")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix or ".bin"
    filename = f"{int(datetime.now(timezone.utc).timestamp() * 1000)}-{os.urandom(4).hex()}{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(content)

    return f"/uploads/{filename}"


async def fetch_poc_or_404(db: AsyncIOMotorDatabase, poc_id: str) -> dict[str, Any]:
    if not ObjectId.is_valid(poc_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POC not found")
    poc = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    if not poc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POC not found")
    return poc


def enforce_owner_or_admin(poc: dict[str, Any], current_user: dict[str, Any]) -> None:
    if current_user["role"] == "developer" and str(poc.get("author")) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only modify your own POCs")


def enrich_vote_info(poc: dict[str, Any], current_user_id: str) -> dict[str, Any]:
    votes = poc.get("votes") or []
    normalized_votes = [str(voter_id) for voter_id in votes]
    poc["votesCount"] = len(normalized_votes)
    poc["hasVoted"] = current_user_id in normalized_votes
    return poc


async def enrich_author_info(db: AsyncIOMotorDatabase, poc: dict[str, Any]) -> dict[str, Any]:
    author_id = poc.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            poc["author"] = serialize_doc(user)
    return poc


def parse_live_at(raw_value: str | None) -> datetime | None:
    cleaned = str(raw_value or "").strip()
    if not cleaned:
        return None
    normalized = cleaned.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid schedule datetime format",
        ) from exc
    if parsed.tzinfo is None:
        local_tz = datetime.now().astimezone().tzinfo or timezone.utc
        parsed = parsed.replace(tzinfo=local_tz)
    return parsed.astimezone(timezone.utc)


def get_actor_id_value(user: dict[str, Any]) -> ObjectId | str | None:
    actor_id_raw = str(user.get("id") or user.get("_id") or "").strip()
    if actor_id_raw and ObjectId.is_valid(actor_id_raw):
        return ObjectId(actor_id_raw)
    if actor_id_raw:
        return actor_id_raw
    return None


async def transition_due_published_to_live(db: AsyncIOMotorDatabase) -> None:
    now = datetime.now(timezone.utc)
    await db.pocs.update_many(
        {
            "status": "published",
            "liveAt": {"$type": "date", "$lte": now},
        },
        {"$set": {"status": "live", "updatedAt": now}},
    )


async def award_finish_credits_once(db: AsyncIOMotorDatabase, poc: dict[str, Any]) -> int:
    poc_id = poc.get("_id")
    if not isinstance(poc_id, ObjectId):
        return 0
    if poc.get("status") != "finished":
        return 0
    if poc.get("creditsAwardedAt"):
        return int(poc.get("creditsAwardedUserCount") or 0)

    credits = IMPACT_CREDIT_MAP.get(str(poc.get("impact") or "").strip())
    if not credits:
        return 0

    approved_user_ids: list[ObjectId] = []
    seen_ids: set[str] = set()
    for value in poc.get("approvedUsers") or []:
        user_id: ObjectId | None = None
        if isinstance(value, ObjectId):
            user_id = value
        elif isinstance(value, str) and ObjectId.is_valid(value):
            user_id = ObjectId(value)
        if user_id and str(user_id) not in seen_ids:
            approved_user_ids.append(user_id)
            seen_ids.add(str(user_id))

    now = datetime.now(timezone.utc)
    award_claim = await db.pocs.update_one(
        {"_id": poc_id, "creditsAwardedAt": {"$exists": False}},
        {
            "$set": {
                "creditsAwardedAt": now,
                "creditsPerUser": credits,
                "creditsAwardedUserCount": len(approved_user_ids),
                "creditsAwardedUserIds": approved_user_ids,
            }
        },
    )
    if award_claim.modified_count == 0:
        return 0

    if approved_user_ids:
        await db.users.update_many(
            {"_id": {"$in": approved_user_ids}},
            {"$inc": {"contributionCredits": credits}, "$set": {"updatedAt": now}},
        )

    return len(approved_user_ids)


def extract_approved_at_for_user(poc: dict[str, Any], user_id: str) -> datetime | None:
    if not user_id:
        return None
    approved_details = poc.get("approvedDetails") or []
    if not isinstance(approved_details, list):
        return None
    for item in approved_details:
        if not isinstance(item, dict):
            continue
        item_user_id = item.get("userId")
        if str(item_user_id) == user_id:
            approved_at = item.get("approvedAt")
            if isinstance(approved_at, datetime):
                if approved_at.tzinfo is None:
                    return approved_at.replace(tzinfo=timezone.utc)
                return approved_at.astimezone(timezone.utc)
    return None


def is_user_approved_for_poc(poc: dict[str, Any], user_id: str) -> bool:
    if not user_id:
        return False
    approved_ids = {str(value) for value in (poc.get("approvedUsers") or [])}
    awarded_ids = {str(value) for value in (poc.get("creditsAwardedUserIds") or [])}
    return user_id in approved_ids or user_id in awarded_ids


def build_current_user_participation(poc: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    if not user_id:
        return None
    if not is_user_approved_for_poc(poc, user_id):
        return None

    approved_at = extract_approved_at_for_user(poc, user_id)
    live_at = poc.get("liveAt") if isinstance(poc.get("liveAt"), datetime) else None
    finished_at = poc.get("finishedAt") if isinstance(poc.get("finishedAt"), datetime) else None
    if isinstance(live_at, datetime):
        live_at = live_at.replace(tzinfo=timezone.utc) if live_at.tzinfo is None else live_at.astimezone(timezone.utc)
    if isinstance(finished_at, datetime):
        finished_at = (
            finished_at.replace(tzinfo=timezone.utc)
            if finished_at.tzinfo is None
            else finished_at.astimezone(timezone.utc)
        )
    now = datetime.now(timezone.utc)

    start_at: datetime | None = None
    if live_at and approved_at:
        start_at = live_at if live_at >= approved_at else approved_at
    elif live_at:
        start_at = live_at
    elif approved_at:
        start_at = approved_at

    if not start_at:
        return {
            "isApproved": True,
            "approvedAt": approved_at,
            "startedAt": None,
            "endedAt": finished_at,
            "elapsedSeconds": 0,
        }

    if finished_at and finished_at >= start_at:
        end_at = finished_at
    else:
        end_at = now
    elapsed_seconds = max(0, int((end_at - start_at).total_seconds()))

    return {
        "isApproved": True,
        "approvedAt": approved_at,
        "startedAt": start_at,
        "endedAt": finished_at if finished_at else None,
        "elapsedSeconds": elapsed_seconds,
    }


def send_live_notification_webhook(payload: dict[str, Any]) -> None:
    webhook_url = settings.power_automate_live_webhook_url.strip()
    if not webhook_url:
        return
    data = json.dumps(payload).encode("utf-8")
    req = url_request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with url_request.urlopen(req, timeout=10) as response:
            if response.status >= 400:
                logger.warning("Power Automate webhook returned status %s", response.status)
    except url_error.URLError as exc:
        logger.warning("Failed to trigger Power Automate webhook: %s", exc)


async def queue_live_notifications(
    db: AsyncIOMotorDatabase,
    poc: dict[str, Any],
    actor: dict[str, Any],
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    webhook_url = settings.power_automate_live_webhook_url.strip()
    if not webhook_url:
        return {"webhookEnabled": False, "notificationsQueued": False, "recipientCount": 0}
    approved_ids = []
    for value in poc.get("approvedUsers") or []:
        if isinstance(value, ObjectId):
            approved_ids.append(value)
        elif isinstance(value, str) and ObjectId.is_valid(value):
            approved_ids.append(ObjectId(value))
    if not approved_ids:
        return {"webhookEnabled": True, "notificationsQueued": False, "recipientCount": 0}
    users = await db.users.find({"_id": {"$in": approved_ids}}, {"name": 1, "email": 1}).to_list(length=len(approved_ids))
    recipients = []
    for user in users:
        email = str(user.get("email") or "").strip()
        if email:
            recipients.append(
                {
                    "id": str(user["_id"]),
                    "name": str(user.get("name") or "").strip(),
                    "email": email,
                }
            )
    if not recipients:
        return {"webhookEnabled": True, "notificationsQueued": False, "recipientCount": 0}
    payload = {
        "eventType": "poc_live",
        "triggeredAt": datetime.now(timezone.utc).isoformat(),
        "poc": {
            "id": str(poc.get("_id")),
            "title": str(poc.get("title") or ""),
            "track": str(poc.get("track") or ""),
            "status": str(poc.get("status") or ""),
            "liveAt": poc.get("liveAt").isoformat() if isinstance(poc.get("liveAt"), datetime) else None,
            "link": f"{settings.client_url.rstrip('/')}/pocs/{poc.get('_id')}",
        },
        "triggeredBy": {
            "id": str(actor.get("id") or actor.get("_id") or ""),
            "name": str(actor.get("name") or ""),
            "email": str(actor.get("email") or ""),
        },
        "recipients": recipients,
    }
    background_tasks.add_task(send_live_notification_webhook, payload)
    return {"webhookEnabled": True, "notificationsQueued": True, "recipientCount": len(recipients)}


@router.get("")
async def get_pocs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = "",
    tag: str = "",
    track: str = "",
    impact: str = "",
    interested: bool = Query(default=False),
    involved: bool = Query(default=False),
    poc_contact: bool = Query(default=False, alias="pocContact"),
    status_filter: str = Query(default="", alias="status"),
    exclude_cancelled: bool = Query(default=False, alias="excludeCancelled"),
    author: str = "",
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query_parts: list[dict[str, Any]] = []

    if search:
        regex = {"$regex": search, "$options": "i"}
        query_parts.append({"$or": [{"title": regex}, {"description": regex}]})

    if tag:
        tags = [item.strip() for item in tag.split(",") if item.strip()]
        if tags:
            query_parts.append({"techStack": {"$in": tags}})

    if track:
        if track not in VALID_TRACKS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid track")
        query_parts.append({"track": track})

    if impact:
        if impact not in VALID_IMPACTS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid impact")
        query_parts.append({"impact": impact})

    current_user_object_id = ObjectId(current_user["id"])
    if interested:
        query_parts.append({"votes": current_user_object_id})
    if involved:
        query_parts.append({"approvedUsers": current_user_object_id})
    if poc_contact:
        email = str(current_user.get("email") or "").strip()
        name = str(current_user.get("name") or "").strip()
        poc_matchers: list[dict[str, Any]] = []
        if email:
            poc_matchers.append({"pointOfContact": {"$regex": f"^{re.escape(email)}$", "$options": "i"}})
        if name:
            poc_matchers.append({"pointOfContact": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if poc_matchers:
            query_parts.append({"$or": poc_matchers})
        else:
            query_parts.append({"pointOfContact": "__no_point_of_contact_match__"})

    if current_user.get("role") == "viewer":
        viewer_id = current_user_object_id
        if poc_contact:
            if status_filter:
                query_parts.append({"status": status_filter})
        elif involved:
            if status_filter == "published":
                query_parts.append({"status": "published"})
            elif status_filter == "live":
                query_parts.append({"status": "live"})
            elif status_filter == "finished":
                query_parts.append({"status": "finished"})
            elif status_filter == "cancelled":
                query_parts.append({"status": "cancelled"})
            else:
                query_parts.append({"status": {"$in": ["published", "live", "finished"]}})
        elif status_filter == "draft":
            query_parts.append({"status": "draft"})
            query_parts.append({"author": viewer_id})
        elif status_filter == "published":
            query_parts.append({"status": {"$in": ["published", "live", "finished"]}})
        elif status_filter == "live":
            query_parts.append({"status": "live"})
        elif status_filter == "finished":
            query_parts.append({"status": "finished"})
        else:
            query_parts.append({"$or": [{"status": {"$in": ["published", "finished"]}}, {"author": viewer_id}]})
    elif status_filter:
        query_parts.append({"status": status_filter})
    elif exclude_cancelled:
        query_parts.append({"status": {"$ne": "cancelled"}})

    if author and ObjectId.is_valid(author):
        query_parts.append({"author": ObjectId(author)})

    if not query_parts:
        query: dict[str, Any] = {}
    elif len(query_parts) == 1:
        query = query_parts[0]
    else:
        query = {"$and": query_parts}

    total = await db.pocs.count_documents(query)
    cursor = db.pocs.find(query).sort("createdAt", -1).skip((page - 1) * limit).limit(limit)
    pocs = await cursor.to_list(length=limit)

    author_ids = [doc.get("author") for doc in pocs if isinstance(doc.get("author"), ObjectId)]
    users_map: dict[str, dict[str, str]] = {}
    if author_ids:
        user_docs = await db.users.find(
            {"_id": {"$in": author_ids}},
            {"name": 1, "email": 1},
        ).to_list(length=len(author_ids))
        users_map = {str(user["_id"]): serialize_doc(user) for user in user_docs}

    serialized = serialize_doc(pocs)
    for poc in serialized:
        author_id = poc.get("author")
        if author_id and author_id in users_map:
            poc["author"] = users_map[author_id]
        enrich_vote_info(poc, current_user["id"])

    return {
        "pocs": serialized,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit,
        },
    }


@router.get("/{poc_id}")
async def get_poc_by_id(
    poc_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    is_poc_contact = is_point_of_contact_user(poc, current_user)
    if (
        current_user.get("role") == "viewer"
        and poc.get("status") not in {"published", "live", "finished"}
        and str(poc.get("author")) != current_user["id"]
        and not is_poc_contact
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this idea yet",
        )
    serialized = serialize_doc(poc)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])
    serialized["currentUserParticipation"] = serialize_doc(build_current_user_participation(poc, current_user["id"]))
    current_user_approved = is_user_approved_for_poc(poc, current_user["id"])
    serialized["currentUserProjectCredits"] = (
        IMPACT_CREDIT_MAP.get(str(poc.get("impact") or "").strip(), 0)
        if current_user_approved and poc.get("status") == "finished"
        else 0
    )

    return {"poc": serialized}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_poc(
    title: str = Form(...),
    description: str = Form(default=""),
    customer: str = Form(...),
    track: str = Form(...),
    pointOfContact: str = Form(default=""),
    customerClassification: str = Form(default="Existing"),
    challenges: str = Form(default=""),
    requestorName: str = Form(default=""),
    impact: str = Form(...),
    estimatedDurationValue: str = Form(...),
    estimatedDurationUnit: str = Form(...),
    liveAt: str | None = Form(default=None),
    techStack: str = Form(default="[]"),
    demoLink: str = Form(default=""),
    repoLink: str = Form(default=""),
    repositoryLink: str = Form(default=""),
    status_value: str = Form(default="draft", alias="status"),
    thumbnail: UploadFile | None = File(default=None),
    current_user=Depends(require_roles("admin", "developer")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if customerClassification not in {"Existing", "New"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid customer classification")

    if status_value not in {"draft", "published"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
    if track not in VALID_TRACKS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid track")
    if impact not in VALID_IMPACTS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid impact")
    enforce_admin_track_access(current_user, track)

    thumbnail_path = await save_thumbnail(thumbnail)
    now = datetime.now(timezone.utc)
    cleaned_title = clean_required_text("Title", title, 200)
    cleaned_customer = clean_required_text("Customer", customer, 300)
    cleaned_challenges = challenges.strip()
    if len(cleaned_challenges) > 5000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Challenges cannot exceed 5000 characters")

    cleaned_description = description.strip() or cleaned_challenges
    if len(cleaned_description) > 5000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Description cannot exceed 5000 characters")

    cleaned_requestor = requestorName.strip() or current_user.get("name", "")
    if len(cleaned_requestor) > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requestor name cannot exceed 100 characters")

    cleaned_repo_link = repositoryLink.strip() or repoLink.strip()
    estimated_duration_value = parse_estimated_duration_value(estimatedDurationValue)
    estimated_duration_unit = parse_estimated_duration_unit(estimatedDurationUnit)
    parsed_live_at = parse_live_at(liveAt)
    cleaned_point_of_contact = pointOfContact.strip().lower() if "@" in pointOfContact else pointOfContact.strip()
    if len(cleaned_point_of_contact) > 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Point of contact cannot exceed 100 characters",
        )

    doc = {
        "title": cleaned_title,
        "description": cleaned_description,
        "customer": cleaned_customer,
        "track": track,
        "pointOfContact": cleaned_point_of_contact,
        "customerClassification": customerClassification,
        "challenges": cleaned_challenges,
        "requestorName": cleaned_requestor,
        "techStack": parse_tech_stack(techStack),
        "demoLink": demoLink.strip(),
        "repoLink": cleaned_repo_link,
        "repositoryLink": cleaned_repo_link,
        "thumbnail": thumbnail_path,
        "status": status_value,
        "impact": impact,
        "estimatedDurationValue": estimated_duration_value,
        "estimatedDurationUnit": estimated_duration_unit,
        "liveAt": parsed_live_at,
        "votes": [],
        "author": ObjectId(current_user["id"]),
        "createdAt": now,
        "updatedAt": now,
    }

    result = await db.pocs.insert_one(doc)
    poc = await db.pocs.find_one({"_id": result.inserted_id})
    serialized = serialize_doc(poc)

    author_doc = await db.users.find_one({"_id": ObjectId(current_user["id"])}, {"name": 1, "email": 1})
    if author_doc:
        serialized["author"] = serialize_doc(author_doc)
    enrich_vote_info(serialized, current_user["id"])

    return {"message": "POC created", "poc": serialized}


@router.put("/{poc_id}")
async def update_poc(
    poc_id: str,
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    customer: str | None = Form(default=None),
    track: str | None = Form(default=None),
    pointOfContact: str | None = Form(default=None),
    customerClassification: str | None = Form(default=None),
    challenges: str | None = Form(default=None),
    requestorName: str | None = Form(default=None),
    impact: str | None = Form(default=None),
    estimatedDurationValue: str | None = Form(default=None),
    estimatedDurationUnit: str | None = Form(default=None),
    liveAt: str | None = Form(default=None),
    techStack: str | None = Form(default=None),
    demoLink: str | None = Form(default=None),
    repoLink: str | None = Form(default=None),
    repositoryLink: str | None = Form(default=None),
    status_value: str | None = Form(default=None, alias="status"),
    thumbnail: UploadFile | None = File(default=None),
    current_user=Depends(require_roles("admin", "developer")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_owner_or_admin(poc, current_user)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))
    if poc.get("status") == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cancelled ideas cannot be edited. Only the canceller can update the cancellation reason.",
        )

    updates: dict[str, Any] = {}
    if title is not None:
        updates["title"] = clean_optional_text("Title", title, 200)
    if description is not None:
        updates["description"] = clean_optional_text("Description", description, 5000)
    if customer is not None:
        updates["customer"] = clean_optional_text("Customer", customer, 300)
    if track is not None:
        if track not in VALID_TRACKS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid track")
        enforce_admin_track_access(current_user, track)
        updates["track"] = track
    if pointOfContact is not None:
        cleaned_poc = pointOfContact.strip().lower() if "@" in pointOfContact else pointOfContact.strip()
        if len(cleaned_poc) > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Point of contact cannot exceed 100 characters",
            )
        updates["pointOfContact"] = cleaned_poc
    if customerClassification is not None:
        if customerClassification not in {"Existing", "New"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid customer classification")
        updates["customerClassification"] = customerClassification
    if challenges is not None:
        updates["challenges"] = clean_optional_text("Challenges", challenges, 5000)
    if requestorName is not None:
        cleaned_requestor = requestorName.strip()
        if len(cleaned_requestor) > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Requestor Name cannot exceed 100 characters",
            )
        updates["requestorName"] = cleaned_requestor
    if impact is not None:
        if impact not in VALID_IMPACTS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid impact")
        updates["impact"] = impact
    if estimatedDurationValue is not None:
        updates["estimatedDurationValue"] = parse_estimated_duration_value(estimatedDurationValue)
    if estimatedDurationUnit is not None:
        updates["estimatedDurationUnit"] = parse_estimated_duration_unit(estimatedDurationUnit)
    if techStack is not None:
        updates["techStack"] = parse_tech_stack(techStack)
    if demoLink is not None:
        updates["demoLink"] = demoLink.strip()
    if repoLink is not None:
        updates["repoLink"] = repoLink.strip()
        updates["repositoryLink"] = repoLink.strip()
    if repositoryLink is not None:
        updates["repositoryLink"] = repositoryLink.strip()
        updates["repoLink"] = repositoryLink.strip()
    if status_value is not None:
        if status_value not in VALID_STATUSES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
        if status_value == "finished":
            if current_user.get("role") != "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only admins can mark an idea as finished",
                )
            if poc.get("status") != "live":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only live ideas can be marked as finished",
                )
        if status_value == "live":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Use Start Live action to move a published contribution to live",
            )
        if status_value == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Use the cancel action with a reason to cancel an idea",
            )
        updates["status"] = status_value
        if status_value == "finished":
            updates["finishedAt"] = datetime.now(timezone.utc)
    if liveAt is not None:
        updates["liveAt"] = parse_live_at(liveAt)

    if thumbnail is not None:
        updates["thumbnail"] = await save_thumbnail(thumbnail)

    if updates:
        updates["updatedAt"] = datetime.now(timezone.utc)
        await db.pocs.update_one({"_id": ObjectId(poc_id)}, {"$set": updates})

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    if status_value == "finished":
        await award_finish_credits_once(db, updated)
        updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])

    return {"message": "POC updated", "poc": serialized}


@router.delete("/{poc_id}")
async def delete_poc(
    poc_id: str,
    current_user=Depends(require_roles("admin", "developer")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_owner_or_admin(poc, current_user)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))

    await db.pocs.find_one_and_delete({"_id": ObjectId(poc_id)})
    return {"message": "POC deleted"}


@router.post("/{poc_id}/publish")
async def publish_poc(
    poc_id: str,
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))
    now = datetime.now(timezone.utc)
    target_status = "published"
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$set": {"status": target_status, "updatedAt": now}},
    )

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])

    return {"message": "POC published", "poc": serialized}


@router.post("/{poc_id}/go-live")
async def go_live_poc(
    poc_id: str,
    background_tasks: BackgroundTasks,
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))
    if poc.get("status") != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only published contributions can be started as live",
        )
    now = datetime.now(timezone.utc)
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$set": {"status": "live", "liveAt": now, "updatedAt": now}},
    )
    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)
    author_id = serialized.get("author")
    author_id_str = author_id if isinstance(author_id, str) else ""
    if author_id_str and ObjectId.is_valid(author_id_str):
        user = await db.users.find_one({"_id": ObjectId(author_id_str)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    notification_state = await queue_live_notifications(db, updated, current_user, background_tasks)
    enrich_vote_info(serialized, current_user["id"])
    return {"message": "Contribution is now live", "poc": serialized, **notification_state}


@router.post("/{poc_id}/finish")
async def finish_poc(
    poc_id: str,
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    admin_track = get_admin_track(current_user)
    poc_track = str(poc.get("track") or "")
    if admin_track and poc_track != admin_track:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This innovation belongs to the {poc_track} track. You can only mark {admin_track} track innovations as finished.",
        )
    if poc.get("status") != "live":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only live ideas can be marked as finished",
        )

    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$set": {"status": "finished", "finishedAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc)}},
    )

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    awarded_count = await award_finish_credits_once(db, updated)
    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])

    if awarded_count > 0:
        return {
            "message": "POC marked as finished and credits awarded",
            "creditsAwarded": IMPACT_CREDIT_MAP.get(str(updated.get("impact") or ""), 0),
            "usersAwarded": awarded_count,
            "poc": serialized,
        }
    return {"message": "POC marked as finished", "poc": serialized}


@router.post("/{poc_id}/mark-draft")
async def mark_poc_as_draft(
    poc_id: str,
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))
    if poc.get("status") not in {"published", "live"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only published or live ideas can be moved to draft",
        )

    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$set": {"status": "draft", "updatedAt": datetime.now(timezone.utc)}},
    )

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])

    return {"message": "POC moved to draft", "poc": serialized}


@router.post("/{poc_id}/cancel")
async def cancel_poc(
    poc_id: str,
    reason: str = Form(...),
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))

    if poc.get("status") not in CANCELABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft, published, or live ideas can be cancelled",
        )

    cancel_reason = clean_required_text("Cancellation reason", reason, 1000)
    now = datetime.now(timezone.utc)
    cancelled_by_value = get_actor_id_value(current_user)
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$set": {
                "status": "cancelled",
                "cancelReason": cancel_reason,
                "cancelledAt": now,
                "cancelledBy": cancelled_by_value,
                "updatedAt": now,
            }
        },
    )

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)
    await enrich_author_info(db, serialized)
    enrich_vote_info(serialized, current_user["id"])
    return {"message": "POC cancelled", "poc": serialized}


@router.post("/{poc_id}/cancel-reason")
async def update_cancel_reason(
    poc_id: str,
    reason: str = Form(...),
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))

    if poc.get("status") != "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cancellation reason can only be edited for cancelled ideas",
        )

    current_actor_id = get_actor_id_value(current_user)
    existing_canceller = poc.get("cancelledBy")
    if str(existing_canceller) != str(current_actor_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the admin who cancelled this idea can edit the cancellation reason",
        )

    cancel_reason = clean_required_text("Cancellation reason", reason, 1000)
    now = datetime.now(timezone.utc)
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$set": {"cancelReason": cancel_reason, "updatedAt": now}},
    )

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)
    await enrich_author_info(db, serialized)
    enrich_vote_info(serialized, current_user["id"])
    return {"message": "Cancellation reason updated", "poc": serialized}


@router.post("/{poc_id}/upvote")
async def upvote_poc(
    poc_id: str,
    availabilityValue: str | None = Form(default=None),
    availabilityUnit: str | None = Form(default=None),
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    if poc.get("status") != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only published ideas can be marked as interested. Interest is not allowed once an idea becomes live.",
        )
    if current_user.get("role") == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot mark interest on ideas",
        )
    if str(poc.get("author")) == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Idea owners cannot mark interest on their own ideas",
        )

    current_user_id = ObjectId(current_user["id"])
    approved_user_ids = {str(user_id) for user_id in (poc.get("approvedUsers") or [])}
    if str(current_user_id) in approved_user_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are already approved for this contribution and cannot edit availability",
        )
    availability_value = parse_availability_value(availabilityValue)
    availability_unit = parse_availability_unit(availabilityUnit)
    if (availability_value is None) != (availability_unit is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please provide both availability value and unit",
        )
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$addToSet": {"votes": current_user_id},
            "$pull": {"interestDetails": {"userId": current_user_id}},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
    )
    if availability_value is not None and availability_unit is not None:
        await db.pocs.update_one(
            {"_id": ObjectId(poc_id)},
            {
                "$push": {
                    "interestDetails": {
                        "userId": current_user_id,
                        "availabilityValue": availability_value,
                        "availabilityUnit": availability_unit,
                    }
                }
            },
        )
    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)
    await enrich_author_info(db, serialized)
    enrich_vote_info(serialized, current_user["id"])
    return {"message": "Interest added", "poc": serialized}


@router.delete("/{poc_id}/upvote")
async def remove_upvote_poc(
    poc_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    if current_user.get("role") == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot remove interest on ideas",
        )
    if str(poc.get("author")) == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Idea owners cannot remove interest on their own ideas",
        )
    current_user_id = ObjectId(current_user["id"])
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$pull": {
                "votes": current_user_id,
                "interestDetails": {"userId": current_user_id},
                "approvedUsers": current_user_id,
            },
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
    )
    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)
    await enrich_author_info(db, serialized)
    enrich_vote_info(serialized, current_user["id"])
    return {"message": "Interest removed", "poc": serialized}


@router.get("/{poc_id}/voters")
async def get_poc_voters(
    poc_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    is_owner = str(poc.get("author")) == current_user["id"]
    is_admin = current_user.get("role") == "admin"
    is_poc_contact = is_point_of_contact_user(poc, current_user)
    current_user_id = current_user["id"]
    approved_ids = {str(user_id) for user_id in (poc.get("approvedUsers") or [])}
    is_approved_member = current_user_id in approved_ids
    if not is_admin and not is_owner and not is_approved_member and not is_poc_contact:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    target_ids: list[ObjectId] = []
    source_ids = poc.get("votes") or []
    if is_approved_member and not is_admin and not is_owner and not is_poc_contact:
        # Teammate view: show only approved users list.
        source_ids = poc.get("approvedUsers") or []
    for raw_id in source_ids:
        if isinstance(raw_id, ObjectId):
            target_ids.append(raw_id)
        elif isinstance(raw_id, str) and ObjectId.is_valid(raw_id):
            target_ids.append(ObjectId(raw_id))
    if not target_ids:
        return {"voters": []}

    availability_map = {}
    for item in poc.get("interestDetails") or []:
        user_id = item.get("userId")
        if isinstance(user_id, ObjectId):
            availability_map[str(user_id)] = {
                "availabilityValue": item.get("availabilityValue"),
                "availabilityUnit": item.get("availabilityUnit"),
            }
    approved_at_map = {}
    for item in poc.get("approvedDetails") or []:
        user_id = item.get("userId")
        if isinstance(user_id, ObjectId):
            approved_at_map[str(user_id)] = item.get("approvedAt")

    voters = await db.users.find(
        {"_id": {"$in": target_ids}},
        {"name": 1, "email": 1, "role": 1},
    ).to_list(length=len(target_ids))
    serialized_voters = serialize_doc(voters)
    for voter in serialized_voters:
        availability = availability_map.get(voter["_id"], {})
        voter["availabilityValue"] = availability.get("availabilityValue")
        voter["availabilityUnit"] = availability.get("availabilityUnit")
        voter["isApproved"] = voter["_id"] in approved_ids
        voter["approvedAt"] = approved_at_map.get(voter["_id"])
    return {"voters": serialized_voters}


@router.post("/{poc_id}/approve-user")
async def approve_poc_user(
    poc_id: str,
    userId: str = Form(...),
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))

    if not ObjectId.is_valid(userId):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid user id")
    target_user_id = ObjectId(userId)
    vote_ids = {str(vote_id) for vote_id in (poc.get("votes") or [])}
    if str(target_user_id) not in vote_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only interested users can be approved",
        )

    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$addToSet": {"approvedUsers": target_user_id},
            "$pull": {"approvedDetails": {"userId": target_user_id}},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
    )
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$push": {
                "approvedDetails": {
                    "userId": target_user_id,
                    "approvedAt": datetime.now(timezone.utc),
                }
            }
        },
    )
    return {"message": "User approved"}


@router.post("/{poc_id}/unapprove-user")
async def unapprove_poc_user(
    poc_id: str,
    userId: str = Form(...),
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))

    if not ObjectId.is_valid(userId):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid user id")
    target_user_id = ObjectId(userId)
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$pull": {"approvedUsers": target_user_id, "approvedDetails": {"userId": target_user_id}},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
    )
    return {"message": "User unapproved"}


@router.post("/{poc_id}/admin-feedback")
async def add_admin_feedback(
    poc_id: str,
    userId: str = Form(...),
    feedback: str = Form(...),
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_admin_track_access(current_user, str(poc.get("track") or ""))
    if poc.get("status") != "finished":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin performance feedback can only be added for finished contributions",
        )
    if not ObjectId.is_valid(userId):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid user id")

    target_user_id = ObjectId(userId)
    approved_ids = {str(value) for value in (poc.get("approvedUsers") or [])}
    awarded_ids = {str(value) for value in (poc.get("creditsAwardedUserIds") or [])}
    if str(target_user_id) not in approved_ids and str(target_user_id) not in awarded_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feedback can only be added for approved users on this contribution",
        )

    target_user = await db.users.find_one({"_id": target_user_id}, {"name": 1, "email": 1})
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    cleaned_feedback = clean_required_text("Feedback", feedback, 2000)
    now = datetime.now(timezone.utc)
    given_by_id = get_actor_id_value(current_user)
    feedback_doc = {
        "userId": target_user_id,
        "userName": str(target_user.get("name") or "").strip(),
        "userEmail": str(target_user.get("email") or "").strip(),
        "feedback": cleaned_feedback,
        "givenById": given_by_id,
        "givenByName": str(current_user.get("name") or "").strip(),
        "givenByEmail": str(current_user.get("email") or "").strip(),
        "createdAt": now,
        "updatedAt": now,
    }
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$pull": {"adminFeedbacks": {"userId": target_user_id, "givenById": given_by_id}},
            "$set": {"updatedAt": now},
        },
    )
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$push": {"adminFeedbacks": feedback_doc}},
    )
    return {"message": "Admin feedback saved"}


@router.post("/{poc_id}/user-feedback")
async def add_user_feedback(
    poc_id: str,
    feedback: str = Form(...),
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    if poc.get("status") != "finished":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project feedback can only be added for finished contributions",
        )
    if not ObjectId.is_valid(current_user.get("id", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    current_user_id = ObjectId(current_user["id"])
    approved_ids = {str(value) for value in (poc.get("approvedUsers") or [])}
    awarded_ids = {str(value) for value in (poc.get("creditsAwardedUserIds") or [])}
    if str(current_user_id) not in approved_ids and str(current_user_id) not in awarded_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved users can add feedback for this contribution",
        )

    cleaned_feedback = clean_required_text("Feedback", feedback, 2000)
    now = datetime.now(timezone.utc)
    feedback_doc = {
        "userId": current_user_id,
        "userName": str(current_user.get("name") or "").strip(),
        "userEmail": str(current_user.get("email") or "").strip(),
        "feedback": cleaned_feedback,
        "createdAt": now,
        "updatedAt": now,
    }
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$pull": {"userFeedbacks": {"userId": current_user_id}},
            "$set": {"updatedAt": now},
        },
    )
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$push": {"userFeedbacks": feedback_doc}},
    )
    return {"message": "Your feedback has been saved"}
