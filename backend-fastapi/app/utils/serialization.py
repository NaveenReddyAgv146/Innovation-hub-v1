from datetime import datetime
from typing import Any

from bson import ObjectId


def serialize_doc(data: Any) -> Any:
    if isinstance(data, ObjectId):
        return str(data)

    if isinstance(data, datetime):
        return data.isoformat()

    if isinstance(data, list):
        return [serialize_doc(item) for item in data]

    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if key == "_id":
                oid = str(value)
                # Keep both Mongo-style _id and generic id for compatibility.
                result["_id"] = oid
                result["id"] = oid
            else:
                result[key] = serialize_doc(value)
        return result

    return data
