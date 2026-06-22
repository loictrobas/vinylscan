"""
run_eval.py — Run the vinyl recognition evaluation harness.

Run from backend/:
    python eval/run_eval.py [--prompt v3-literal] [--dataset eval/dataset.json] [--limit 50] [--output eval/results/]
"""
import argparse
import asyncio
import base64
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _download_image(url: str, timeout: int = 15) -> bytes | None:
    """Download image bytes from URL. Returns None on any error."""
    try:
        import requests
        resp = requests.get(url, timeout=timeout, headers={"User-Agent": "VinylScan-Eval/1.0"})
        resp.raise_for_status()
        return resp.content
    except Exception:
        return None


def _find_rank(release_id: int, results: list[dict]) -> int | None:
    """Return 1-based rank of release_id in results list, or None if not found."""
    for i, r in enumerate(results):
        if r.get("id") == release_id:
            return i + 1
    return None


async def _call_claude_with_prompt(
    prompt_text: str,
    image_bytes: bytes,
    media_type: str = "image/jpeg",
) -> dict:
    """Call Claude directly with temperature=0 using the given prompt text."""
    import anthropic

    client = anthropic.AsyncAnthropic()
    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    async def _call() -> dict:
        response = await client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": prompt_text},
                    ],
                }
            ],
        )
        return _extract_json(response.content[0].text)

    try:
        return await _call()
    except (json.JSONDecodeError, ValueError):
        return await _call()


