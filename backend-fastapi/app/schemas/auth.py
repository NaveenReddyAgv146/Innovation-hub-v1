from pydantic import BaseModel, EmailStr, Field, field_validator


def validate_agivant_email(email: EmailStr) -> str:
    normalized = str(email).strip().lower()
    if not normalized.endswith("@agivant.com"):
        raise ValueError("Only @agivant.com email addresses are allowed")
    return normalized


def normalize_name_part(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_name} is required")
    return cleaned


def compose_full_name(first_name: str, last_name: str) -> str:
    return f"{first_name} {last_name}".strip()


class RegisterRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=50)
    lastName: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6)

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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=1)
