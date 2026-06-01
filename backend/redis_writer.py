"""
redis_writer.py
---------------
Single point of contact between SweetWagon and Redis.
All reads and writes go through here — scraper.py and main.py
both import from this module; neither talks to Redis directly.

Schema
------
  er:wait:<id>            Hash    — latest scraped record for a location
  er:wait:<id>:history    List    — up to 288 snapshots (24h at 5-min cadence)
  er:locations            SortedSet — all location IDs scored by wait_minutes
  er:last_scraped         String  — ISO-8601 UTC timestamp of last scrape
  sw:checkins:<id>        List    — anonymous community check-ins (90-min TTL)
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

import redis

log = logging.getLogger(__name__)

REDIS_URL         = os.getenv("REDIS_URL", "redis://localhost:6379/0")
HISTORY_CAP       = 288        # 24 hours × 12 scrapes/hour
CHECKIN_CAP       = 500        # max check-ins stored per location
CHECKIN_TTL       = 90 * 60   # seconds — check-ins older than this are ignored
LOCATION_TTL      = 3_600      # 1 hour — scraped hash expires if scraper stops
HISTORY_TTL       = 86_400     # 24 hours


def get_client() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


# ── Writes ─────────────────────────────────────────────────────────────────────

def write_locations(records: list[dict]) -> None:
    """
    Persist a list of scraped location records to Redis.
    Called by scraper.py after each successful scrape.

    Each record must contain:
        id, name, address, borough, lat, lng,
        wait_minutes, scraped_at, source
    """
    r = get_client()
    pipe = r.pipeline(transaction=True)

    for rec in records:
        loc_id      = rec["id"]
        hash_key    = f"er:wait:{loc_id}"
        history_key = f"er:wait:{loc_id}:history"

        pipe.hset(hash_key, mapping={
            "id":           rec["id"],
            "name":         rec["name"],
            "address":      rec["address"],
            "borough":      rec["borough"],
            "lat":          str(rec["lat"]),
            "lng":          str(rec["lng"]),
            "wait_minutes": str(rec["wait_minutes"]),
            "scraped_at":   rec["scraped_at"],
            "source":       rec["source"],
        })
        pipe.expire(hash_key, LOCATION_TTL)

        pipe.lpush(history_key, json.dumps(rec))
        pipe.ltrim(history_key, 0, HISTORY_CAP - 1)
        pipe.expire(history_key, HISTORY_TTL)

        pipe.zadd("er:locations", {loc_id: rec["wait_minutes"]})

    pipe.set("er:last_scraped", datetime.now(timezone.utc).isoformat())
    pipe.expire("er:last_scraped", LOCATION_TTL)
    pipe.execute()

    log.info("Wrote %d location(s) to Redis", len(records))


def write_checkin(record: dict) -> None:
    """
    Persist a single anonymous community check-in.
    Called by the POST /api/checkins route in main.py.

    Record must contain:
        checkin_id, location_id, arrived_at, busyness,
        wait_minutes, been_seen, submitted_at, ts
    """
    r = get_client()
    key = f"sw:checkins:{record['location_id']}"

    pipe = r.pipeline(transaction=True)
    pipe.lpush(key, json.dumps(record))
    pipe.ltrim(key, 0, CHECKIN_CAP - 1)
    pipe.expire(key, CHECKIN_TTL)
    pipe.execute()

    log.info("Wrote check-in %s", record["checkin_id"])


# ── Reads ──────────────────────────────────────────────────────────────────────

def read_last_scraped() -> str:
    """Return the ISO-8601 timestamp of the last successful scrape."""
    r = get_client()
    return r.get("er:last_scraped") or "unknown"


def read_location(location_id: str) -> dict | None:
    """
    Return the latest scraped record for a single location,
    or None if it doesn't exist / has expired.
    """
    r = get_client()
    raw = r.hgetall(f"er:wait:{location_id}")
    if not raw:
        return None
    return _cast_location(raw)


def read_all_locations(borough: str | None = None) -> list[dict]:
    """
    Return all location records sorted by wait time (shortest first).
    Optionally filter by borough name (case-insensitive).
    """
    r = get_client()
    loc_ids = r.zrange("er:locations", 0, -1)
    results = []
    for loc_id in loc_ids:
        raw = r.hgetall(f"er:wait:{loc_id}")
        if not raw:
            continue
        loc = _cast_location(raw)
        if borough and loc["borough"].lower() != borough.lower():
            continue
        results.append(loc)
    return results


def read_history(location_id: str, limit: int = 12) -> list[dict]:
    """
    Return up to `limit` historical snapshots for a location,
    most recent first. Useful for sparkline charts.
    """
    r = get_client()
    raw = r.lrange(f"er:wait:{location_id}:history", 0, limit - 1)
    return [json.loads(entry) for entry in raw]


def read_checkins(location_id: str, limit: int = 500) -> list[dict]:
    """
    Return recent anonymous check-ins for a location.
    Filters out anything older than CHECKIN_TTL seconds.
    """
    r = get_client()
    raw = r.lrange(f"sw:checkins:{location_id}", 0, -1)
    now = time.time()
    recent = [
        json.loads(c) for c in raw
        if now - json.loads(c).get("ts", 0) < CHECKIN_TTL
    ]
    return recent[:limit]


# ── Internal helpers ───────────────────────────────────────────────────────────

def _cast_location(raw: dict) -> dict:
    """Cast Redis string values back to their correct Python types."""
    return {
        **raw,
        "wait_minutes": int(raw["wait_minutes"]),
        "lat":          float(raw["lat"]),
        "lng":          float(raw["lng"]),
    }


# ── CLI sanity check ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    locs = read_all_locations()
    if locs:
        print(f"\n{'Location':<40} {'Wait':>6}  Scraped at")
        print("-" * 70)
        for loc in locs:
            print(f"{loc['name']:<40} {loc['wait_minutes']:>5}m  {loc['scraped_at']}")
    else:
        print("Redis is empty — run scraper.py first")
