"""
main.py
-------
SweetWagon FastAPI backend.

Endpoints
---------
GET  /                        health check
GET  /api/locations           all locations sorted by wait time
GET  /api/locations/{id}      single location by ID
GET  /api/locations/{id}/history  recent wait time history
POST /api/checkins            submit a community check-in
GET  /api/checkins/{id}       recent check-ins for a location

Run locally:
    uvicorn main:app --reload --port 8000

Env vars:
    REDIS_URL       redis://localhost:6379/0 (default)
    CORS_ORIGINS    comma-separated list of allowed origins
                    e.g. http://localhost:3000,https://sweetwagon.app
"""

import json
import os
import time
from datetime import datetime, timezone
from typing import Optional

import redis
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SweetWagon API",
    description="Community-driven NYC emergency room wait times",
    version="0.1.0",
)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# ── Redis client ───────────────────────────────────────────────────────────────

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

def get_redis() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)

# ── Pydantic models ────────────────────────────────────────────────────────────

class Location(BaseModel):
    id: str
    name: str
    address: str
    borough: str
    lat: float
    lng: float
    wait_minutes: int
    scraped_at: str
    source: str

class LocationWithCommunity(Location):
    community_wait_minutes: Optional[int] = None
    community_report_count: int = 0
    display_wait_minutes: int
    busyness_index: Optional[float] = None  # 0=quiet, 1=moderate, 2=packed

class CheckIn(BaseModel):
    location_id: str
    arrived_minutes_ago: int = Field(ge=0, le=600)
    busyness: Optional[int] = Field(default=None, ge=0, le=2)
    wait_minutes: Optional[int] = Field(default=None, ge=0, le=600)
    been_seen: bool = False

    @field_validator("location_id")
    @classmethod
    def validate_location_id(cls, v: str) -> str:
        valid = {"perelman", "brooklyn", "cobble-hill", "long-island"}
        if v not in valid:
            raise ValueError(f"Unknown location_id: {v}")
        return v

class CheckInResponse(BaseModel):
    ok: bool
    checkin_id: str
    message: str

class CheckInRecord(BaseModel):
    checkin_id: str
    location_id: str
    arrived_at: str
    busyness: Optional[int]
    wait_minutes: Optional[int]
    been_seen: bool
    submitted_at: str

# ── Helpers ────────────────────────────────────────────────────────────────────

CHECKIN_TTL_SECONDS = 90 * 60          # 90 minutes — matches frontend window
HISTORY_DISPLAY_LIMIT = 12             # 1 hour at 5-min scrape cadence

