from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenError(Exception):
    pass


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def _create_token(subject: str, token_type: str, expires_delta: timedelta, secret: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def create_access_token(user_id: str) -> str:
    return _create_token(
        user_id,
        "access",
        timedelta(minutes=settings.jwt_access_expiry_minutes),
        settings.jwt_access_secret,
    )


def create_refresh_token(user_id: str) -> str:
    return _create_token(
        user_id,
        "refresh",
        timedelta(days=settings.jwt_refresh_expiry_days),
        settings.jwt_refresh_secret,
    )


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])
        if payload.get("type") != "access":
            raise TokenError("Invalid access token")
        return payload
    except JWTError as exc:
        raise TokenError("Invalid access token") from exc


def decode_refresh_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise TokenError("Invalid refresh token")
        return payload
    except JWTError as exc:
        raise TokenError("Invalid refresh token") from exc
