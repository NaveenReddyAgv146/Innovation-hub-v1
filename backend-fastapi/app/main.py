from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.core.database import database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await database.connect()
    yield
    await database.disconnect()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
if settings.upload_dir:
    UPLOADS_DIR = Path(settings.upload_dir)
elif os.getenv("VERCEL"):
    UPLOADS_DIR = Path("/tmp/uploads")
else:
    UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

allowed_origins = [settings.client_url]
if settings.client_urls:
    allowed_origins.extend(
        [origin.strip() for origin in settings.client_urls.split(",") if origin.strip()]
    )
allowed_origins = list(dict.fromkeys(allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=settings.client_url_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.include_router(api_router)
