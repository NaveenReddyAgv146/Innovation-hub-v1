from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_admin_track, get_current_user, require_roles, require_super_admin
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.schemas.auth import compose_full_name
from app.schemas.user import CreateUserRequest, UpdateUserRequest
from app.utils.serialization import serialize_doc

router = APIRouter(prefix="/users", tags=["users"])
VALID_TRACKS = {
    "Solutions",
    "Delivery",
    "Learning",
    "GTM/Sales",
    "Organizational Building & Thought Leadership",
}


def _normalize_datetime(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _extract_approved_at_for_user(poc: dict[str, Any], user_id: str) -> datetime | None:
    approved_details = poc.get("approvedDetails") or []
    if not isinstance(approved_details, list):
        return None
    for item in approved_details:
        if not isinstance(item, dict):
            continue
        if str(item.get("userId")) != user_id:
            continue
        return _normalize_datetime(item.get("approvedAt"))
    return None


def _elapsed_seconds_for_finished_contribution(poc: dict[str, Any], user_id: str) -> int:
    live_at = _normalize_datetime(poc.get("liveAt"))
    finished_at = _normalize_datetime(poc.get("finishedAt"))
    approved_at = _extract_approved_at_for_user(poc, user_id)
    if not finished_at:
        return 0
    if live_at and approved_at:
        start_at = live_at if live_at >= approved_at else approved_at
    else:
        start_at = live_at or approved_at
    if not start_at:
        return 0
    return max(0, int((finished_at - start_at).total_seconds()))


def _harmonic_mean(a: float, b: float) -> float:
    if a <= 0 or b <= 0:
        return 0.0
    return (2.0 * a * b) / (a + b)


def validate_admin_track(role: str, email: str, admin_scope: str | None, admin_track: str | None) -> str | None:
    normalized_email = email.strip().lower()
    normalized_track = admin_track.strip() if isinstance(admin_track, str) else None
    normalized_scope = admin_scope.strip().lower() if isinstance(admin_scope, str) else None
    if role == "admin":
        if normalized_email == settings.super_admin_email.strip().lower():
            return None
        inferred_scope = normalized_scope or ("track" if normalized_track else "global")
        if inferred_scope == "global":
            return None
        if not normalized_track:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Admin track is required for admin users",
            )
        return normalized_track
    return None


