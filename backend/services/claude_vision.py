import base64
import json
import re

import anthropic

CLAUDE_PROMPT = """You are an expert vinyl record identifier. Analyze this image carefully.
Extract the following information from the vinyl record cover or label:

* artist: the artist or band name
* title: the album or single title
* year: release year if visible (null if not)
* label: record label name if visible (null if not)
* catalog_number: catalog or matrix number if visible (null if not)
* format: one of LP, EP, Single, 7", 10", 12", or Unknown
* confidence: integer 0-100 representing how certain you are about artist + title combined
* reasoning: one sentence explaining your confidence level

Return ONLY a valid JSON object, no markdown, no explanation outside the JSON.
Example output: { "artist": "David Bowie", "title": "Ziggy Stardust", "year": 1972, "label": "RCA Victor", "catalog_number": "SF 8287", "format": "LP", "confidence": 97, "reasoning": "Artist and title are clearly legible on both the spine and label." }"""


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
            model="claude-sonnet-4-20250514",
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
