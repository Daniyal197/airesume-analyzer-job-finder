import os
from functools import lru_cache

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

DB_NAME = "resume_analyzer"


@lru_cache
def _get_client() -> AsyncIOMotorClient:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError(
            "MONGODB_URI is not set. Add it to backend/.env — "
            "get a free cluster at https://www.mongodb.com/cloud/atlas/register"
        )
    return AsyncIOMotorClient(uri)


def get_db() -> AsyncIOMotorDatabase:
    """
    FastAPI dependency that returns the database handle.

    Overridden in tests via `app.dependency_overrides[get_db]` to point
    at an inmemory mongomock instance instead of a real Atlas cluster.
    """
    return _get_client()[DB_NAME]


def get_db_optional() -> AsyncIOMotorDatabase | None:
    """
    Like get_db(), but returns None instead of raising when MONGODB_URI
    isn't configured. Use this for features where the database is a
    nice to have (e.g. caching) rather than a hard requirement unlike
    the applications tracker, which genuinely needs MongoDB to mean
    anything and should keep using the strict get_db().
    """
    try:
        return get_db()
    except RuntimeError:
        return None