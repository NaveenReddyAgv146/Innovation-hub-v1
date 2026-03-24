from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest
from app.schemas.auth import compose_full_name
from app.utils.serialization import serialize_doc

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
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
        "employeeId": payload.employeeId.strip(),
        "password": hash_password(payload.password),
        "role": "viewer",
        "contributionCredits": 0,
        "refreshToken": None,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": result.inserted_id}, {"password": 0, "refreshToken": 0})

    return {"message": "Registration successful", "user": serialize_doc(user)}


@router.post("/login")
async def login(payload: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    user_id = str(user["_id"])
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)

    await db.users.update_one({"_id": user["_id"]}, {"$set": {"refreshToken": refresh_token}})
    user.pop("password", None)
    user.pop("refreshToken", None)

    return {
        "message": "Login successful",
        "user": serialize_doc(user),
        "accessToken": access_token,
        "refreshToken": refresh_token,
    }


@router.post("/refresh")
async def refresh(payload: RefreshRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    try:
        token_payload = decode_refresh_token(payload.refreshToken)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    user_id = token_payload.get("sub")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user or user.get("refreshToken") != payload.refreshToken:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)

    await db.users.update_one({"_id": user["_id"]}, {"$set": {"refreshToken": refresh_token}})

    return {"accessToken": access_token, "refreshToken": refresh_token}


@router.post("/logout")
async def logout(current_user=Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.users.update_one({"_id": ObjectId(current_user["id"])}, {"$set": {"refreshToken": None}})
    return {"message": "Logged out successfully"}


@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    current_user.pop("password", None)
    current_user.pop("refreshToken", None)
    return {"user": current_user}
