import html
import os
import re
from datetime import datetime, timezone

import httpx

ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api"
JOOBLE_BASE_URL = "https://pk.jooble.org/api/"
JOOBLE_API_KEY_ENV = "JOOBLE_API_KEY"
SNIPPET_LENGTH = 280


def _strip_html(raw_html: str) -> str:
    """Arbeitnow descriptions are HTML — reduce to plain text for display/matching."""
    text = re.sub(r"<[^>]+>", " ", raw_html or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _to_listing(job: dict) -> dict:
    plain_description = _strip_html(job.get("description", ""))
    snippet = plain_description[:SNIPPET_LENGTH]
    if len(plain_description) > SNIPPET_LENGTH:
        snippet = snippet.rsplit(" ", 1)[0] + "…"

    posted_at = None
    if job.get("created_at"):
        posted_at = datetime.fromtimestamp(job["created_at"], tz=timezone.utc).strftime("%Y-%m-%d")

    return {
        "title": job.get("title", ""),
        "company": job.get("company_name", ""),
        "location": job.get("location", ""),
        "remote": bool(job.get("remote")),
        "tags": job.get("tags", []) or [],
        "job_types": job.get("job_types", []) or [],
        "url": job.get("url", ""),
        "posted_at": posted_at,
        "snippet": snippet,
        "description": plain_description,  
        "source": "arbeitnow",
    }


def _jooble_to_listing(job: dict) -> dict:
    posted_at = None
    if job.get("updated"):
        posted_at = str(job["updated"])[:10]

    title = job.get("title") or ""
    location = job.get("location") or ""
    job_type = job.get("type") or ""
    snippet = _strip_html(job.get("snippet", ""))

    is_remote = "remote" in f"{title} {location} {job_type} {snippet}".lower()

    return {
        "title": title,
        "company": job.get("company") or "Not listed",
        "location": location,
        "remote": is_remote,
        "tags": [],
        "job_types": [job_type] if job_type else [],
        "url": job.get("link", ""),
        "posted_at": posted_at,
        "snippet": snippet,
        "description": snippet,
        "source": "jooble",
    }


async def _search_arbeitnow(
    keyword: str | None,
    location: str | None,
    remote_only: bool,
    max_pages: int,
    max_results: int,
    client: httpx.AsyncClient,
) -> list[dict]:
    """One pass over Arbeitnow with the given filters — all three
    (keyword/location/remote_only) are strict AND filters here; the
    "broaden" behavior lives one level up in search_jobs(), as a
    deliberate second pass, not baked into this filter logic."""
    keyword_lower = keyword.lower().strip() if keyword else None
    location_lower = location.lower().strip() if location else None
    matches: list[dict] = []

    for page in range(1, max_pages + 1):
        if len(matches) >= max_results:
            break
        try:
            resp = await client.get(ARBEITNOW_URL, params={"page": page})
            resp.raise_for_status()
        except httpx.HTTPError:
            break

        jobs = resp.json().get("data", [])
        if not jobs:
            break

        for job in jobs:
            if keyword_lower:
                haystack = " ".join(
                    [
                        job.get("title", ""),
                        job.get("company_name", ""),
                        " ".join(job.get("tags", []) or []),
                    ]
                ).lower()
                if keyword_lower not in haystack:
                    continue

            # Strict: "Remote only" means only remote jobs, full stop —
            # a matching location does NOT let a non-remote job through.
            if remote_only and not job.get("remote"):
                continue

            if location_lower and location_lower not in (job.get("location") or "").lower():
                continue

            matches.append(_to_listing(job))
            if len(matches) >= max_results:
                break

    return matches


async def _search_jooble(
    keyword: str | None,
    location: str | None,
    client: httpx.AsyncClient,
) -> list[dict]:
    api_key = os.environ.get(JOOBLE_API_KEY_ENV)
    if not api_key:
        print("[job_finder] JOOBLE_API_KEY not set — skipping Jooble, Arbeitnow-only.")
        return []

    print(f"[job_finder] Calling Jooble PK (key ends in ...{api_key[-6:]}) — keyword={keyword!r} location={location!r}")
    try:
        resp = await client.post(
            f"{JOOBLE_BASE_URL}{api_key}",
            json={"keywords": keyword or "", "location": location or "", "page": "1"},
        )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[job_finder] Jooble request failed: {e}")
        return []

    payload = resp.json()
    jobs = payload.get("jobs", [])
    print(f"[job_finder] Jooble returned {len(jobs)} job(s) (totalCount={payload.get('totalCount')})")
    return [_jooble_to_listing(j) for j in jobs]


async def search_jobs(
    keyword: str | None = None,
    location: str | None = None,
    remote_only: bool = False,
    max_pages: int = 3,
    max_results: int = 30,
    client: httpx.AsyncClient | None = None,
) -> dict:
    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=15.0)

    async def _run(loc: str | None) -> list[dict]:
        arbeitnow_matches = await _search_arbeitnow(keyword, loc, remote_only, max_pages, max_results, client)
        jooble_matches = await _search_jooble(keyword, loc, client)
        out = arbeitnow_matches + jooble_matches
        if remote_only:
            out = [j for j in out if j["remote"]]
        return out

    try:
        combined = await _run(location)

        notice = None
        if not combined and location:
            broadened = await _run(None)
            if broadened:
                combined = broadened
                if remote_only:
                    notice = (
                        f'No remote listings found based in "{location}" — showing '
                        f"international remote listings instead."
                    )
                else:
                    notice = (
                        f'No listings matched near "{location}" — showing broader '
                        f"results instead (not filtered by location)."
                    )

        return {"results": combined[:max_results], "notice": notice}
    finally:
        if owns_client:
            await client.aclose()