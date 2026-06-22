"""
build_dataset.py — Build the frozen evaluation dataset from the admin's Discogs collection.

Run from backend/:
    python eval/build_dataset.py [--limit 200] [--output eval/dataset.json]
"""
import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

# Genres that should sort first (electronic / dance focus)
_PRIORITY_GENRES = {"Electronic", "Hip Hop", "Funk / Soul", "Jazz"}

_ARTIST_SUFFIX_RE = re.compile(r"\s*\(\d+\)\s*$")


def _strip_artist_suffix(name: str) -> str:
    """Strip Discogs disambiguation suffix like ' (2)' from artist names."""
    return _ARTIST_SUFFIX_RE.sub("", name).strip()


def _classify_difficulty(catalog_number, label, year) -> str:
    if catalog_number is not None and label is not None:
        return "easy"
    if catalog_number is None and (year is None or year < 1985):
        return "hard"
    return "medium"


async def main(limit: int, output: str) -> None:
    from database import AsyncSessionLocal
    from middleware.auth_middleware import decrypt
    from models import User
    from services.discogs import get_full_collection
    from sqlalchemy import select

    # 1. Find first admin user
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User)
            .where(User.is_admin == True, User.discogs_username.isnot(None))
            .limit(1)
        )
        admin = result.scalar_one_or_none()

    if admin is None:
        print("ERROR: no admin user found", file=sys.stderr)
        sys.exit(1)

    username = admin.discogs_username
    if not username:
        print("ERROR: admin user has no discogs_username set", file=sys.stderr)
        sys.exit(1)

    access_token = decrypt(admin.discogs_oauth_token)
    access_token_secret = decrypt(admin.discogs_oauth_token_secret)

    if not access_token or not access_token_secret:
        print("ERROR: admin user has no Discogs OAuth tokens", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching Discogs collection for @{username} ...", flush=True)
    items = await get_full_collection(username, access_token, access_token_secret)
    print(f"Fetched {len(items)} items from collection", flush=True)

    # 2. Parse each collection item
    records = []
    seen_ids: set[int] = set()

    for item in items:
        basic = item.get("basic_information", {})

        release_id = basic.get("id")
        if release_id is None:
            continue

        # Deduplicate by release_id (keep first)
        if release_id in seen_ids:
            continue
        seen_ids.add(release_id)

        # Artist — strip disambiguation suffix
        artists = basic.get("artists", [])
        artist = _strip_artist_suffix(artists[0]["name"]) if artists else None

        title = basic.get("title") or None

        # Year: 0 = unknown → null
        raw_year = basic.get("year", 0)
        year = raw_year if raw_year and raw_year > 0 else None

        # Label and catalog number
        labels = basic.get("labels", [])
        label = labels[0]["name"] if labels else None
        raw_catno = labels[0].get("catno") if labels else None
        # Skip "none" string (Discogs placeholder)
        catalog_number = None
        if raw_catno and raw_catno.strip().lower() != "none":
            catalog_number = raw_catno.strip()

        image_url = basic.get("cover_image") or None
        genres: list[str] = basic.get("genres") or []
        styles: list[str] = basic.get("styles") or []

        difficulty = _classify_difficulty(catalog_number, label, year)

        records.append({
            "release_id": release_id,
            "image_url": image_url,
            "truth": {
                "artist": artist,
                "title": title,
                "year": year,
                "label": label,
                "catalog_number": catalog_number,
            },
            "difficulty": difficulty,
            "genres": genres,
            "styles": styles,
        })

    # 3. Sort: priority genres first, then others
    def _sort_key(r):
        has_priority = bool(set(r["genres"]) & _PRIORITY_GENRES)
        return (0 if has_priority else 1)

    records.sort(key=_sort_key)

    # 4. Apply limit
    records = records[:limit]

    # 5. Compute SHA256 hash of sorted release_id list
    release_ids_sorted = sorted(r["release_id"] for r in records)
    hash_input = json.dumps(release_ids_sorted).encode()
    dataset_hash = hashlib.sha256(hash_input).hexdigest()

    # 6. Build output
    dataset = {
        "version": "1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "hash": dataset_hash,
        "count": len(records),
        "records": records,
    }

    # 7. Write to file
    output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), output) \
        if not os.path.isabs(output) else output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    print(f"Dataset written: {output_path}", flush=True)
    print(f"  count={len(records)}, hash={dataset_hash[:12]}...", flush=True)
    easy = sum(1 for r in records if r["difficulty"] == "easy")
    medium = sum(1 for r in records if r["difficulty"] == "medium")
    hard = sum(1 for r in records if r["difficulty"] == "hard")
    print(f"  difficulty: easy={easy}, medium={medium}, hard={hard}", flush=True)


