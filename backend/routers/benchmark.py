"""
Admin benchmark — measure Claude identification accuracy against Discogs ground truth.

POST /admin/benchmark/run  — SSE streaming, runs Claude on N collection items
"""
import asyncio
import json
import os
from difflib import SequenceMatcher

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models import User
from routers.admin import require_admin
from services import claude_vision
from services import discogs as discogs_svc

router = APIRouter(prefix="/admin/benchmark", tags=["admin-benchmark"])

_DISCOGS_BASE = "https://api.discogs.com"
_UA = "VinylScan/1.0 +https://vinylscan.app"


# ── Fuzzy helpers ─────────────────────────────────────────────────────────────

def _sim(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def _clean_artist(name: str) -> str:
    """Strip Discogs disambiguation suffix like '(2)' from artist names."""
    import re
    return re.sub(r"\s*\(\d+\)\s*$", "", name).strip()


def _classify_errors(gt: dict, claude: dict) -> list[str]:
    codes: list[str] = []
    artist_sim = _sim(claude.get("artist"), gt.get("artist"))
    title_sim  = _sim(claude.get("title"),  gt.get("title"))

    # A — field extraction errors
    if artist_sim < 0.6:
        if (
            _sim(claude.get("artist"), gt.get("title")) > 0.7
            and _sim(claude.get("title"), gt.get("artist")) > 0.7
        ):
            codes.append("A3_swapped")
        elif gt.get("label") and _sim(claude.get("artist"), gt.get("label")) > 0.7:
            codes.append("A5_label_as_artist")
        else:
            codes.append("A1_artist_wrong")

    if title_sim < 0.6 and "A3_swapped" not in codes:
        if gt.get("label") and _sim(claude.get("title"), gt.get("label")) > 0.7:
            codes.append("A6_label_as_title")
        else:
            codes.append("A2_title_wrong")

    if gt.get("catno") and str(gt["catno"]).lower() not in ("none", "", "—"):
        cc = claude.get("catalog_number")
        if not cc:
            codes.append("A8_catno_missed")
        elif _sim(cc, gt["catno"]) < 0.7:
            codes.append("A7_catno_wrong")

    if gt.get("year") and claude.get("year"):
        try:
            if abs(int(claude["year"]) - int(gt["year"])) > 2:
                codes.append("A9_year_wrong")
        except (ValueError, TypeError):
            pass

    # B — confidence calibration
    conf = int(claude.get("confidence", 50) or 50)
    overall_correct = artist_sim >= 0.7 and title_sim >= 0.7
    if overall_correct and conf < 40:
        codes.append("B2_underconfident")
    elif not overall_correct and conf >= 80:
        codes.append("B1_overconfident")
    if claude.get("low_information") and (artist_sim > 0.5 or title_sim > 0.5):
        codes.append("B3_false_low_info")

    return codes


def _overall_status(gt: dict, claude: dict) -> str:
    a = _sim(claude.get("artist"), gt.get("artist"))
    t = _sim(claude.get("title"),  gt.get("title"))
    if a >= 0.85 and t >= 0.85:
        return "correct"
    if a >= 0.5 or t >= 0.5:
        return "partial"
    return "wrong"


# ── Image fetching ────────────────────────────────────────────────────────────

async def _get_release_images(
    release_id: int, access_token: str, access_token_secret: str
) -> list[dict]:
    """Fetch images array from Discogs release detail using admin's OAuth."""
    from requests_oauthlib import OAuth1
    ck = os.getenv("DISCOGS_CONSUMER_KEY", "")
    cs = os.getenv("DISCOGS_CONSUMER_SECRET", "")
    auth = OAuth1(
        ck,
        client_secret=cs,
        resource_owner_key=access_token,
        resource_owner_secret=access_token_secret,
    )

    def _sync() -> list[dict]:
        import requests
        r = requests.get(
            f"{_DISCOGS_BASE}/releases/{release_id}",
            auth=auth,
            headers={"User-Agent": _UA},
            timeout=20,
        )
        if r.status_code != 200:
            return []
        return r.json().get("images", [])

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _sync)


async def _download_image(url: str) -> bytes | None:
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": _UA})
            return r.content if r.status_code == 200 else None
    except Exception:
        return None


# ── Config + endpoint ─────────────────────────────────────────────────────────

class BenchmarkConfig(BaseModel):
    n: int = 50
    include_secondary: bool = True


