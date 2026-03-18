from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "POC FastAPI Backend"
    app_env: str = "development"
    port: int = 8000
    super_admin_email: str = "admin@agivant.com"

    mongodb_uri: str = "mongodb+srv://Vercel-Admin-atlas-poc-naveen:gPmYtUWszk8Kbn6Z@atlas-poc-naveen.zlh8xmx.mongodb.net/?appName=atlas-poc-naveen" #"mongodb+srv://naveenreddyagivant_db_user:yV98OqyzC8QxmYcW@poc-cluster1.urn3zga.mongodb.net/" #ac-lufgkvi-shard-00-02.urn3zga.mongodb.net:27017
    mongodb_db_name: str = "poc_showcase"

    client_url: str = "http://localhost:5173"
    client_urls: str = ""
    client_url_regex: str = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
    upload_dir: str = ""

    jwt_access_secret: str = "change_this_access_secret"
    jwt_refresh_secret: str = "change_this_refresh_secret"
    jwt_access_expiry_minutes: int = 15
    jwt_refresh_expiry_days: int = 7

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
