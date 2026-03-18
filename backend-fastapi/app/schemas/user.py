from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.schemas.auth import normalize_employee_id, normalize_name_part, validate_agivant_email


Role = Literal["admin", "developer", "viewer"]
AdminScope = Literal["global", "track"]
AdminTrack = Literal[
    "Solutions",
    "Delivery",
    "Learning",
    "GTM/Sales",
    "Organizational Building & Thought Leadership",
]


class CreateUserRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=50)
    lastName: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6)
    role: Role = "viewer"
    employeeId: str | None = Field(default=None, max_length=100)
    adminScope: AdminScope | None = None
    adminTrack: AdminTrack | None = None

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

    @field_validator("employeeId")
    @classmethod
    def validate_employee_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_employee_id(value)

    @model_validator(mode="after")
    def validate_user_configuration(self):
        if self.role == "viewer" and not self.employeeId:
            raise ValueError("Employee ID is required for viewer users")
        if self.role == "admin" and self.adminScope == "track" and not self.adminTrack:
            raise ValueError("Admin track is required for track admins")
        return self


class UpdateUserRequest(BaseModel):
    firstName: str | None = Field(default=None, min_length=1, max_length=50)
    lastName: str | None = Field(default=None, min_length=1, max_length=50)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6)
    role: Role | None = None
    employeeId: str | None = Field(default=None, max_length=100)
    adminScope: AdminScope | None = None
    adminTrack: AdminTrack | None = None

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

    @field_validator("employeeId")
    @classmethod
    def validate_employee_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_employee_id(value)
