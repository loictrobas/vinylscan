"""
eval_router.py — Admin-only endpoints for the eval harness.
"""
import json
import os
import uuid
from collections import Counter
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from database import get_db
from models import Scan
from routers.admin import require_admin

router = APIRouter(prefix="/admin/eval", tags=["eval"])

EVAL_DIR = Path(__file__).parent.parent / "eval"
DATASET_FILE = EVAL_DIR / "dataset.json"
RESULTS_DIR = EVAL_DIR / "results"


def _load_dataset() -> dict:
    if not DATASET_FILE.exists():
        raise HTTPException(status_code=404, detail="Dataset not built yet. Run eval/build_dataset.py first.")
    with open(DATASET_FILE, encoding="utf-8") as f:
        return json.load(f)


def _load_run(run_id: str) -> dict:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    result_file = RESULTS_DIR / f"{run_id}.json"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    with open(result_file, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# GET /admin/eval/dataset
# ---------------------------------------------------------------------------

@router.get("/dataset")
async def get_dataset_metadata(_admin=Depends(require_admin)):
    """Return dataset metadata: version, hash, count, difficulty_distribution, genre_distribution."""
    dataset = _load_dataset()

    records = dataset.get("records", [])
    difficulty_counter: Counter = Counter(r.get("difficulty") for r in records)
    genre_counter: Counter = Counter()
    for r in records:
        for g in r.get("genres", []):
            genre_counter[g] += 1

    return {
        "version": dataset.get("version"),
        "created_at": dataset.get("created_at"),
        "hash": dataset.get("hash"),
        "count": dataset.get("count", len(records)),
        "difficulty_distribution": dict(difficulty_counter),
        "genre_distribution": dict(genre_counter.most_common()),
    }


# ---------------------------------------------------------------------------
# GET /admin/eval/runs
# ---------------------------------------------------------------------------

@router.get("/runs")
async def list_runs(_admin=Depends(require_admin)):
    """List all result files sorted by timestamp desc. Returns summary without per-record data."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    run_files = sorted(RESULTS_DIR.glob("*.json"), reverse=True)
    runs = []
    for f in run_files:
        try:
            with open(f, encoding="utf-8") as fp:
                data = json.load(fp)
            runs.append({
                "run_id": data.get("run_id"),
                "prompt_id": data.get("prompt_id"),
                "prompt_schema": data.get("prompt_schema"),
                "timestamp": data.get("timestamp"),
                "dataset_hash": data.get("dataset_hash"),
                "dataset_version": data.get("dataset_version"),
                "summary": data.get("summary"),
            })
        except Exception:
            # Skip corrupt files
            continue

    # Sort by timestamp descending (ISO strings sort lexicographically)
    runs.sort(key=lambda r: r.get("timestamp") or "", reverse=True)
    return runs


# ---------------------------------------------------------------------------
# GET /admin/eval/runs/{run_id}
# ---------------------------------------------------------------------------

@router.get("/runs/{run_id}")
async def get_run(run_id: str, _admin=Depends(require_admin)):
    """Return full run result JSON including per-record data."""
    return _load_run(run_id)


# ---------------------------------------------------------------------------
# GET /admin/eval/compare
# ---------------------------------------------------------------------------

@router.get("/compare")
async def compare_runs(a: str, b: str, _admin=Depends(require_admin)):
    """
    Compare two runs on-the-fly.
    Query params: ?a={run_id}&b={run_id}
    Returns comparison dict with fixed/broken/both_pass/both_fail.
    """
    run_a = _load_run(a)
    run_b = _load_run(b)

    # Import compare logic from compare.py (same package)
    import sys, os
    sys.path.insert(0, str(EVAL_DIR.parent))
    from eval.compare import compare_runs as _compare

    return _compare(run_a, run_b)


# ---------------------------------------------------------------------------
# GET /admin/eval/prompts
# ---------------------------------------------------------------------------

@router.get("/prompts")
async def list_prompts(_admin=Depends(require_admin)):
    """Return the full prompts/registry.json content."""
    registry_file = Path(__file__).parent.parent / "prompts" / "registry.json"
    if not registry_file.exists():
        raise HTTPException(status_code=404, detail="prompts/registry.json not found")
    with open(registry_file, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# POST /admin/eval/save-image
# ---------------------------------------------------------------------------

# Keep in sync with main.py — default under backend/data so images survive reboots
_IMAGES_DIR = os.getenv("IMAGES_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "images"))
_TEST_IMAGES_DIR = EVAL_DIR / "test_images"


class SaveImageRequest(BaseModel):
    scan_id: str
    release_id: int


@router.post("/save-image")
async def save_eval_image(body: SaveImageRequest, db=Depends(get_db), _admin=Depends(require_admin)):
    """
    Copy a scan's image to eval/test_images/{release_id}.jpg as a ground-truth test case.
    The scan must belong to the current admin user (checked via require_admin which injects user).
    """
    try:
        scan_uuid = uuid.UUID(body.scan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scan_id")

    result = await db.execute(select(Scan).where(Scan.id == scan_uuid))
    scan = result.scalar_one_or_none()
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    image_url: str = scan.image_url

    # Fetch image bytes — local file or remote URL
    if image_url.startswith("/images/"):
        filename = image_url.removeprefix("/images/")
        local_path = os.path.join(_IMAGES_DIR, filename)
        if not os.path.exists(local_path):
            raise HTTPException(status_code=404, detail=f"Local image not found: {local_path}")
        with open(local_path, "rb") as f:
            image_bytes = f.read()
    else:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(image_url, headers={"User-Agent": "VinylScan-Eval/1.0"})
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Failed to fetch image: HTTP {resp.status_code}")
            image_bytes = resp.content

    _TEST_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    dest = _TEST_IMAGES_DIR / f"{body.release_id}.jpg"
    dest.write_bytes(image_bytes)

    return {"ok": True, "path": str(dest), "release_id": body.release_id, "size": len(image_bytes)}
