"""
models.py
Pydantic request/response schemas for auth + the job tracker
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

ApplicationStatus = Literal["applied", "interview", "offer", "rejected"]
ApplicationSource = Literal["job_finder", "linkedin", "referral", "company_site", "other"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ApplicationCreate(BaseModel):
    company: str = Field(min_length=1)
    role: str = Field(min_length=1)
    status: ApplicationStatus = "applied"
    date_applied: Optional[str] = None  # ISO date string, e.g. "2026-09-04"
    notes: Optional[str] = None
    job_url: Optional[str] = None
    salary: Optional[str] = None
    source: Optional[ApplicationSource] = None
    priority: bool = False


class ApplicationUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    status: Optional[ApplicationStatus] = None
    date_applied: Optional[str] = None
    notes: Optional[str] = None
    job_url: Optional[str] = None
    salary: Optional[str] = None
    source: Optional[ApplicationSource] = None
    priority: Optional[bool] = None


class ApplicationOut(BaseModel):
    id: str
    company: str
    role: str
    status: ApplicationStatus
    date_applied: Optional[str] = None
    notes: Optional[str] = None
    job_url: Optional[str] = None
    salary: Optional[str] = None
    source: Optional[ApplicationSource] = None
    priority: bool = False
    created_at: datetime
    updated_at: datetime