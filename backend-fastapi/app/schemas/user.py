from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.auth import normalize_name_part, validate_agivant_email


Role = Literal["admin", "developer", "viewer"]


class CreateUserRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=50)
    lastName: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6)
    role: Role = "viewer"

    @field_validator("firstName")
    @classmethod
    def validate_first_name(cls, value: str) -> str:
        return normalize_name_part(value, "First name")

    @field_validator("lastName")
    @classmethod
    def validate_last_name(cls, value: str) -> str:
        return normalize_name_part(value, "Last name")

    @field_validator("email")
    @classmethod
    def email_domain_must_be_agivant(cls, value: EmailStr) -> str:
        return validate_agivant_email(value)


class UpdateUserRequest(BaseModel):
    firstName: str | None = Field(default=None, min_length=1, max_length=50)
    lastName: str | None = Field(default=None, min_length=1, max_length=50)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6)
    role: Role | None = None

    @field_validator("firstName")
    @classmethod
    def validate_first_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_name_part(value, "First name")

    @field_validator("lastName")
    @classmethod
    def validate_last_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_name_part(value, "Last name")

    @field_validator("email")
    @classmethod
    def email_domain_must_be_agivant(cls, value: EmailStr | None) -> str | None:
        if value is None:
            return None
        return validate_agivant_email(value)
