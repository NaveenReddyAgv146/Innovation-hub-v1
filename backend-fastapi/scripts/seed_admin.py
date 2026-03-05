from datetime import datetime, timezone

from pymongo import MongoClient

from app.core.config import settings
from app.core.security import hash_password

ADMIN_EMAIL = "admin@pocshowcase.com"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME = "Admin"


def main() -> None:
    client = MongoClient(settings.mongodb_uri)
    db = client[settings.mongodb_db_name]

    now = datetime.now(timezone.utc)
    existing = db.users.find_one({"email": ADMIN_EMAIL})

    if existing:
        db.users.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "name": ADMIN_NAME,
                    "role": "admin",
                    "password": hash_password(ADMIN_PASSWORD),
                    "updatedAt": now,
                }
            },
        )
        print(f"Updated admin user in DB '{settings.mongodb_db_name}': {ADMIN_EMAIL}")
    else:
        db.users.insert_one(
            {
                "name": ADMIN_NAME,
                "email": ADMIN_EMAIL,
                "password": hash_password(ADMIN_PASSWORD),
                "role": "admin",
                "refreshToken": None,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        print(f"Created admin user in DB '{settings.mongodb_db_name}': {ADMIN_EMAIL}")

    client.close()


if __name__ == "__main__":
    main()
