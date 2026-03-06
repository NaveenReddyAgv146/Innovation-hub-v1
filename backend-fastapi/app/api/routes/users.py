from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import require_roles
from app.core.database import get_db
from app.core.security import hash_password
from app.schemas.auth import compose_full_name
from app.schemas.user import CreateUserRequest, UpdateUserRequest
from app.utils.serialization import serialize_doc

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def get_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = "",
    _admin=Depends(require_roles("admin")),
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


@router.get("/{user_id}")
async def get_user_by_id(
    user_id: str,
    _admin=Depends(require_roles("admin")),
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
    _admin=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    now = datetime.now(timezone.utc)
    first_name = payload.firstName.strip()
    last_name = payload.lastName.strip()
    doc = {
        "firstName": first_name,
        "lastName": last_name,
        "name": compose_full_name(first_name, last_name),
        "email": payload.email.lower(),
        "password": hash_password(payload.password),
        "role": payload.role,
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
    _admin=Depends(require_roles("admin")),
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

    if updates:
        updates["updatedAt"] = datetime.now(timezone.utc)
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})

    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password": 0, "refreshToken": 0})
    return {"message": "User updated", "user": serialize_doc(user)}


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    _admin=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    deleted = await db.users.find_one_and_delete({"_id": ObjectId(user_id)}, projection={"password": 0, "refreshToken": 0})
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {"message": "User deleted"}