async def main(
    prompt_id_arg: str | None,
    dataset_path: str,
    limit: int,
    output_dir: str,
) -> None:
    from middleware.auth_middleware import decrypt
    from models import User
    from prompts.adapters import adapt
    from services.discogs import search_releases
    from sqlalchemy import select

    backend_dir = Path(__file__).parent.parent

    # 1. Load dataset
    dataset_file = Path(dataset_path) if os.path.isabs(dataset_path) else backend_dir / dataset_path
    if not dataset_file.exists():
        print(f"ERROR: dataset not found at {dataset_file}", file=sys.stderr)
        sys.exit(1)

    with open(dataset_file, encoding="utf-8") as f:
        dataset = json.load(f)

    dataset_hash = dataset.get("hash", "")
    dataset_version = dataset.get("version", "1")
    records_all = dataset.get("records", [])

    # 2. Load prompt from registry
    registry_file = backend_dir / "prompts" / "registry.json"
    registry = json.loads(registry_file.read_text())

    if prompt_id_arg:
        prompt_entry = next((p for p in registry if p["id"] == prompt_id_arg), None)
        if prompt_entry is None:
            print(f"ERROR: prompt '{prompt_id_arg}' not found in registry", file=sys.stderr)
            sys.exit(1)
    else:
        prompt_entry = next((p for p in registry if p.get("active")), None)
        if prompt_entry is None:
            print("ERROR: no active prompt in registry", file=sys.stderr)
            sys.exit(1)

    prompt_id = prompt_entry["id"]
    prompt_schema = prompt_entry["schema"]
    prompt_file = backend_dir / "prompts" / f"{prompt_id}.txt"
    if not prompt_file.exists():
        print(f"ERROR: prompt file not found: {prompt_file}", file=sys.stderr)
        sys.exit(1)

    prompt_text = prompt_file.read_text().strip()
    print(f"Using prompt: {prompt_id} (schema={prompt_schema})", flush=True)

    # 3. Get admin Discogs tokens for search
    from database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User)
            .where(User.is_admin == True, User.discogs_username.isnot(None))
            .limit(1)
        )
        admin = result.scalar_one_or_none()
        if admin is None:
            print("ERROR: no admin user with Discogs connection found", file=sys.stderr)
            sys.exit(1)

    access_token = decrypt(admin.discogs_oauth_token)
    access_token_secret = decrypt(admin.discogs_oauth_token_secret)

    if not access_token or not access_token_secret:
        print("ERROR: admin user has no Discogs OAuth tokens", file=sys.stderr)
        sys.exit(1)

    # 4. Run evaluation
    records_to_eval = records_all[:limit]
    total = len(records_to_eval)
    print(f"Evaluating {total} records (limit={limit}) ...", flush=True)

    result_records = []
    skipped = 0
    timestamp_start = datetime.now(timezone.utc)

    for idx, rec in enumerate(records_to_eval):
        release_id = rec["release_id"]
        truth = rec["truth"]
        difficulty = rec.get("difficulty", "medium")
        genres = rec.get("genres", [])
        image_url = rec.get("image_url")
        image_path = rec.get("image_path")  # local file (from --from-local dataset)

        print(f"[{idx+1}/{total}] release_id={release_id} ({difficulty}) ...", end=" ", flush=True)

        # Load image — prefer local file, fall back to URL download
        image_bytes = None
        skip_reason = None
        if image_path and os.path.exists(image_path):
            with open(image_path, "rb") as f:
                image_bytes = f.read()
        elif image_url:
            image_bytes = _download_image(image_url)
            if image_bytes is None:
                skip_reason = "image_download_failed"
        else:
            skip_reason = "no_image"

        if image_bytes is None:
            print(f"SKIP: {skip_reason}", flush=True)
            result_records.append({
                "release_id": release_id,
                "difficulty": difficulty,
                "genres": genres,
                "ideal": {"top1": False, "top5": False, "rank": None},
                "real": {"top1": False, "top5": False, "rank": None, "extracted": {}},
                "failure_layer": "skip",
                "skipped": True,
                "skip_reason": skip_reason,
            })
            skipped += 1
            continue

        # --- Ideal-input pass: search with truth metadata ---
        ideal_rank = None
        ideal_top1 = False
        ideal_top5 = False
        try:
            truth_year = truth.get("year")
            ideal_results, _ = await search_releases(
                artist=truth.get("artist") or "",
                title=truth.get("title") or "",
                access_token=access_token,
                access_token_secret=access_token_secret,
                label=truth.get("label"),
                catalog_number=truth.get("catalog_number"),
                year=int(truth_year) if truth_year else None,
                tracklist=[],
            )
            ideal_rank = _find_rank(release_id, ideal_results)
            ideal_top1 = ideal_rank == 1
            ideal_top5 = ideal_rank is not None and ideal_rank <= 5
        except Exception as e:
            print(f"  ideal search error: {e}", flush=True)
            ideal_rank = None

        # --- Real-input pass: vision extraction + search ---
        real_rank = None
        real_top1 = False
        real_top5 = False
        extracted = {}
        try:
            raw = await _call_claude_with_prompt(prompt_text, image_bytes)
            adapted = adapt(raw, prompt_schema)
            extracted = {
                "artist": adapted.get("artist"),
                "title": adapted.get("title"),
                "year": adapted.get("year"),
                "label": adapted.get("label"),
                "catalog_number": adapted.get("catalog_number"),
                "confidence": adapted.get("confidence"),
            }

            ext_year = adapted.get("year")
            try:
                ext_year_int = int(ext_year) if ext_year else None
            except (ValueError, TypeError):
                ext_year_int = None

            real_results, _ = await search_releases(
                artist=adapted.get("artist") or "",
                title=adapted.get("title") or "",
                access_token=access_token,
                access_token_secret=access_token_secret,
                label=adapted.get("label"),
                catalog_number=adapted.get("catalog_number"),
                artist_alt=adapted.get("artist_alt"),
                title_alt=adapted.get("title_alt"),
                year=ext_year_int,
                tracklist=[],
                matrix_code=adapted.get("matrix_code"),
                country=adapted.get("country"),
                barcode=adapted.get("barcode"),
            )
            real_rank = _find_rank(release_id, real_results)
            real_top1 = real_rank == 1
            real_top5 = real_rank is not None and real_rank <= 5
        except Exception as e:
            print(f"  real pass error: {e}", flush=True)
            real_rank = None

        # --- Determine failure layer ---
        if ideal_top1 and real_top1:
            failure_layer = "none"
        elif ideal_top1 and not real_top1:
            failure_layer = "extraction"
        elif not ideal_top1:
            failure_layer = "search"
        else:
            failure_layer = "none"

        status_str = f"ideal={'T' if ideal_top1 else 'F'}(rank={ideal_rank}) real={'T' if real_top1 else 'F'}(rank={real_rank}) layer={failure_layer}"
        print(status_str, flush=True)

        result_records.append({
            "release_id": release_id,
            "difficulty": difficulty,
            "genres": genres,
            "ideal": {
                "top1": ideal_top1,
                "top5": ideal_top5,
                "rank": ideal_rank,
            },
            "real": {
                "top1": real_top1,
                "top5": real_top5,
                "rank": real_rank,
                "extracted": extracted,
            },
            "failure_layer": failure_layer,
            "skipped": False,
            "skip_reason": None,
        })

        # Sleep 2s between records to respect Discogs rate limit (60 req/min)
        if idx < total - 1:
            time.sleep(2)

    # 5. Compute summary
    evaluated = [r for r in result_records if not r["skipped"]]
    n_eval = len(evaluated)

    def _pct(values: list[bool]) -> float:
        if not values:
            return 0.0
        return round(100.0 * sum(values) / len(values), 1)

    def _mean_rank(records_list, key: str) -> float | None:
        ranks = [r[key]["rank"] for r in records_list if r[key]["rank"] is not None]
        if not ranks:
            return None
        return round(sum(ranks) / len(ranks), 2)

    ideal_top1_pct = _pct([r["ideal"]["top1"] for r in evaluated])
    ideal_top5_pct = _pct([r["ideal"]["top5"] for r in evaluated])
    ideal_mean_rank = _mean_rank(evaluated, "ideal")
    real_top1_pct = _pct([r["real"]["top1"] for r in evaluated])
    real_top5_pct = _pct([r["real"]["top5"] for r in evaluated])
    real_mean_rank = _mean_rank(evaluated, "real")

    failures = [r for r in evaluated if not r["real"]["top1"]]
    extraction_failures = [r for r in failures if r["failure_layer"] == "extraction"]
    search_failures = [r for r in failures if r["failure_layer"] == "search"]
    extraction_bottleneck_pct = _pct([True] * len(extraction_failures)) if failures else 0.0
    search_bottleneck_pct = _pct([True] * len(search_failures)) if failures else 0.0

    # Recompute as share of all failures
    n_failures = len(failures)
    extraction_bottleneck_pct = round(100.0 * len(extraction_failures) / n_failures, 1) if n_failures else 0.0
    search_bottleneck_pct = round(100.0 * len(search_failures) / n_failures, 1) if n_failures else 0.0

    summary = {
        "total": total,
        "skipped": skipped,
        "ideal_top1_pct": ideal_top1_pct,
        "ideal_top5_pct": ideal_top5_pct,
        "ideal_mean_rank": ideal_mean_rank,
        "real_top1_pct": real_top1_pct,
        "real_top5_pct": real_top5_pct,
        "real_mean_rank": real_mean_rank,
        "extraction_bottleneck_pct": extraction_bottleneck_pct,
        "search_bottleneck_pct": search_bottleneck_pct,
    }

    print("\n=== SUMMARY ===", flush=True)
    print(json.dumps(summary, indent=2), flush=True)

    # 6. Generate run_id and save
    ts = timestamp_start.strftime("%Y-%m-%dT%H-%M-%S")
    run_id = f"{prompt_id}_{ts}"

    output_path = Path(output_dir) if os.path.isabs(output_dir) else backend_dir / output_dir
    output_path.mkdir(parents=True, exist_ok=True)

    result_file = output_path / f"{run_id}.json"
    result_data = {
        "run_id": run_id,
        "prompt_id": prompt_id,
        "prompt_schema": prompt_schema,
        "timestamp": timestamp_start.isoformat(),
        "dataset_hash": dataset_hash,
        "dataset_version": dataset_version,
        "summary": summary,
        "records": result_records,
    }

    with open(result_file, "w", encoding="utf-8") as f:
        json.dump(result_data, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved: {result_file}", flush=True)
    print(f"run_id: {run_id}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run VinylScan eval harness")
    parser.add_argument("--prompt", default=None, help="Prompt ID from registry (default: active prompt)")
    parser.add_argument("--dataset", default="eval/dataset.json", help="Path to dataset.json")
    parser.add_argument("--limit", type=int, default=50, help="Max records to eval (default 50)")
    parser.add_argument("--output", default="eval/results/", help="Output directory for result JSON")
    args = parser.parse_args()

    asyncio.run(main(
        prompt_id_arg=args.prompt,
        dataset_path=args.dataset,
        limit=args.limit,
        output_dir=args.output,
    ))