@router.get("")
async def get_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = "",
    _admin=Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {}
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [{"name": regex}, {"email": regex}]

    total = await db.users.count_documents(query)
    cursor = (
        db.users.find(query, {"password": 0, "refreshToken": 0})
        .sort("createdAt", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    users = await cursor.to_list(length=limit)

    return {
        "users": serialize_doc(users),
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit,
        },
    }


@router.get("/interests")
async def get_user_interests(
    search: str = "",
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    admin_track = get_admin_track(current_user)
    pipeline: list[dict] = [
        {
            "$match": {
                "status": {"$in": ["published", "live", "finished"]},
                "$or": [{"votes.0": {"$exists": True}}, {"interestDetails.0": {"$exists": True}}],
            }
        },
    ]

    if admin_track:
        pipeline.append({"$match": {"track": admin_track}})

    pipeline.extend([
        {
            "$addFields": {
                "interestEntries": {
                    "$cond": [
                        {"$gt": [{"$size": {"$ifNull": ["$interestDetails", []]}}, 0]},
                        "$interestDetails",
                        {
                            "$map": {
                                "input": {"$ifNull": ["$votes", []]},
                                "as": "voteUser",
                                "in": {
                                    "userId": "$$voteUser",
                                    "availabilityValue": None,
                                    "availabilityUnit": None,
                                },
                            }
                        },
                    ]
                }
            }
        },
        {"$unwind": "$interestEntries"},
        {
            "$group": {
                "_id": "$interestEntries.userId",
                "interestedCount": {"$sum": 1},
                "projects": {
                    "$push": {
                        "_id": {"$toString": "$_id"},
                        "title": "$title",
                        "track": "$track",
                        "status": "$status",
                        "updatedAt": "$updatedAt",
                        "availabilityValue": "$interestEntries.availabilityValue",
                        "availabilityUnit": "$interestEntries.availabilityUnit",
                    }
                },
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "_id",
                "foreignField": "_id",
                "as": "user",
            }
        },
        {"$unwind": "$user"},
    ])

    if search:
        regex = {"$regex": search, "$options": "i"}
        pipeline.append({"$match": {"$or": [{"user.name": regex}, {"user.email": regex}]}})

    pipeline.extend(
        [
            {
                "$project": {
                    "_id": 0,
                    "user": {
                        "_id": {"$toString": "$user._id"},
                        "name": "$user.name",
                        "email": "$user.email",
                        "role": "$user.role",
                        "employeeId": {"$ifNull": ["$user.employeeId", ""]},
                    },
                    "interestedCount": 1,
                    "projects": 1,
                }
            },
            {"$sort": {"interestedCount": -1, "user.name": 1}},
        ]
    )

    rows = await db.pocs.aggregate(pipeline).to_list(length=None)
    return {"users": rows}


@router.get("/leaderboard")
async def get_contribution_leaderboard(
    limit: int = Query(default=10, ge=1, le=100),
    track: str = Query(default=""),
    sortBy: str = Query(default="rank"),
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    admin_track = get_admin_track(current_user)
    requested_track = track.strip()
    requested_track_normalized = requested_track.lower()
    requested_all_tracks = requested_track_normalized == "all"
    if requested_track and not requested_all_tracks and requested_track not in VALID_TRACKS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid track")
    sort_by = sortBy.strip().lower()
    if sort_by not in {"rank", "credits", "finished"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid sortBy")
    if requested_all_tracks:
        effective_track = ""
    else:
        effective_track = requested_track or admin_track
    impact_credits = {"High": 10, "Medium": 7, "Low": 5}
    query: dict[str, Any] = {"status": "finished"}
    if effective_track:
        query["track"] = effective_track

    pocs = await db.pocs.find(
        query,
        {
            "impact": 1,
            "approvedUsers": 1,
            "approvedDetails": 1,
            "creditsAwardedUserIds": 1,
            "liveAt": 1,
            "finishedAt": 1,
        },
    ).to_list(length=None)

    aggregates: dict[str, dict[str, Any]] = {}
    user_object_ids: set[ObjectId] = set()
    for poc in pocs:
        impact = str(poc.get("impact") or "").strip()
        credits = impact_credits.get(impact, 0)
        awarded_ids = poc.get("creditsAwardedUserIds") or []
        approved_ids = poc.get("approvedUsers") or []
        source_ids = awarded_ids if awarded_ids else approved_ids
        seen_in_poc: set[str] = set()
        for value in source_ids:
            user_obj_id: ObjectId | None = None
            if isinstance(value, ObjectId):
                user_obj_id = value
            elif isinstance(value, str) and ObjectId.is_valid(value):
                user_obj_id = ObjectId(value)
            if not user_obj_id:
                continue
            user_id_str = str(user_obj_id)
            if user_id_str in seen_in_poc:
                continue
            seen_in_poc.add(user_id_str)
            user_object_ids.add(user_obj_id)
            row = aggregates.setdefault(
                user_id_str,
                {
                    "userId": user_obj_id,
                    "totalImpactCredits": 0,
                    "finishedContributions": 0,
                    "highImpactCount": 0,
                    "mediumImpactCount": 0,
                    "lowImpactCount": 0,
                    "totalHoursSpent": 0.0,
                },
            )
            row["totalImpactCredits"] += credits
            row["finishedContributions"] += 1
            if impact == "High":
                row["highImpactCount"] += 1
            elif impact == "Medium":
                row["mediumImpactCount"] += 1
            elif impact == "Low":
                row["lowImpactCount"] += 1
            elapsed_seconds = _elapsed_seconds_for_finished_contribution(poc, user_id_str)
            row["totalHoursSpent"] += elapsed_seconds / 3600.0

    if not aggregates:
        return {
            "leaderboard": [],
            "creditRules": impact_credits,
            "scope": effective_track or "all",
        }

    user_docs = await db.users.find(
        {"_id": {"$in": list(user_object_ids)}},
        {"name": 1, "email": 1, "role": 1, "employeeId": 1},
    ).to_list(length=len(user_object_ids))
    users_by_id = {str(doc["_id"]): doc for doc in user_docs}

    rows: list[dict[str, Any]] = []
    for key, row in aggregates.items():
        user_doc = users_by_id.get(key)
        if not user_doc:
            continue
        total_impact_credits = int(row["totalImpactCredits"])
        total_hours = float(row["totalHoursSpent"])
        harmonic_score = _harmonic_mean(float(total_impact_credits), total_hours)
        credits_gained = round(harmonic_score, 2)
        rows.append(
            {
                "user": {
                    "_id": str(user_doc["_id"]),
                    "name": user_doc.get("name"),
                    "email": user_doc.get("email"),
                    "role": user_doc.get("role"),
                    "employeeId": user_doc.get("employeeId", ""),
                },
                "totalCredits": credits_gained,
                "impactCreditsBase": total_impact_credits,
                "totalHoursSpent": round(total_hours, 2),
                "finishedContributions": int(row["finishedContributions"]),
                "highImpactCount": int(row["highImpactCount"]),
                "mediumImpactCount": int(row["mediumImpactCount"]),
                "lowImpactCount": int(row["lowImpactCount"]),
            }
        )

    if sort_by == "credits":
        rows.sort(key=lambda item: (item["totalCredits"], item["finishedContributions"], item["totalHoursSpent"]), reverse=True)
    elif sort_by == "finished":
        rows.sort(key=lambda item: (item["finishedContributions"], item["totalCredits"], item["totalHoursSpent"]), reverse=True)
    else:
        rows.sort(key=lambda item: (item["totalCredits"], item["finishedContributions"], item["totalHoursSpent"]), reverse=True)

    rows = rows[:limit]
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return {
        "leaderboard": rows,
        "creditRules": impact_credits,
        "scope": effective_track or "all",
    }


@router.get("/directory")
async def get_user_directory(
    search: str = Query(default=""),
    limit: int = Query(default=10, ge=1, le=25),
    _current_user=Depends(require_roles("admin", "developer")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cleaned_search = search.strip()
    query: dict = {}
    if cleaned_search:
        regex = {"$regex": cleaned_search, "$options": "i"}
        query = {"$or": [{"name": regex}, {"email": regex}]}

    users = await db.users.find(
        query,
        {"name": 1, "email": 1, "role": 1, "adminTrack": 1},
    ).limit(limit).to_list(length=limit)
    serialized = serialize_doc(users)

    def rank(item: dict) -> tuple[int, str]:
        role = str(item.get("role") or "")
        priority = 0 if role == "admin" else 1
        return (priority, str(item.get("name") or "").lower())

    serialized.sort(key=rank)
    return {"users": serialized}


@router.get("/my-credits")
async def get_my_credits(
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(current_user.get("id", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    current_user_id = ObjectId(current_user["id"])
    current_user_id_str = str(current_user_id)
    impact_credits = {"High": 10, "Medium": 7, "Low": 5}

    pocs = await db.pocs.find(
        {
            "status": "finished",
            "$or": [
                {"approvedUsers": current_user_id},
                {"creditsAwardedUserIds": current_user_id},
            ],
        },
        {
            "track": 1,
            "impact": 1,
            "approvedDetails": 1,
            "liveAt": 1,
            "finishedAt": 1,
        },
    ).to_list(length=None)

    track_map: dict[str, dict[str, Any]] = {}
    for poc in pocs:
        track = str(poc.get("track") or "").strip() or "Unknown"
        impact = str(poc.get("impact") or "").strip()
        impact_credit = impact_credits.get(impact, 0)
        elapsed_seconds = _elapsed_seconds_for_finished_contribution(poc, current_user_id_str)
        hours_spent = elapsed_seconds / 3600.0
        harmonic_credit = _harmonic_mean(float(impact_credit), hours_spent)

        row = track_map.setdefault(
            track,
            {
                "track": track,
                "credits": 0.0,
                "finishedContributions": 0,
                "highImpactCount": 0,
                "mediumImpactCount": 0,
                "lowImpactCount": 0,
            },
        )
        row["credits"] += harmonic_credit
        row["finishedContributions"] += 1
        if impact == "High":
            row["highImpactCount"] += 1
        elif impact == "Medium":
            row["mediumImpactCount"] += 1
        elif impact == "Low":
            row["lowImpactCount"] += 1

    rows = list(track_map.values())
    for row in rows:
        row["credits"] = round(float(row["credits"]), 2)
    rows.sort(key=lambda row: (float(row.get("credits") or 0), int(row.get("finishedContributions") or 0), str(row.get("track") or "")), reverse=True)

    total_credits = round(sum(float(row.get("credits") or 0) for row in rows), 2)
    total_finished = sum(int(row.get("finishedContributions") or 0) for row in rows)

    return {
        "summary": {
            "totalCredits": total_credits,
            "finishedContributions": total_finished,
            "tracksContributed": len(rows),
        },
        "creditRules": impact_credits,
        "tracks": rows,
    }


@router.get("/{user_id}")
async def get_user_by_id(
    user_id: str,
    _admin=Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password": 0, "refreshToken": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {"user": serialize_doc(user)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    _admin=Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    now = datetime.now(timezone.utc)
    first_name = payload.firstName.strip()
    last_name = payload.lastName.strip()
    admin_track = validate_admin_track(payload.role, payload.email, payload.adminScope, payload.adminTrack)
    doc = {
        "firstName": first_name,
        "lastName": last_name,
        "name": compose_full_name(first_name, last_name),
        "email": payload.email.lower(),
        "employeeId": payload.employeeId,
        "password": hash_password(payload.password),
        "role": payload.role,
        "adminTrack": admin_track,
        "contributionCredits": 0,
        "refreshToken": None,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": result.inserted_id}, {"password": 0, "refreshToken": 0})

    return {"message": "User created", "user": serialize_doc(user)}


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    _admin=Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not existing_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    updates = payload.model_dump(exclude_none=True)
    if "firstName" in updates:
        updates["firstName"] = updates["firstName"].strip()
    if "lastName" in updates:
        updates["lastName"] = updates["lastName"].strip()
    if "email" in updates:
        updates["email"] = updates["email"].lower()
        email_owner = await db.users.find_one({"email": updates["email"]})
        if email_owner and str(email_owner["_id"]) != user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    if "firstName" in updates or "lastName" in updates:
        first_name = updates.get("firstName", existing_user.get("firstName") or "")
        last_name = updates.get("lastName", existing_user.get("lastName") or "")
        if not first_name and existing_user.get("name"):
            parts = existing_user["name"].strip().split(" ", 1)
            first_name = parts[0]
            if not last_name and len(parts) > 1:
                last_name = parts[1]
        updates["firstName"] = first_name
        updates["lastName"] = last_name
        updates["name"] = compose_full_name(first_name, last_name)

    if "password" in updates:
        updates["password"] = hash_password(updates["password"])

    target_role = updates.get("role", existing_user.get("role"))
    target_employee_id = updates.get("employeeId", existing_user.get("employeeId"))
    target_email = updates.get("email", existing_user.get("email", ""))
    target_admin_scope = updates.get("adminScope")
    if target_admin_scope is None:
        target_admin_scope = "track" if existing_user.get("adminTrack") else "global"
    target_admin_track = updates.get("adminTrack", existing_user.get("adminTrack"))
    if target_role == "viewer" and not target_employee_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Employee ID is required for viewer users",
        )
    updates["adminTrack"] = validate_admin_track(target_role, target_email, target_admin_scope, target_admin_track)
    updates.pop("adminScope", None)

    if updates:
        updates["updatedAt"] = datetime.now(timezone.utc)
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})

    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password": 0, "refreshToken": 0})
    return {"message": "User updated", "user": serialize_doc(user)}


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    _admin=Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    deleted = await db.users.find_one_and_delete({"_id": ObjectId(user_id)}, projection={"password": 0, "refreshToken": 0})
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {"message": "User deleted"}
