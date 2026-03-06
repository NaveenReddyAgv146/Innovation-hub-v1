import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.utils.serialization import serialize_doc

router = APIRouter(prefix="/pocs", tags=["pocs"])

BASE_DIR = Path(__file__).resolve().parents[3]
UPLOAD_DIR = BASE_DIR / "uploads"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024


def parse_tech_stack(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
    except json.JSONDecodeError:
        return []
    return []


def clean_required_text(field_name: str, value: str, max_length: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} is required")
    if len(cleaned) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} cannot exceed {max_length} characters",
        )
    return cleaned


def clean_optional_text(field_name: str, value: str, max_length: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} cannot be empty")
    if len(cleaned) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} cannot exceed {max_length} characters",
        )
    return cleaned


async def save_thumbnail(file: UploadFile | None) -> str:
    if not file:
        return ""

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, WebP, and GIF images are allowed",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 5MB")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix or ".bin"
    filename = f"{int(datetime.now(timezone.utc).timestamp() * 1000)}-{os.urandom(4).hex()}{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(content)

    return f"/uploads/{filename}"


async def fetch_poc_or_404(db: AsyncIOMotorDatabase, poc_id: str) -> dict[str, Any]:
    if not ObjectId.is_valid(poc_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POC not found")
    poc = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    if not poc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POC not found")
    return poc


def enforce_owner_or_admin(poc: dict[str, Any], current_user: dict[str, Any]) -> None:
    if current_user["role"] == "developer" and str(poc.get("author")) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only modify your own POCs")


def enrich_vote_info(poc: dict[str, Any], current_user_id: str) -> dict[str, Any]:
    votes = poc.get("votes") or []
    normalized_votes = [str(voter_id) for voter_id in votes]
    poc["votesCount"] = len(normalized_votes)
    poc["hasVoted"] = current_user_id in normalized_votes
    return poc


async def enrich_author_info(db: AsyncIOMotorDatabase, poc: dict[str, Any]) -> dict[str, Any]:
    author_id = poc.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            poc["author"] = serialize_doc(user)
    return poc


@router.get("")
async def get_pocs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = "",
    tag: str = "",
    status_filter: str = Query(default="", alias="status"),
    author: str = "",
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query_parts: list[dict[str, Any]] = []

    if search:
        regex = {"$regex": search, "$options": "i"}
        query_parts.append({"$or": [{"title": regex}, {"description": regex}]})

    if tag:
        tags = [item.strip() for item in tag.split(",") if item.strip()]
        if tags:
            query_parts.append({"techStack": {"$in": tags}})

    if current_user.get("role") == "viewer":
        viewer_id = ObjectId(current_user["id"])
        if status_filter == "draft":
            query_parts.append({"status": "draft"})
            query_parts.append({"author": viewer_id})
        elif status_filter == "published":
            query_parts.append({"status": "published"})
        else:
            query_parts.append({"$or": [{"status": "published"}, {"author": viewer_id}]})
    elif status_filter:
        query_parts.append({"status": status_filter})

    if author and ObjectId.is_valid(author):
        query_parts.append({"author": ObjectId(author)})

    if not query_parts:
        query: dict[str, Any] = {}
    elif len(query_parts) == 1:
        query = query_parts[0]
    else:
        query = {"$and": query_parts}

    total = await db.pocs.count_documents(query)
    cursor = db.pocs.find(query).sort("createdAt", -1).skip((page - 1) * limit).limit(limit)
    pocs = await cursor.to_list(length=limit)

    author_ids = [doc.get("author") for doc in pocs if isinstance(doc.get("author"), ObjectId)]
    users_map: dict[str, dict[str, str]] = {}
    if author_ids:
        user_docs = await db.users.find(
            {"_id": {"$in": author_ids}},
            {"name": 1, "email": 1},
        ).to_list(length=len(author_ids))
        users_map = {str(user["_id"]): serialize_doc(user) for user in user_docs}

    serialized = serialize_doc(pocs)
    for poc in serialized:
        author_id = poc.get("author")
        if author_id and author_id in users_map:
            poc["author"] = users_map[author_id]
        enrich_vote_info(poc, current_user["id"])

    return {
        "pocs": serialized,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit,
        },
    }


