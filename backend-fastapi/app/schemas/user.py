from typing import Literal

from pydantic import BaseModel, EmailStr, Field


Role = Literal["admin", "developer", "viewer"]


class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6)
    role: Role = "viewer"


class UpdateUserRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6)
    role: Role | None = None