def _build_location_with_community(
    loc: dict, r: redis.Redis
) -> LocationWithCommunity:
    """
    Merge official Redis data with recent community check-ins to produce
    the display wait time shown to the user.
    """
    loc_id = loc["id"]

    # Pull recent check-ins from Redis list
    raw_checkins = r.lrange(f"sw:checkins:{loc_id}", 0, -1)
    now = time.time()
    recent = [
        json.loads(c) for c in raw_checkins
        if now - json.loads(c).get("ts", 0) < CHECKIN_TTL_SECONDS
    ]

    # Community wait average (only from check-ins that include a wait time)
    wait_reports = [c for c in recent if c.get("wait_minutes") is not None]
    community_wait = (
        round(sum(c["wait_minutes"] for c in wait_reports) / len(wait_reports))
        if wait_reports else None
    )

    # Busyness index average
    busyness_reports = [c for c in recent if c.get("busyness") is not None]
    busyness_index = (
        round(sum(c["busyness"] for c in busyness_reports) / len(busyness_reports), 1)
        if busyness_reports else None
    )

    display_wait = community_wait if community_wait is not None else loc["wait_minutes"]

    return LocationWithCommunity(
        **loc,
        community_wait_minutes=community_wait,
        community_report_count=len(recent),
        display_wait_minutes=display_wait,
        busyness_index=busyness_index,
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/", tags=["health"])
def health():
    """Basic health check — also returns last scrape time."""
    r = get_redis()
    last_scraped = r.get("er:last_scraped") or "unknown"
    return {"status": "ok", "last_scraped": last_scraped}


@app.get("/api/locations", response_model=list[LocationWithCommunity], tags=["locations"])
def get_locations(borough: Optional[str] = Query(default=None)):
    """
    Return all locations sorted by display wait time (shortest first).
    Optionally filter by borough: Manhattan, Brooklyn, Long Island.
    """
    r = get_redis()

    # Sorted set gives us location IDs ordered by official wait time
    loc_ids = r.zrange("er:locations", 0, -1)
    if not loc_ids:
        raise HTTPException(
            status_code=503,
            detail="No location data available — scraper may not have run yet",
        )

    results = []
    for loc_id in loc_ids:
        raw = r.hgetall(f"er:wait:{loc_id}")
        if not raw:
            continue

        # Cast numeric fields back from strings
        raw["wait_minutes"] = int(raw["wait_minutes"])
        raw["lat"] = float(raw["lat"])
        raw["lng"] = float(raw["lng"])

        if borough and raw.get("borough", "").lower() != borough.lower():
            continue

        results.append(_build_location_with_community(raw, r))

    # Re-sort by display wait (community data may have changed the order)
    results.sort(key=lambda x: x.display_wait_minutes)
    return results


@app.get("/api/locations/{location_id}", response_model=LocationWithCommunity, tags=["locations"])
def get_location(location_id: str):
    """Return a single location by ID."""
    r = get_redis()
    raw = r.hgetall(f"er:wait:{location_id}")
    if not raw:
        raise HTTPException(status_code=404, detail=f"Location '{location_id}' not found")

    raw["wait_minutes"] = int(raw["wait_minutes"])
    raw["lat"] = float(raw["lat"])
    raw["lng"] = float(raw["lng"])
    return _build_location_with_community(raw, r)


@app.get("/api/locations/{location_id}/history", response_model=list[dict], tags=["locations"])
def get_location_history(
    location_id: str,
    limit: int = Query(default=HISTORY_DISPLAY_LIMIT, ge=1, le=288),
):
    """
    Return up to `limit` historical official wait time snapshots for a
    location, most recent first. Useful for sparkline charts.
    """
    r = get_redis()
    raw = r.lrange(f"er:wait:{location_id}:history", 0, limit - 1)
    if not raw:
        raise HTTPException(
            status_code=404,
            detail=f"No history found for '{location_id}'",
        )
    return [json.loads(entry) for entry in raw]


@app.post("/api/checkins", response_model=CheckInResponse, tags=["checkins"])
def submit_checkin(checkin: CheckIn):
    """
    Submit an anonymous community check-in.

    - No account required.
    - `arrived_minutes_ago` anchors the arrival time retroactively.
    - `wait_minutes` should only be set if the user has already been seen.
    - Check-ins expire from Redis after 90 minutes automatically.
    """
    r = get_redis()

    now = time.time()
    arrived_at = now - (checkin.arrived_minutes_ago * 60)
    checkin_id = f"{checkin.location_id}:{int(now * 1000)}"

    record = {
        "checkin_id": checkin_id,
        "location_id": checkin.location_id,
        "arrived_at": datetime.fromtimestamp(arrived_at, tz=timezone.utc).isoformat(),
        "busyness": checkin.busyness,
        "wait_minutes": checkin.wait_minutes,
        "been_seen": checkin.been_seen,
        "submitted_at": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
        "ts": now,
    }

    key = f"sw:checkins:{checkin.location_id}"
    pipe = r.pipeline(transaction=True)
    pipe.lpush(key, json.dumps(record))
    pipe.ltrim(key, 0, 499)           # cap at 500 check-ins per location
    pipe.expire(key, CHECKIN_TTL_SECONDS)
    pipe.execute()

    return CheckInResponse(
        ok=True,
        checkin_id=checkin_id,
        message="Check-in recorded. Thank you for helping your community.",
    )


@app.get("/api/checkins/{location_id}", response_model=list[CheckInRecord], tags=["checkins"])
def get_checkins(
    location_id: str,
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Return the most recent anonymous check-ins for a location.
    Only check-ins from the last 90 minutes are returned.
    """
    r = get_redis()
    raw = r.lrange(f"sw:checkins:{location_id}", 0, -1)
    now = time.time()
    recent = [
        CheckInRecord(**json.loads(c))
        for c in raw
        if now - json.loads(c).get("ts", 0) < CHECKIN_TTL_SECONDS
    ]
    return recent[:limit]
