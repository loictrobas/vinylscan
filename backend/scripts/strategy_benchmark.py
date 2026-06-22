"""
One-time strategy benchmark.

Pulls all confirmed scans (scan.discogs_release_id is set) from the DB,
replays the Discogs search for each, and reports per-strategy hit rates.

Usage (from backend/):
    python -m scripts.strategy_benchmark [--limit 200] [--csv out.csv]
"""

import argparse
import asyncio
import csv
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select

from database import AsyncSessionLocal
from middleware.auth_middleware import decrypt
from models import Scan, ScanStatus, User
from services import discogs as discogs_svc


async def _run(limit: int, out_csv: str | None) -> None:
    async with AsyncSessionLocal() as db:
        # Fetch confirmed scans with their user (need tokens)
        result = await db.execute(
            select(Scan, User)
            .join(User, Scan.user_id == User.id)
            .where(
                Scan.discogs_release_id.isnot(None),
                Scan.claude_raw_response.isnot(None),
                User.discogs_oauth_token.isnot(None),
            )
            .order_by(Scan.created_at.desc())
            .limit(limit)
        )
        rows = result.all()

    print(f"Found {len(rows)} confirmed scans to benchmark.\n")
    if not rows:
        print("No confirmed scans with Discogs tokens. Confirm some records first.")
        return

    # Per-strategy counters
    hit: dict[str, int] = defaultdict(int)       # strategy found correct release
    fired: dict[str, int] = defaultdict(int)      # strategy was included in search
    first_hit: dict[str, int] = defaultdict(int)  # strategy was first to find correct release
    rank_sum: dict[str, float] = defaultdict(float)
    errors: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    total = len(rows)
    found_total = 0

    csv_rows = []

    for i, (scan, user) in enumerate(rows, 1):
        confirmed_id = scan.discogs_release_id
        raw = scan.claude_raw_response or {}

        artist = scan.artist or ""
        title = scan.title or ""
        label = scan.label or raw.get("label")
        catno = scan.catalog_number or raw.get("catalog_number")
        year = scan.year or raw.get("year")
        fmt = scan.format or raw.get("format")
        tracklist = raw.get("tracklist") or []
        matrix_code = raw.get("matrix_code")
        country = raw.get("country")
        barcode = raw.get("barcode")
        artist_alt = raw.get("artist_alt")
        title_alt = raw.get("title_alt")

        try:
            access_token = decrypt(user.discogs_oauth_token)
            access_token_secret = decrypt(user.discogs_oauth_token_secret)
        except Exception:
            print(f"  [{i}/{total}] SKIP scan {scan.id} — token decrypt failed")
            continue

        print(f"  [{i}/{total}] {artist} — {title} (expected {confirmed_id})", end=" ", flush=True)

        try:
            debug = await discogs_svc.search_releases_debug(
                artist=artist,
                title=title,
                access_token=access_token,
                access_token_secret=access_token_secret,
                label=label,
                catalog_number=catno,
                artist_alt=artist_alt,
                title_alt=title_alt,
                scan_format=fmt,
                year=year,
                tracklist=tracklist,
                matrix_code=matrix_code,
                country=country,
                barcode=barcode,
            )
        except Exception as e:
            print(f"ERROR: {e}")
            continue

        strategies = debug.get("strategies", [])
        ranked = debug.get("ranked", [])

        # Which rank did the correct release appear at?
        ranked_ids = [r["id"] for r in ranked]
        correct_rank = next((r + 1 for r, rid in enumerate(ranked_ids) if rid == confirmed_id), None)

        if correct_rank:
            found_total += 1
            print(f"✓ rank={correct_rank}")
        else:
            print("✗ not found")

        # Per-strategy analysis
        first_finder = None
        for s in strategies:
            name = s["name"]
            err = s.get("error")
            result_count = s["result_count"]

            fired[name] += 1

            if err:
                errors[name][err] += 1
                continue

            top_ids = [r["id"] for r in s.get("top_results", [])]
            if confirmed_id in top_ids:
                hit[name] += 1
                rank_in_strategy = top_ids.index(confirmed_id) + 1
                rank_sum[name] += rank_in_strategy
                if first_finder is None:
                    first_finder = name

        if first_finder:
            first_hit[first_finder] += 1

        csv_rows.append({
            "scan_id": str(scan.id),
            "artist": artist,
            "title": title,
            "catno": catno or "",
            "confirmed_id": confirmed_id,
            "found": bool(correct_rank),
            "rank": correct_rank or "",
            "first_strategy": first_finder or "",
        })

    # ── Report ──────────────────────────────────────────────────────────────────
    print(f"\n{'─'*70}")
    print(f"RESULTS: {found_total}/{total} confirmed releases found in top-10 ranked\n")

    all_strategies = sorted(fired.keys(), key=lambda s: -hit.get(s, 0))

    print(f"{'STRATEGY':<28} {'FIRED':>6} {'HIT':>6} {'HIT%':>7} {'AVG_RANK':>9} {'1ST':>5} {'ERRORS'}")
    print(f"{'─'*28} {'─'*6} {'─'*6} {'─'*7} {'─'*9} {'─'*5} {'─'*20}")

    for name in all_strategies:
        f = fired[name]
        h = hit.get(name, 0)
        pct = h / f * 100 if f else 0
        avg_r = rank_sum.get(name, 0) / h if h else 0
        fst = first_hit.get(name, 0)
        err_str = ", ".join(f"{k}×{v}" for k, v in errors[name].items()) if errors[name] else ""
        print(f"{name:<28} {f:>6} {h:>6} {pct:>6.1f}% {avg_r:>9.2f} {fst:>5}  {err_str}")

    if out_csv:
        with open(out_csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=csv_rows[0].keys())
            w.writeheader()
            w.writerows(csv_rows)
        print(f"\nPer-scan CSV written to {out_csv}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Strategy hit-rate benchmark")
    parser.add_argument("--limit", type=int, default=200, help="Max confirmed scans to test")
    parser.add_argument("--csv", type=str, default=None, help="Write per-scan CSV to this path")
    args = parser.parse_args()
    asyncio.run(_run(args.limit, args.csv))


if __name__ == "__main__":
    main()
