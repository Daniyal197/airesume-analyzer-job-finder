"""
main.py
Resume Analyzer + Job Tracker API

Run locally with:
    uvicorn main:app --reload

Docs at http://127.0.0.1:8000/docs
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from ai_analyzer import AIAnalysisError, analyze_resume
from cache import ensure_cache_indexes, get_cached, make_cache_key, set_cached
from database import get_db, get_db_optional
from job_finder import search_jobs
from job_matcher import match_resume_to_job
from resume_parser import EmptyResumeError, UnsupportedFileTypeError, parse_resume
from routers import applications, auth_routes

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Best-effort: if MONGODB_URI isn't set yet, don't crash startup over it —
    # caching just won't work until it is (analyze/match still run, just uncached).
    try:
        await ensure_cache_indexes(get_db())
    except Exception as e:
        print(f"[startup] Skipping cache index setup (DB not configured yet?): {e}")
    yield


app = FastAPI(
    title="Smart Resume Analyzer API",
    description="Resume parsing, AI analysis, job matching, job search, and an application tracker.",
    version="0.6.0",
    lifespan=lifespan,
)

# Phase 6: CORS origins are configurable via ALLOWED_ORIGINS (comma-separated)
# so production can lock this down to the real deployed frontend URL —
# e.g. ALLOWED_ORIGINS=https://your-app.vercel.app — while local dev keeps
# working with no env var set at all (defaults to "*").
_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "*").strip()
_allowed_origins = (
    ["*"]
    if not _allowed_origins_env or _allowed_origins_env == "*"
    else [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phase 5: rate limiting — keyed by client IP since /analyze-resume,
# /match-job, and /jobs/search don't require auth. Limits are deliberately
# low: Gemini and Jooble are both free-tier services we don't want to burn
# through from one person mashing refresh.
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    # Match the {"detail": ...} shape HTTPException uses elsewhere, so the
    # frontend's generic error handling doesn't need a special case for this.
    return JSONResponse(
        status_code=429,
        content={"detail": f"Too many requests — please wait a moment and try again. ({exc.detail})"},
    )


app.include_router(auth_routes.router)
app.include_router(applications.router)


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/parse-resume")
async def parse_resume_endpoint(file: UploadFile = File(...)):
    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = parse_resume(file.filename, file_bytes)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except EmptyResumeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return result


@app.post("/analyze-resume")
@limiter.limit("5/minute")
async def analyze_resume_endpoint(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase | None = Depends(get_db_optional),
):
    """
    Parse the resume, then send it to Gemini for structured analysis
    (skills, ATS score, suggestions). Cached by resume content — the
    same resume text won't trigger a second Gemini call. Caching is
    best-effort: this works fine even if MongoDB isn't configured at
    all, just without the cache.
    """
    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        parsed = parse_resume(file.filename, file_bytes)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except EmptyResumeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    cache_key = make_cache_key("analyze", parsed["text"])
    cached_result = None
    if db is not None:
        try:
            cached_result = await get_cached(db, cache_key)
        except Exception as e:
            print(f"[cache] Lookup failed, proceeding without cache: {e}")

    if cached_result is not None:
        analysis, was_cached = cached_result, True
    else:
        try:
            analysis = analyze_resume(parsed["text"])
        except AIAnalysisError as e:
            raise HTTPException(status_code=502, detail=str(e))
        was_cached = False
        if db is not None:
            try:
                await set_cached(db, cache_key, analysis)
            except Exception as e:
                print(f"[cache] Write failed (result still returned): {e}")

    return {"resume": parsed, "analysis": analysis, "cached": was_cached}


@app.post("/match-job")
@limiter.limit("5/minute")
async def match_job_endpoint(
    request: Request,
    file: UploadFile = File(...),
    job_description: str = Form(...),
    db: AsyncIOMotorDatabase | None = Depends(get_db_optional),
):
    """
    Parse the resume, then compare it against a pasted job description —
    match score, matched/missing skills, missing ATS keywords, and
    tailoring suggestions. Cached by (resume + job description) content;
    caching is best-effort and works fine without MongoDB configured.
    """
    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if not job_description or not job_description.strip():
        raise HTTPException(status_code=400, detail="job_description is empty.")

    try:
        parsed = parse_resume(file.filename, file_bytes)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except EmptyResumeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    cache_key = make_cache_key("match", parsed["text"], job_description)
    cached_result = None
    if db is not None:
        try:
            cached_result = await get_cached(db, cache_key)
        except Exception as e:
            print(f"[cache] Lookup failed, proceeding without cache: {e}")

    if cached_result is not None:
        match, was_cached = cached_result, True
    else:
        try:
            match = match_resume_to_job(parsed["text"], job_description)
        except AIAnalysisError as e:
            raise HTTPException(status_code=502, detail=str(e))
        was_cached = False
        if db is not None:
            try:
                await set_cached(db, cache_key, match)
            except Exception as e:
                print(f"[cache] Write failed (result still returned): {e}")

    return {"resume": parsed, "match": match, "cached": was_cached}


@app.get("/jobs/search")
@limiter.limit("10/minute")
async def search_jobs_endpoint(
    request: Request,
    keyword: str | None = None,
    location: str | None = None,
    remote_only: bool = False,
):
    try:
        outcome = await search_jobs(keyword=keyword, location=location, remote_only=remote_only)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Couldn't reach the job search service: {e}")

    return {"results": outcome["results"], "count": len(outcome["results"]), "notice": outcome["notice"]}