@router.get("/{poc_id}")
async def get_poc_by_id(
    poc_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    if (
        current_user.get("role") == "viewer"
        and poc.get("status") != "published"
        and str(poc.get("author")) != current_user["id"]
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this idea yet",
        )
    serialized = serialize_doc(poc)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])

    return {"poc": serialized}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_poc(
    title: str = Form(...),
    description: str = Form(default=""),
    customer: str = Form(...),
    customerClassification: str = Form(default="Existing"),
    challenges: str = Form(default=""),
    requestorName: str = Form(default=""),
    techStack: str = Form(default="[]"),
    demoLink: str = Form(default=""),
    repoLink: str = Form(default=""),
    repositoryLink: str = Form(default=""),
    status_value: str = Form(default="draft", alias="status"),
    thumbnail: UploadFile | None = File(default=None),
    current_user=Depends(require_roles("admin", "developer", "viewer")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if customerClassification not in {"Existing", "New"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid customer classification")

    if current_user.get("role") == "viewer":
        status_value = "draft"
    elif status_value not in {"draft", "published"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")

    thumbnail_path = await save_thumbnail(thumbnail)
    now = datetime.now(timezone.utc)
    cleaned_title = clean_required_text("Title", title, 200)
    cleaned_customer = clean_required_text("Customer", customer, 300)
    cleaned_challenges = challenges.strip()
    if len(cleaned_challenges) > 5000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Challenges cannot exceed 5000 characters")

    cleaned_description = description.strip() or cleaned_challenges
    if len(cleaned_description) > 5000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Description cannot exceed 5000 characters")

    cleaned_requestor = requestorName.strip() or current_user.get("name", "")
    if len(cleaned_requestor) > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Requestor name cannot exceed 100 characters")

    cleaned_repo_link = repositoryLink.strip() or repoLink.strip()

    doc = {
        "title": cleaned_title,
        "description": cleaned_description,
        "customer": cleaned_customer,
        "customerClassification": customerClassification,
        "challenges": cleaned_challenges,
        "requestorName": cleaned_requestor,
        "techStack": parse_tech_stack(techStack),
        "demoLink": demoLink.strip(),
        "repoLink": cleaned_repo_link,
        "repositoryLink": cleaned_repo_link,
        "thumbnail": thumbnail_path,
        "status": status_value,
        "votes": [],
        "author": ObjectId(current_user["id"]),
        "createdAt": now,
        "updatedAt": now,
    }

    result = await db.pocs.insert_one(doc)
    poc = await db.pocs.find_one({"_id": result.inserted_id})
    serialized = serialize_doc(poc)

    author_doc = await db.users.find_one({"_id": ObjectId(current_user["id"])}, {"name": 1, "email": 1})
    if author_doc:
        serialized["author"] = serialize_doc(author_doc)
    enrich_vote_info(serialized, current_user["id"])

    return {"message": "POC created", "poc": serialized}


@router.put("/{poc_id}")
async def update_poc(
    poc_id: str,
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    customer: str | None = Form(default=None),
    customerClassification: str | None = Form(default=None),
    challenges: str | None = Form(default=None),
    requestorName: str | None = Form(default=None),
    techStack: str | None = Form(default=None),
    demoLink: str | None = Form(default=None),
    repoLink: str | None = Form(default=None),
    repositoryLink: str | None = Form(default=None),
    status_value: str | None = Form(default=None, alias="status"),
    thumbnail: UploadFile | None = File(default=None),
    current_user=Depends(require_roles("admin", "developer")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_owner_or_admin(poc, current_user)

    updates: dict[str, Any] = {}
    if title is not None:
        updates["title"] = clean_optional_text("Title", title, 200)
    if description is not None:
        updates["description"] = clean_optional_text("Description", description, 5000)
    if customer is not None:
        updates["customer"] = clean_optional_text("Customer", customer, 300)
    if customerClassification is not None:
        if customerClassification not in {"Existing", "New"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid customer classification")
        updates["customerClassification"] = customerClassification
    if challenges is not None:
        updates["challenges"] = clean_optional_text("Challenges", challenges, 5000)
    if requestorName is not None:
        cleaned_requestor = requestorName.strip()
        if len(cleaned_requestor) > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Requestor Name cannot exceed 100 characters",
            )
        updates["requestorName"] = cleaned_requestor
    if techStack is not None:
        updates["techStack"] = parse_tech_stack(techStack)
    if demoLink is not None:
        updates["demoLink"] = demoLink.strip()
    if repoLink is not None:
        updates["repoLink"] = repoLink.strip()
        updates["repositoryLink"] = repoLink.strip()
    if repositoryLink is not None:
        updates["repositoryLink"] = repositoryLink.strip()
        updates["repoLink"] = repositoryLink.strip()
    if status_value is not None:
        if status_value not in {"draft", "published"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
        updates["status"] = status_value

    if thumbnail is not None:
        updates["thumbnail"] = await save_thumbnail(thumbnail)

    if updates:
        updates["updatedAt"] = datetime.now(timezone.utc)
        await db.pocs.update_one({"_id": ObjectId(poc_id)}, {"$set": updates})

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])

    return {"message": "POC updated", "poc": serialized}


@router.delete("/{poc_id}")
async def delete_poc(
    poc_id: str,
    current_user=Depends(require_roles("admin", "developer")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    enforce_owner_or_admin(poc, current_user)

    await db.pocs.find_one_and_delete({"_id": ObjectId(poc_id)})
    return {"message": "POC deleted"}


@router.post("/{poc_id}/publish")
async def publish_poc(
    poc_id: str,
    current_user=Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await fetch_poc_or_404(db, poc_id)
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {"$set": {"status": "published", "updatedAt": datetime.now(timezone.utc)}},
    )

    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)

    author_id = serialized.get("author")
    if author_id and ObjectId.is_valid(author_id):
        user = await db.users.find_one({"_id": ObjectId(author_id)}, {"name": 1, "email": 1})
        if user:
            serialized["author"] = serialize_doc(user)
    enrich_vote_info(serialized, current_user["id"])

    return {"message": "POC published", "poc": serialized}


@router.post("/{poc_id}/upvote")
async def upvote_poc(
    poc_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    if poc.get("status") != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only published ideas can be marked as interested",
        )
    if current_user.get("role") == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot mark interest on ideas",
        )
    if str(poc.get("author")) == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Idea owners cannot mark interest on their own ideas",
        )

    current_user_id = ObjectId(current_user["id"])
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$addToSet": {"votes": current_user_id},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
    )
    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)
    await enrich_author_info(db, serialized)
    enrich_vote_info(serialized, current_user["id"])
    return {"message": "Interest added", "poc": serialized}


@router.delete("/{poc_id}/upvote")
async def remove_upvote_poc(
    poc_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    if current_user.get("role") == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot remove interest on ideas",
        )
    if str(poc.get("author")) == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Idea owners cannot remove interest on their own ideas",
        )
    current_user_id = ObjectId(current_user["id"])
    await db.pocs.update_one(
        {"_id": ObjectId(poc_id)},
        {
            "$pull": {"votes": current_user_id},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
    )
    updated = await db.pocs.find_one({"_id": ObjectId(poc_id)})
    serialized = serialize_doc(updated)
    await enrich_author_info(db, serialized)
    enrich_vote_info(serialized, current_user["id"])
    return {"message": "Interest removed", "poc": serialized}


@router.get("/{poc_id}/voters")
async def get_poc_voters(
    poc_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    poc = await fetch_poc_or_404(db, poc_id)
    is_owner = str(poc.get("author")) == current_user["id"]
    is_admin = current_user.get("role") == "admin"
    if not is_admin and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    voter_ids = [v for v in (poc.get("votes") or []) if isinstance(v, ObjectId)]
    if not voter_ids:
        return {"voters": []}

    voters = await db.users.find(
        {"_id": {"$in": voter_ids}},
        {"name": 1, "email": 1, "role": 1},
    ).to_list(length=len(voter_ids))
    return {"voters": serialize_doc(voters)}
