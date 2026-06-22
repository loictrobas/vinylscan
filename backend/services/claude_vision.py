import base64
import json
import re
from pathlib import Path

import anthropic

# ---------------------------------------------------------------------------
# Prompt registry — load active prompt + schema at import time
# ---------------------------------------------------------------------------

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_active_prompt() -> tuple[str, str]:
    """Return (prompt_text, schema) for the currently active prompt."""
    registry = json.loads((_PROMPTS_DIR / "registry.json").read_text())
    active = next((p for p in registry if p.get("active")), None)
    if active is None:
        raise RuntimeError("No active prompt in prompts/registry.json")
    prompt_file = _PROMPTS_DIR / f"{active['id']}.txt"
    if not prompt_file.exists():
        raise RuntimeError(f"Prompt file not found: {prompt_file}")
    return prompt_file.read_text().strip(), active["schema"]


CLAUDE_PROMPT, _ACTIVE_SCHEMA = _load_active_prompt()

# ---------------------------------------------------------------------------
# Visual match prompt (unchanged)
# ---------------------------------------------------------------------------

VISUAL_MATCH_PROMPT = """First image: a photo of a vinyl record (could be the label, center sticker, sleeve, or artwork).
The following images (Cover 0, Cover 1, ...) are album cover thumbnails from a music database.

Which cover thumbnail, if any, most closely resembles the visual appearance of the record in the first image?
Consider: artwork style, colors, shapes, graphic elements, typography. Ignore photo quality, lighting, or angle differences.

Return ONLY valid JSON (no markdown):
{"best_match_index": 2, "confidence": "high", "reasoning": "Same geometric spiral and orange color scheme"}

If no covers visually match (blank/white label, no distinctive artwork, or all covers are clearly different):
{"best_match_index": null, "confidence": "none", "reasoning": "No distinctive artwork to compare"}"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _adapt(raw: dict) -> dict:
    from prompts.adapters import adapt
    return adapt(raw, _ACTIVE_SCHEMA)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def identify_record(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    client = anthropic.AsyncAnthropic()
    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    async def _call() -> dict:
        response = await client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
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
                        {"type": "text", "text": CLAUDE_PROMPT},
                    ],
                }
            ],
        )
        raw = _extract_json(response.content[0].text)
        return _adapt(raw)

    try:
        return await _call()
    except (json.JSONDecodeError, ValueError):
        return await _call()


async def visual_match_releases(
    scan_image_bytes: bytes,
    cover_images: list[tuple[int, bytes]],
) -> dict:
    """
    Compare a scan image against Discogs cover art thumbnails using Claude Haiku.
    cover_images: list of (release_id, jpeg_bytes) — max 7
    Returns: {best_match_index, best_match_release_id, confidence, reasoning}
    """
    client = anthropic.AsyncAnthropic()

    content: list[dict] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.standard_b64encode(scan_image_bytes).decode(),
            },
        }
    ]

    for i, (_release_id, img_bytes) in enumerate(cover_images):
        content.append({"type": "text", "text": f"Cover {i}:"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.standard_b64encode(img_bytes).decode(),
            },
        })

    content.append({"type": "text", "text": VISUAL_MATCH_PROMPT})

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": content}],
    )

    try:
        result = _extract_json(response.content[0].text)
    except (json.JSONDecodeError, ValueError):
        return {
            "best_match_index": None,
            "best_match_release_id": None,
            "confidence": "none",
            "reasoning": "Could not parse visual match response",
        }

    idx = result.get("best_match_index")
    valid_idx = isinstance(idx, int) and 0 <= idx < len(cover_images)
    best_release_id = cover_images[idx][0] if valid_idx else None
    return {
        "best_match_index": idx if valid_idx else None,
        "best_match_release_id": best_release_id,
        "confidence": result.get("confidence", "low"),
        "reasoning": result.get("reasoning", ""),
    }
