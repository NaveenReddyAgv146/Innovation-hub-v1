from typing import Callable

from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.core.security import TokenError, decode_access_token
from app.core.config import settings
from app.utils.serialization import serialize_doc

security = HTTPBearer(auto_error=False)


def is_super_admin_user(user: dict | None) -> bool:
    if not user:
        return False
    return str(user.get("email", "")).strip().lower() == settings.super_admin_email.strip().lower()


def get_admin_track(user: dict | None) -> str:
    if not user or user.get("role") != "admin":
        return ""
    return str(user.get("adminTrack") or "").strip()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized") from exc

    user_id = payload.get("sub")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    return serialize_doc(user_doc)


def require_roles(*roles: str) -> Callable:
    async def role_dependency(current_user=Depends(get_current_user)):
        if current_user.get("role") not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return current_user

    return role_dependency


async def require_super_admin(current_user=Depends(get_current_user)):
    if not is_super_admin_user(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return current_user
