#!/usr/bin/env python3
"""Refresh the bundled OSM snapshots in data/ from the Overpass API.

The site shows these snapshots instantly, then tries Overpass in the
background. Run manually or via .github/workflows/update-osm-data.yml.

Keep the queries in sync with OVERPASS_QUERY / CYCLING_QUERY in app.js.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BOUNDS = "45.510,-73.600,45.545,-73.555"

QUERIES = {
    "parkings": f"""[out:json][timeout:60];
(
  way["amenity"="parking"]["parking"!="street_side"]["parking"!="on_street"]["parking"!="lane"]
    ["access"!="private"]["access"!="residents"]["access"!="no"]({BOUNDS});
  node["amenity"="parking"]["parking"!="street_side"]["parking"!="on_street"]["parking"!="lane"]
    ["access"!="private"]["access"!="residents"]["access"!="no"]({BOUNDS});
);
out center tags;""",
    "cycling": f"""[out:json][timeout:60];
(
  way["highway"="cycleway"]({BOUNDS});
  way["cycleway"~"lane|track|shared_lane"]({BOUNDS});
);
out geom;""",
}

# Public Overpass instances are frequently overloaded (timeouts, 502/504):
# try each one several times with backoff before giving up.
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
ATTEMPTS_PER_ENDPOINT = 3
BACKOFF_SECONDS = [10, 30, 60]

# Sanity floor: never overwrite a good snapshot with a suspiciously small one
MIN_ELEMENTS = {"parkings": 20, "cycling": 20}

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
USER_AGENT = "statio-plateau/1.0 (+https://parking.gabfortin.com)"


def fetch(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for endpoint in ENDPOINTS:
        for attempt in range(ATTEMPTS_PER_ENDPOINT):
            try:
                req = urllib.request.Request(endpoint, data=body, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=120) as res:
                    payload = json.load(res)
                if not isinstance(payload.get("elements"), list):
                    raise ValueError("no elements in response")
                return payload["elements"]
            except Exception as err:  # noqa: BLE001 - try the next mirror
                last_err = err
                print(f"  {endpoint} (try {attempt + 1}) failed: {err}", file=sys.stderr)
                time.sleep(BACKOFF_SECONDS[attempt])
    raise RuntimeError(f"all Overpass endpoints failed: {last_err}")


def slim(name, elements):
    """Drop fields the app never reads and round coordinates to ~10 cm."""
    out = []
    for e in elements:
        item = {"type": e["type"], "id": e["id"]}
        if "tags" in e:
            item["tags"] = e["tags"]
        if "lat" in e:
            item["lat"], item["lon"] = round(e["lat"], 6), round(e["lon"], 6)
        if "center" in e:
            item["center"] = {"lat": round(e["center"]["lat"], 6), "lon": round(e["center"]["lon"], 6)}
        if name == "cycling":
            item.pop("tags", None)
            item["geometry"] = [{"lat": round(n["lat"], 6), "lon": round(n["lon"], 6)} for n in e.get("geometry", [])]
        out.append(item)
    return sorted(out, key=lambda x: (x["type"], x["id"]))  # stable diffs


def main():
    DATA_DIR.mkdir(exist_ok=True)
    failed = False
    for name, query in QUERIES.items():
        print(f"Fetching {name}…")
        try:
            elements = slim(name, fetch(query))
        except Exception as err:  # noqa: BLE001
            print(f"  skipped: {err}", file=sys.stderr)
            failed = True
            continue
        if len(elements) < MIN_ELEMENTS[name]:
            print(f"  skipped: only {len(elements)} elements", file=sys.stderr)
            failed = True
            continue

        path = DATA_DIR / f"{name}.json"
        old = json.loads(path.read_text()) if path.exists() else {}
        if old.get("elements") == elements:
            print(f"  unchanged ({len(elements)} elements)")
            continue
        snapshot = {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "© OpenStreetMap contributors, ODbL",
            "elements": elements,
        }
        path.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")))
        print(f"  wrote {path.name}: {len(elements)} elements, {path.stat().st_size // 1024} KB")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
