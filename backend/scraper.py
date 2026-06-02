"""
scraper.py
----------
Scrapes live ER wait times from NYU Langone's public emergency care page
using requests + BeautifulSoup (no browser binary needed — data is
server-rendered into the raw HTML).

Run once:      python scraper.py
Dry-run test:  python scraper.py --test
Run on cron:   */5 * * * * /usr/bin/python3 /path/to/scraper.py
"""

import json
import sys
import logging
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

NYU_URL = "https://nyulangone.org/care-services/emergency-care"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Maps a stable substring of the on-page location name to our canonical record.
LOCATION_MAP = [
    {
        "id": "perelman",
        "match": "Perelman",
        "name": "Ronald O. Perelman Center for Emergency Services",
        "address": "570 First Ave, New York, NY 10016",
        "borough": "Manhattan",
        "lat": 40.7421,
        "lng": -73.9739,
    },
    {
        "id": "brooklyn",
        "match": "Brooklyn",
        "name": "NYU Langone Hospital — Brooklyn",
        "address": "150 55th St, Brooklyn, NY 11220",
        "borough": "Brooklyn",
        "lat": 40.6436,
        "lng": -74.0051,
    },
    {
        "id": "cobble-hill",
        "match": "Home Depot",
        "name": "NYU Langone Hospital — Cobble Hill",
        "address": "70 Atlantic Ave, Brooklyn, NY 11201",
        "borough": "Brooklyn",
        "lat": 40.6897,
        "lng": -73.9952,
    },
    {
        "id": "long-island",
        "match": "Long Island",
        "name": "NYU Langone Hospital — Long Island",
        "address": "259 First St, Mineola, NY 11501",
        "borough": "Long Island",
        "lat": 40.7484,
        "lng": -73.6407,
    },
]


def fetch_html(url: str) -> str:
    """Fetch raw HTML from the given URL."""
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    log.info("Fetched %s — %d bytes", url, len(resp.content))
    return resp.text


def parse_wait_times(html: str) -> list[dict]:
    """
    Iterate over each <li class="our-locations__additional-location"> block
    and extract the location title and wait time number from within it.

    Each <li> is self-contained — title and wait number are scoped inside it,
    so there is no risk of cross-matching between locations.
    """
    soup = BeautifulSoup(html, "html.parser")
    scraped_at = datetime.now(timezone.utc).isoformat()
    results = []
    seen_ids = set()

    for li in soup.find_all("li", class_="our-locations__additional-location"):
        title_el = li.find(class_="our-locations__location-title")
        wait_el  = li.find(class_="our-locations__wait-time-number")

        # Skip locations with no wait time widget (Suffolk, KiDS ED, etc.)
        if not title_el or not wait_el:
            continue

        title_text   = title_el.get_text(strip=True)
        wait_minutes = int(wait_el.get_text(strip=True))

        # Match title text against LOCATION_MAP
        location = None
        for loc in LOCATION_MAP:
            if loc["match"].lower() in title_text.lower():
                location = loc
                break

        if location is None:
            log.warning("Unmatched location: %s", title_text)
            continue

        if location["id"] in seen_ids:
            continue  # skip mobile duplicate
        seen_ids.add(location["id"])

        record = {
            "id":           location["id"],
            "name":         location["name"],
            "address":      location["address"],
            "borough":      location["borough"],
            "lat":          location["lat"],
            "lng":          location["lng"],
            "wait_minutes": wait_minutes,
            "scraped_at":   scraped_at,
            "source":       "nyu_langone_official",
        }
        results.append(record)
        log.info("  %-15s → %d min", location["id"], wait_minutes)

    return results


def scrape() -> list[dict]:
    html = fetch_html(NYU_URL)
    results = parse_wait_times(html)
    if not results:
        log.warning("No wait times extracted — page structure may have changed")
    return results


def test_scrape() -> None:
    """
    Dry-run mode: scrape the page and pretty-print results to stdout
    without touching Redis. Exits with code 1 if nothing was parsed so
    it's safe to use in CI or a pre-deploy check.

    Usage:  python scraper.py --test
    """
    print("\n── NYU Langone ER Wait Time Scraper — DRY RUN ──────────────────\n")

    try:
        records = scrape()
    except requests.RequestException as exc:
        print(f"[FAIL] HTTP error: {exc}")
        sys.exit(1)

    if not records:
        print("[FAIL] No records parsed — the page structure may have changed.")
        print("       Check LOCATION_MAP matches and re-inspect the live HTML.")
        sys.exit(1)

    # ── Summary table ────────────────────────────────────────────────────
    col_w = 42
    print(f"  {'Location':<{col_w}} {'Wait':>6}  {'Borough':<12}  Scraped at")
    print("  " + "─" * (col_w + 42))
    for rec in records:
        print(
            f"  {rec['name']:<{col_w}} "
            f"{rec['wait_minutes']:>5}m  "
            f"{rec['borough']:<12}  "
            f"{rec['scraped_at']}"
        )

    # ── Full JSON dump ───────────────────────────────────────────────────
    print("\n── Raw JSON payload (what would be sent to Redis) ──────────────\n")
    print(json.dumps(records, indent=2))

    # ── Validation checks ────────────────────────────────────────────────
    print("\n── Validation ──────────────────────────────────────────────────\n")
    expected_ids = {loc["id"] for loc in LOCATION_MAP}
    found_ids    = {rec["id"] for rec in records}
    missing      = expected_ids - found_ids

    for rec in records:
        wait = rec["wait_minutes"]
        status = "✓" if 0 < wait < 600 else "⚠ suspicious value"
        print(f"  {status}  {rec['id']}: {wait} min")

    if missing:
        print(f"\n  ⚠ Missing locations (not found on page): {', '.join(missing)}")
    else:
        print(f"\n  ✓ All {len(LOCATION_MAP)} expected locations found")

    print("\n── Redis write skipped (dry run) ───────────────────────────────\n")


if __name__ == "__main__":
    if "--test" in sys.argv:
        test_scrape()
    else:
        from redis_writer import write_locations
        records = scrape()
        if records:
            write_locations(records)
        else:
            log.error("Nothing to write — scrape returned empty results")