async def main_from_local(images_dir: str, output: str) -> None:
    """Build dataset from local eval/test_images/{release_id}.jpg files."""
    from database import AsyncSessionLocal
    from models import Record
    from sqlalchemy import select

    images_path = Path(images_dir) if os.path.isabs(images_dir) else \
        Path(os.path.dirname(os.path.dirname(__file__))) / images_dir

    if not images_path.exists():
        print(f"ERROR: images dir not found: {images_path}", file=sys.stderr)
        sys.exit(1)

    image_files = sorted(images_path.glob("*.jpg")) + sorted(images_path.glob("*.jpeg")) + \
        sorted(images_path.glob("*.png"))

    if not image_files:
        print(f"ERROR: no images found in {images_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(image_files)} images in {images_path}", flush=True)

    # Build release_id → truth map from catalog DB
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Record).where(Record.discogs_release_id.isnot(None))
        )
        catalog_records = result.scalars().all()

    catalog_map: dict[int, Record] = {r.discogs_release_id: r for r in catalog_records if r.discogs_release_id}
    print(f"Loaded {len(catalog_map)} catalog records with Discogs IDs", flush=True)

    records = []
    for img_path in image_files:
        stem = img_path.stem
        try:
            release_id = int(stem)
        except ValueError:
            print(f"  SKIP {img_path.name}: filename is not a release_id", flush=True)
            continue

        cat = catalog_map.get(release_id)
        if cat:
            artist = cat.artist
            title = cat.title
            year = cat.year
            label = cat.label
            catalog_number = cat.catalog_number
        else:
            artist = title = year = label = catalog_number = None
            print(f"  WARN release_id={release_id}: not in catalog — truth will be empty", flush=True)

        difficulty = _classify_difficulty(catalog_number, label, year)

        records.append({
            "release_id": release_id,
            "image_path": str(img_path),   # local path — run_eval.py reads this
            "image_url": None,
            "truth": {
                "artist": artist,
                "title": title,
                "year": year,
                "label": label,
                "catalog_number": catalog_number,
            },
            "difficulty": difficulty,
            "genres": [],
            "styles": [],
        })

    release_ids_sorted = sorted(r["release_id"] for r in records)
    hash_input = json.dumps(release_ids_sorted).encode()
    dataset_hash = hashlib.sha256(hash_input).hexdigest()

    dataset = {
        "version": "1",
        "source": "local_images",
        "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "hash": dataset_hash,
        "count": len(records),
        "records": records,
    }

    output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), output) \
        if not os.path.isabs(output) else output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    print(f"Dataset written: {output_path}", flush=True)
    print(f"  count={len(records)}, hash={dataset_hash[:12]}...", flush=True)
    easy = sum(1 for r in records if r["difficulty"] == "easy")
    medium = sum(1 for r in records if r["difficulty"] == "medium")
    hard = sum(1 for r in records if r["difficulty"] == "hard")
    print(f"  difficulty: easy={easy}, medium={medium}, hard={hard}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build VinylScan eval dataset from Discogs collection")
    parser.add_argument("--limit", type=int, default=200, help="Max records to include (default 200)")
    parser.add_argument("--output", default="eval/dataset.json", help="Output path (default eval/dataset.json)")
    parser.add_argument("--from-local", metavar="IMAGES_DIR", default=None,
                        help="Build from local label photos in IMAGES_DIR (filenames = release_id.jpg)")
    args = parser.parse_args()

    if args.from_local:
        asyncio.run(main_from_local(images_dir=args.from_local, output=args.output))
    else:
        asyncio.run(main(limit=args.limit, output=args.output))
