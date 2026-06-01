"""
main.py
-------
SweetWagon FastAPI backend.
All Redis access goes through redis_writer.py — this file contains
only FastAPI routes, Pydantic models, and request/response logic.

Endpoints
---------
GET  /                            health check
GET  /api/locations               all locations sorted by wait time
GET  /api/locations/{id}          single location by ID
GET  /api/locations/{id}/history  recent wait time history
POST /api/checkins                submit a community check-in
GET  /api/checkins/{id}           recent check-ins for a location

Run locally:
    uvicorn main:app --reload --port 8000

Env vars:
    REDIS_URL       redis://localhost:6379/0 (default)
    CORS_ORIGINS    comma-separated allowed origins
                    e.g. http://localhost:3000,https://sweetwagon.app
"""

import os
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from redis_writer import (
    read_last_scraped,
    read_location,
    read_all_locations,
    read_history,
    read_checkins,
    write_checkin,
    CHECKIN_TTL,
)

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SweetWagon API",
    description="Community-driven NYC emergency room wait times",
    version="0.1.0",
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

HISTORY_DISPLAY_LIMIT = 12  # 1 hour at 5-min scrape cadence

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

def _merge_community(loc: dict) -> LocationWithCommunity:
    """
    Merge official scraped data with recent community check-ins to produce
    the display wait time returned to the frontend.
    """
    checkins = read_checkins(loc["id"])

    wait_reports     = [c for c in checkins if c.get("wait_minutes") is not None]
    busyness_reports = [c for c in checkins if c.get("busyness") is not None]

    community_wait = (
        round(sum(c["wait_minutes"] for c in wait_reports) / len(wait_reports))
        if wait_reports else None
    )
    busyness_index = (
        round(sum(c["busyness"] for c in busyness_reports) / len(busyness_reports), 1)
        if busyness_reports else None
    )

    return LocationWithCommunity(
        **loc,
        community_wait_minutes=community_wait,
        community_report_count=len(checkins),
        display_wait_minutes=community_wait if community_wait is not None else loc["wait_minutes"],
        busyness_index=busyness_index,
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/", tags=["health"])
def health():
    """Health check — also returns last scrape timestamp."""
    return {"status": "ok", "last_scraped": read_last_scraped()}


@app.get("/api/locations", response_model=list[LocationWithCommunity], tags=["locations"])
def get_locations(borough: Optional[str] = Query(default=None)):
    """
    All locations sorted by display wait time (shortest first).
    Optional ?borough= filter: Manhattan, Brooklyn, Long Island.
    """
    locs = read_all_locations(borough=borough)
    if not locs:
        raise HTTPException(
            status_code=503,
            detail="No location data available — scraper may not have run yet",
        )
    results = [_merge_community(loc) for loc in locs]
    results.sort(key=lambda x: x.display_wait_minutes)
    return results


@app.get("/api/locations/{location_id}", response_model=LocationWithCommunity, tags=["locations"])
def get_location(location_id: str):
    """Single location by ID."""
    loc = read_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location '{location_id}' not found")
    return _merge_community(loc)


@app.get("/api/locations/{location_id}/history", response_model=list[dict], tags=["locations"])
def get_location_history(
    location_id: str,
    limit: int = Query(default=HISTORY_DISPLAY_LIMIT, ge=1, le=288),
):
    """Historical wait time snapshots for a location, most recent first."""
    history = read_history(location_id, limit=limit)
    if not history:
        raise HTTPException(
            status_code=404,
            detail=f"No history found for '{location_id}'",
        )
    return history


@app.post("/api/checkins", response_model=CheckInResponse, tags=["checkins"])
def submit_checkin(checkin: CheckIn):
    """
    Submit an anonymous community check-in.
    No account required — check-ins expire automatically after 90 minutes.
    """
    now        = time.time()
    arrived_at = now - (checkin.arrived_minutes_ago * 60)
    checkin_id = f"{checkin.location_id}:{int(now * 1000)}"

    write_checkin({
        "checkin_id":  checkin_id,
        "location_id": checkin.location_id,
        "arrived_at":  datetime.fromtimestamp(arrived_at, tz=timezone.utc).isoformat(),
        "busyness":    checkin.busyness,
        "wait_minutes": checkin.wait_minutes,
        "been_seen":   checkin.been_seen,
        "submitted_at": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
        "ts":          now,
    })

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
    """Recent anonymous check-ins for a location (last 90 minutes only)."""
    return [
        CheckInRecord(**c)
        for c in read_checkins(location_id, limit=limit)
    ]
