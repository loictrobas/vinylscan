"""
Prompt output adapters.

Each prompt schema has one adapter function that converts the raw Claude JSON
into the flat internal dict that scan.py expects. Adding a new prompt = adding
one function here and registering the schema name in registry.json.

Internal flat schema (what scan.py always receives):
{
  "_analysis":                  str | None
  "artist":                     str | None
  "artist_alt":                 str | None
  "title":                      str | None
  "title_alt":                  str | None
  "year":                       int | str | None
  "label":                      str | None
  "catalog_number":             str | None          # best single candidate
  "catalog_number_candidates":  list[dict] | None   # full ranked list (v3+)
  "barcode":                    str | None          # digits only
  "matrix_code":                str | None
  "country":                    str | None
  "genre":                      str | None
  "format":                     str | None
  "confidence":                 int | None          # 0–100
  "low_information":            bool
  "tracklist":                  list[dict]          # [{position, title}]
  "reasoning":                  str | None
}
"""


def _val(x):
    """Extract .value from a v3 confidence object, or return x unchanged."""
    return x["value"] if isinstance(x, dict) and "value" in x else x


def adapt_flat(raw: dict) -> dict:
    """Schema 'flat' — v1-original and v2-clean. Output is already flat."""
    return raw


def adapt_v3(raw: dict) -> dict:
    """Schema 'v3' — v3-literal and future prompts with per-field confidence objects."""
    candidates: list[dict] = raw.get("catalog_number_candidates") or []

    # Best catalog number: first candidate typed as catalog_number
    best_catno = next(
        (c["value"] for c in candidates if c.get("type_guess") == "catalog_number"),
        candidates[0]["value"] if candidates else None,
    )

    # Matrix code: first code in all_codes_seen tagged as matrix_runout
    all_codes: list[dict] = raw.get("all_codes_seen") or []
    matrix_code = next(
        (c["value"] for c in all_codes if c.get("type_guess") == "matrix_runout"),
        None,
    )

    # Tracklist: strip per-track confidence (internal schema uses {position, title})
    tracklist = [
        {"position": t["position"], "title": t["title"]}
        for t in (raw.get("tracklist") or [])
        if "position" in t and "title" in t
    ]

    return {
        "_analysis":                  raw.get("_analysis"),
        "artist":                     _val(raw.get("artist")),
        "artist_alt":                 _val(raw.get("artist_alt")),
        "title":                      _val(raw.get("title")),
        "title_alt":                  _val(raw.get("title_alt")),
        "year":                       _val(raw.get("year")),
        "label":                      _val(raw.get("label")),
        "catalog_number":             best_catno,
        "catalog_number_candidates":  candidates,
        "barcode":                    _val(raw.get("barcode")),
        "matrix_code":                matrix_code,
        "country":                    _val(raw.get("country")),
        "genre":                      _val(raw.get("genre")),
        "format":                     raw.get("format"),
        "confidence":                 raw.get("overall_confidence"),
        "low_information":            bool(raw.get("low_information", False)),
        "tracklist":                  tracklist,
        "reasoning":                  raw.get("reasoning"),
    }


_ADAPTERS = {
    "flat": adapt_flat,
    "v3":   adapt_v3,
}


def adapt(raw: dict, schema: str) -> dict:
    """Apply the right adapter for the given schema name."""
    fn = _ADAPTERS.get(schema)
    if fn is None:
        raise ValueError(f"Unknown prompt schema '{schema}'. Register it in adapters.py.")
    return fn(raw)
