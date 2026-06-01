"""
redis_writer.py
---------------
Writes scraped ER wait time records into Redis.

Schema
------
Each location gets two keys:

  er:wait:<location_id>          — Hash of the latest record for that location
  er:wait:<location_id>:history  — List of JSON snapshots (capped at 288 entries
                                   = 24 hours at a 5-minute scrape interval)

A sorted set index lets the frontend fetch all locations at once:

  er:locations                   — Sorted set: member=location_id, score=wait_minutes
                                   (so ZRANGE er:locations 0 -1 WITHSCORES returns
                                   all locations sorted by current wait time)

A string key holds the last scrape timestamp:

  er:last_scraped                — ISO-8601 UTC timestamp string
"""

import json
import logging
import os
from datetime import datetime, timezone

import redis

log = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
HISTORY_CAP = 288  # 24 hours × 12 scrapes/hour


def get_client() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


def write_to_redis(records: list[dict]) -> None:
    """
    Persist a list of scraped location records to Redis.

    Each record must contain at minimum:
        id, name, address, borough, lat, lng,
        wait_minutes, scraped_at, source
    """
    r = get_client()

    pipeline = r.pipeline(transaction=True)

    for rec in records:
        loc_id = rec["id"]
        hash_key = f"er:wait:{loc_id}"
        history_key = f"er:wait:{loc_id}:history"

        # ── Latest record as a flat hash (easy field-level reads) ──────────
        pipeline.hset(hash_key, mapping={
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
        pipeline.expire(hash_key, 3600)  # auto-expire after 1 hour of no updates

        # ── Append to history list, cap at HISTORY_CAP ────────────────────
        pipeline.lpush(history_key, json.dumps(rec))
        pipeline.ltrim(history_key, 0, HISTORY_CAP - 1)
        pipeline.expire(history_key, 86_400)  # 24 hours

        # ── Update sorted set index (score = wait time for easy sorting) ──
        pipeline.zadd("er:locations", {loc_id: rec["wait_minutes"]})

    # ── Global last-scraped timestamp ─────────────────────────────────────
    pipeline.set("er:last_scraped", datetime.now(timezone.utc).isoformat())
    pipeline.expire("er:last_scraped", 3600)

    pipeline.execute()
    log.info("Wrote %d record(s) to Redis (%s)", len(records), REDIS_URL)


def read_all_locations(r: redis.Redis | None = None) -> list[dict]:
    """
    Convenience reader — returns all location records sorted by wait time.
    Useful for testing or for a simple API endpoint.
    """
    if r is None:
        r = get_client()

    loc_ids = r.zrange("er:locations", 0, -1)  # sorted by wait_minutes asc
    results = []
    for loc_id in loc_ids:
        data = r.hgetall(f"er:wait:{loc_id}")
        if data:
            data["wait_minutes"] = int(data["wait_minutes"])
            data["lat"] = float(data["lat"])
            data["lng"] = float(data["lng"])
            results.append(data)
    return results


def read_history(location_id: str, limit: int = 12, r: redis.Redis | None = None) -> list[dict]:
    """
    Returns up to `limit` historical snapshots for a given location,
    most recent first.
    """
    if r is None:
        r = get_client()
    raw = r.lrange(f"er:wait:{location_id}:history", 0, limit - 1)
    return [json.loads(entry) for entry in raw]


if __name__ == "__main__":
    # Quick sanity-check read
    logging.basicConfig(level=logging.INFO)
    locs = read_all_locations()
    if locs:
        print(f"\n{'Location':<40} {'Wait':>6}  Scraped at")
        print("-" * 70)
        for loc in locs:
            print(f"{loc['name']:<40} {loc['wait_minutes']:>5}m  {loc['scraped_at']}")
    else:
        print("Redis is empty — run scraper.py first")