@router.post("/run")
async def run_benchmark(
    body: BenchmarkConfig,
    admin: User = Depends(require_admin),
):
    if (
        not admin.discogs_oauth_token
        or not admin.discogs_oauth_token_secret
        or not admin.discogs_username
    ):
        raise HTTPException(
            status_code=400,
            detail="Admin Discogs OAuth not connected. Connect Discogs in Settings first.",
        )

    access_token        = admin.discogs_oauth_token
    access_token_secret = admin.discogs_oauth_token_secret
    username            = admin.discogs_username

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    async def stream():
        try:
            yield sse("progress", {"phase": "fetch", "message": "Fetching Discogs collection…"})

            items = await discogs_svc.get_full_collection(
                username, access_token, access_token_secret
            )
            n = min(body.n, len(items))
            items = items[:n]

            yield sse("progress", {"phase": "start", "total": n, "message": f"Running Claude on {n} records…"})

            for idx, item in enumerate(items):
                info       = item.get("basic_information", {})
                release_id = info.get("id") or item.get("id")

                # Ground truth
                artists    = info.get("artists", [])
                gt_artist  = _clean_artist(artists[0].get("name", "")) if artists else None
                gt_title   = info.get("title") or None
                gt_year    = info.get("year") or None
                labels     = info.get("labels", [])
                gt_label   = labels[0].get("name") if labels else None
                gt_catno   = labels[0].get("catno") if labels else None
                thumb      = info.get("thumb") or info.get("cover_image") or None

                gt = {
                    "artist":     gt_artist,
                    "title":      gt_title,
                    "year":       gt_year,
                    "label":      gt_label,
                    "catno":      gt_catno,
                    "release_id": release_id,
                    "thumb":      thumb,
                }

                # Collect images to test: primary (cover) + first secondary (label)
                images: list[dict] = []

                if release_id and body.include_secondary:
                    try:
                        release_imgs = await _get_release_images(
                            release_id, access_token, access_token_secret
                        )
                        primary   = next((i for i in release_imgs if i.get("type") == "primary"), None)
                        secondary = next((i for i in release_imgs if i.get("type") == "secondary"), None)
                        if primary and primary.get("uri"):
                            b = await _download_image(primary["uri"])
                            if b:
                                images.append({
                                    "type": "cover",
                                    "bytes": b,
                                    "url": primary.get("uri150") or primary["uri"],
                                })
                        if secondary and secondary.get("uri"):
                            b = await _download_image(secondary["uri"])
                            if b:
                                images.append({
                                    "type": "label",
                                    "bytes": b,
                                    "url": secondary.get("uri150") or secondary["uri"],
                                })
                    except Exception:
                        pass

                # Fallback: thumbnail from collection listing
                if not images and thumb:
                    b = await _download_image(thumb)
                    if b:
                        images.append({"type": "cover", "bytes": b, "url": thumb})

                # Run Claude on each image (max 2)
                claude_results: list[dict] = []
                for img in images[:2]:
                    try:
                        cr = await claude_vision.identify_record(img["bytes"], "image/jpeg")
                        cr["_image_type"] = img["type"]
                        cr["_image_url"]  = img["url"]
                        claude_results.append(cr)
                    except Exception as exc:
                        claude_results.append({
                            "error":        str(exc),
                            "_image_type":  img["type"],
                            "_image_url":   img.get("url", ""),
                        })

                # Best result = highest confidence among non-error results
                valid = [r for r in claude_results if "error" not in r]
                best  = (
                    max(valid, key=lambda r: r.get("confidence", 0), default=None)
                    or (claude_results[0] if claude_results else None)
                )

                status = "no_image"
                errors: list[str] = []
                if best:
                    if "error" in best:
                        status = "error"
                        errors = ["error"]
                    else:
                        errors = _classify_errors(gt, best)
                        status = _overall_status(gt, best)

                # Strip raw bytes before serializing
                safe_all  = [{k: v for k, v in r.items() if k != "bytes"} for r in claude_results]
                safe_best = {k: v for k, v in best.items() if k != "bytes"} if best else None

                yield sse("result", {
                    "idx":    idx,
                    "gt":     gt,
                    "claude": safe_best,
                    "all":    safe_all,
                    "status": status,
                    "errors": errors,
                })
                yield sse("progress", {"phase": "run", "done": idx + 1, "total": n})

                # Respect Discogs authenticated rate limit (60 req/min)
                await asyncio.sleep(1.0)

            yield sse("done", {"total": n})

        except Exception as exc:
            yield sse("error", {"message": str(exc)})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
