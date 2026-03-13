from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, TEXT
import certifi

from app.core.config import settings


class Database:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None

    async def connect(self) -> None:
        client_kwargs = {}
        if settings.mongodb_uri.startswith("mongodb+srv://"):
            client_kwargs["tls"] = True
            client_kwargs["tlsAllowInvalidCertificates"] = False
            client_kwargs["tlsAllowInvalidHostnames"] = True
            # client_kwargs["tlsCAFile"] = certifi.where()

        self.client = AsyncIOMotorClient(settings.mongodb_uri, **client_kwargs)
        self.db = self.client[settings.mongodb_db_name]
        await self.ensure_indexes()

    async def disconnect(self) -> None:
        if self.client:
            self.client.close()
        self.client = None
        self.db = None

    async def ensure_indexes(self) -> None:
        if self.db is None:
            return

        await self.db.users.create_index([("email", ASCENDING)], unique=True)
        await self.db.users.create_index([("role", ASCENDING)])

        await self.db.pocs.create_index([("status", ASCENDING)])
        await self.db.pocs.create_index([("author", ASCENDING)])
        await self.db.pocs.create_index([("votes", ASCENDING)])
        await self.db.pocs.create_index([("techStack", ASCENDING)])
        await self.db.pocs.create_index([("title", TEXT), ("description", TEXT)])


database = Database()


def get_db() -> AsyncIOMotorDatabase:
    if database.db is None:
        raise RuntimeError("Database is not connected")
    return database.db
