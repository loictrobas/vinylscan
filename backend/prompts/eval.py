#!/usr/bin/env python3
"""
Prompt evaluator — run any registered prompt against a test set of images.

Usage:
    python prompts/eval.py --prompt v2-clean --images prompts/test_images/
    python prompts/eval.py --prompt v2-clean --compare v1-original --images prompts/test_images/
    python prompts/eval.py --list
"""

import argparse
import asyncio
import base64
import json
import os
import sys
from pathlib import Path

import anthropic
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from prompts.adapters import adapt

PROMPTS_DIR = Path(__file__).parent
REGISTRY = PROMPTS_DIR / "registry.json"


def load_registry() -> list[dict]:
    return json.loads(REGISTRY.read_text())


def load_prompt(prompt_id: str) -> tuple[str, str]:
    """Returns (prompt_text, schema)."""
    path = PROMPTS_DIR / f"{prompt_id}.txt"
    if not path.exists():
        sys.exit(f"Prompt file not found: {path}")
    registry = load_registry()
    entry = next((p for p in registry if p["id"] == prompt_id), None)
    schema = entry["schema"] if entry else "flat"
    return path.read_text().strip(), schema


async def run_prompt(prompt_text: str, schema: str, image_path: Path) -> dict:
    client = anthropic.AsyncAnthropic()
    image_bytes = image_path.read_bytes()
    image_b64 = base64.standard_b64encode(image_bytes).decode()

    response = await client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64},
                },
                {"type": "text", "text": prompt_text},
            ],
        }],
    )

    raw = response.content[0].text.strip()
    try:
        raw_dict = json.loads(raw)
        return adapt(raw_dict, schema)   # always return normalized flat dict
    except json.JSONDecodeError:
        return {"_parse_error": raw}


def print_result(image_name: str, prompt_id: str, result: dict):
    print(f"\n{'─'*60}")
    print(f"  {image_name}  [{prompt_id}]")
    print(f"{'─'*60}")
    if "_parse_error" in result:
        print(f"  PARSE ERROR: {result['_parse_error'][:200]}")
        return
    print(f"  Artist   : {result.get('artist')}")
    print(f"  Title    : {result.get('title')}")
    print(f"  Year     : {result.get('year')}")
    print(f"  Label    : {result.get('label')}")
    print(f"  Cat#     : {result.get('catalog_number')}")
    print(f"  Confidence: {result.get('confidence')}  low_info={result.get('low_information')}")
    print(f"  Analysis : {result.get('_analysis')}")
    print(f"  Reasoning: {result.get('reasoning')}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", help="Prompt ID to run")
    parser.add_argument("--compare", help="Second prompt ID to compare against")
    parser.add_argument("--images", default="prompts/test_images", help="Directory of test images")
    parser.add_argument("--list", action="store_true", help="List registered prompts")
    parser.add_argument("--out", help="Save full JSON results to file")
    args = parser.parse_args()

    registry = load_registry()

    if args.list:
        print("\nRegistered prompts:")
        for p in registry:
            active = " ✓ active" if p.get("active") else ""
            print(f"  {p['id']:20s}  {p['name']:15s}  {p['description'][:60]}{active}")
        return

    if not args.prompt:
        parser.print_help()
        return

    images_dir = Path(args.images)
    if not images_dir.exists():
        sys.exit(f"Images dir not found: {images_dir}\nCreate it and drop test JPEGs in.")

    image_files = sorted(images_dir.glob("*.jpg")) + sorted(images_dir.glob("*.jpeg")) + sorted(images_dir.glob("*.png"))
    if not image_files:
        sys.exit(f"No images found in {images_dir}")

    prompt_a, schema_a = load_prompt(args.prompt)
    prompt_b, schema_b = load_prompt(args.compare) if args.compare else (None, None)

    all_results = []

    for img in image_files:
        result_a = await run_prompt(prompt_a, schema_a, img)
        print_result(img.name, args.prompt, result_a)

        entry = {"image": img.name, args.prompt: result_a}

        if prompt_b:
            result_b = await run_prompt(prompt_b, schema_b, img)
            print_result(img.name, args.compare, result_b)
            entry[args.compare] = result_b

        all_results.append(entry)

    if args.out:
        Path(args.out).write_text(json.dumps(all_results, indent=2, ensure_ascii=False))
        print(f"\nResults saved to {args.out}")

    print(f"\nDone. {len(image_files)} image(s) tested.")


if __name__ == "__main__":
    asyncio.run(main())
