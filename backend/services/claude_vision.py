import base64
import json
import re

import anthropic

CLAUDE_PROMPT = """You are an expert vinyl record identifier. Analyze this image carefully.

Extract the following fields:
* artist — the performing artist or band name
* title — the album or single title (NOT the label name, NOT the catalog number)
* year — release year if visible (null if not)
* label — record label name if visible (null if not)
* catalog_number — catalog or matrix number if visible (e.g. "AF007", "WAG018", "SF 8287") — null if not visible
* format — one of: LP, EP, Single, 7", 10", 12", or Unknown
* confidence — integer 0-100: how certain you are about artist + title combined
* reasoning — one sentence explaining your confidence level

IMPORTANT — artist/title ambiguity:
On 12" singles and EPs the label text hierarchy is often unclear. If you are unsure which text is the artist vs the title, provide an alternate interpretation:
* artist_alt — alternate artist reading (null if not ambiguous)
* title_alt — alternate title reading (null if not ambiguous)

Common mistakes to avoid:
- Do NOT use the record label name (e.g. "AirFunk", "Wagon Repair") as the title
- Do NOT use the catalog number (e.g. "AF007") as the title
- "Various" / "Various Artists" is a valid artist for compilations

Return ONLY a valid JSON object, no markdown, no explanation outside the JSON.
Example: { "artist": "Cobblestone Jazz", "title": "India In Me", "year": 2006, "label": "Wagon Repair", "catalog_number": "WAG018", "format": "12\"", "confidence": 92, "reasoning": "Artist and title clearly printed on label.", "artist_alt": null, "title_alt": null }"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    # strip markdown code blocks if model adds them
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def identify_record(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    client = anthropic.AsyncAnthropic()
    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    async def _call() -> dict:
        response = await client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=512,
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
        raw = response.content[0].text
        return _extract_json(raw)

    try:
        return await _call()
    except (json.JSONDecodeError, ValueError):
        # retry once
        return await _call()
