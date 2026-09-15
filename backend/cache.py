import hashlib
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

CACHE_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


def make_cache_key(*parts: str) -> str:
    """Stable hash of one or more text parts — e.g. resume text alone,
    or resume text + job description together."""
    joined = "||".join(parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


async def ensure_cache_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create the TTL index once at startup. Safe to call every startup —
    Mongo no-ops if the index already exists with the same options."""
    await db.ai_cache.create_index("created_at", expireAfterSeconds=CACHE_TTL_SECONDS)


async def get_cached(db: AsyncIOMotorDatabase, key: str) -> dict | None:
    doc = await db.ai_cache.find_one({"_id": key})
    if doc:
        print(f"[cache] HIT  {key[:12]}...")
        return doc["result"]
    print(f"[cache] MISS {key[:12]}...")
    return None


async def set_cached(db: AsyncIOMotorDatabase, key: str, result: dict) -> None:
    await db.ai_cache.update_one(
        {"_id": key},
        {"$set": {"result": result, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )