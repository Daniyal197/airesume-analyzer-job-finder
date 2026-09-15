"""
routers/auth_routes.py
Phase 4: registration + login
"""

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import create_access_token, hash_password, verify_password
from database import get_db
from models import LoginRequest, RegisterRequest, TokenResponse

router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(payload: RegisterRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    result = await db.users.insert_one(
        {
            "email": payload.email,
            "hashed_password": hash_password(payload.password),
        }
    )
    token = create_access_token(str(result.inserted_id))
    return TokenResponse(access_token=token)


@router.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    user = await db.users.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(str(user["_id"]))
    return TokenResponse(access_token=token)