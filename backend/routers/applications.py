"""
routers/applications.py
Phase 4: job application tracker — CRUD, scoped to the authenticated user
"""

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import get_current_user_id
from database import get_db
from models import ApplicationCreate, ApplicationOut, ApplicationUpdate

router = APIRouter(prefix="/applications", tags=["applications"])


def _doc_to_out(doc: dict) -> ApplicationOut:
    return ApplicationOut(
        id=str(doc["_id"]),
        company=doc["company"],
        role=doc["role"],
        status=doc["status"],
        date_applied=doc.get("date_applied"),
        notes=doc.get("notes"),
        job_url=doc.get("job_url"),
        salary=doc.get("salary"),
        source=doc.get("source"),
        priority=doc.get("priority", False),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def _object_id_or_404(application_id: str) -> ObjectId:
    try:
        return ObjectId(application_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail="Application not found.")


@router.post("", response_model=ApplicationOut, status_code=201)
async def create_application(
    payload: ApplicationCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    doc = {
        **payload.model_dump(),
        "user_id": user_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.applications.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_out(doc)


@router.get("", response_model=list[ApplicationOut])
async def list_applications(
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db.applications.find({"user_id": user_id}).sort("created_at", -1)
    return [_doc_to_out(doc) async for doc in cursor]


@router.get("/{application_id}", response_model=ApplicationOut)
async def get_application(
    application_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _object_id_or_404(application_id)
    doc = await db.applications.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    return _doc_to_out(doc)


@router.put("/{application_id}", response_model=ApplicationOut)
async def update_application(
    application_id: str,
    payload: ApplicationUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _object_id_or_404(application_id)
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        result = await db.applications.update_one(
            {"_id": oid, "user_id": user_id}, {"$set": updates}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Application not found.")

    doc = await db.applications.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    return _doc_to_out(doc)


@router.delete("/{application_id}", status_code=204)
async def delete_application(
    application_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = _object_id_or_404(application_id)
    result = await db.applications.delete_one({"_id": oid, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Application not found.")