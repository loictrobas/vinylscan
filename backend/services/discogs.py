import os

from requests_oauthlib import OAuth1

DISCOGS_BASE = "https://api.discogs.com"
USER_AGENT = "VinylScan/1.0 +https://vinylscan.app"
CONSUMER_KEY = os.getenv("DISCOGS_CONSUMER_KEY", "")
CONSUMER_SECRET = os.getenv("DISCOGS_CONSUMER_SECRET", "")
REQUEST_TOKEN_URL = "https://api.discogs.com/oauth/request_token"
ACCESS_TOKEN_URL = "https://api.discogs.com/oauth/access_token"
AUTHORIZE_URL = "https://www.discogs.com/oauth/authorize"


def _oauth1(token: str, token_secret: str) -> OAuth1:
    return OAuth1(
        CONSUMER_KEY,
        client_secret=CONSUMER_SECRET,
        resource_owner_key=token,
        resource_owner_secret=token_secret,
    )


def get_request_token(callback_url: str) -> tuple[str, str]:
    auth = OAuth1(CONSUMER_KEY, client_secret=CONSUMER_SECRET, callback_uri=callback_url)
    import requests

    r = requests.get(REQUEST_TOKEN_URL, auth=auth, headers={"User-Agent": USER_AGENT}, timeout=15)
    r.raise_for_status()
    from urllib.parse import parse_qs

    params = parse_qs(r.text)
    return params["oauth_token"][0], params["oauth_token_secret"][0]


def get_access_token(oauth_token: str, oauth_token_secret: str, oauth_verifier: str) -> tuple[str, str]:
    auth = OAuth1(
        CONSUMER_KEY,
        client_secret=CONSUMER_SECRET,
        resource_owner_key=oauth_token,
        resource_owner_secret=oauth_token_secret,
        verifier=oauth_verifier,
    )
    import requests

    r = requests.post(ACCESS_TOKEN_URL, auth=auth, headers={"User-Agent": USER_AGENT}, timeout=15)
    r.raise_for_status()
    from urllib.parse import parse_qs

    params = parse_qs(r.text)
    return params["oauth_token"][0], params["oauth_token_secret"][0]


def get_identity(access_token: str, access_token_secret: str) -> dict:
    import requests

    auth = _oauth1(access_token, access_token_secret)
    r = requests.get(
        f"{DISCOGS_BASE}/oauth/identity",
        auth=auth,
        headers={"User-Agent": USER_AGENT},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


import re
from difflib import SequenceMatcher

# Weight per strategy name — higher = more trustworthy hit
_STRATEGY_WEIGHTS: dict[str, float] = {
    "matrix_code": 15.0,        # dead wax text — most precise identifier
    "matrix+label": 14.0,       # dead wax + label
    "barcode": 13.5,            # EAN/UPC barcode — near-exact lookup
    "catno+label": 12.0,
    "catno": 10.0,
    "catno+country": 9.0,       # catalog # narrowed by pressing country
    "tracklist": 8.0,
    "label+track": 7.5,           # label + single track title — fires per track
    "artist+track": 7.0,          # artist + single track title — fires per track
    "label+title": 5.0,
    "q=artist_phrase": 4.5,
    "artist+release_title": 4.0,
    "artist+title+country": 3.8,  # artist+title scoped to pressing country
    "label+year": 3.5,
    "q=combined+year": 3.0,
    "artist+title+y-1": 2.8,    # year range −1
    "artist+title+y+1": 2.8,    # year range +1
    "q=combined": 2.0,
    "q=title": 1.0,
    "q=artist": 0.5,
}

_STRATEGY_REASONS: dict[str, str] = {
    "matrix_code": "Dead wax / matrix match",
    "matrix+label": "Dead wax + label match",
    "catno+label": "Catalog # + label match",
    "catno": "Catalog # match",
    "catno+country": "Catalog # + country match",
    "tracklist": "Track name match",
    "label+track": "Label + track title match",
    "artist+track": "Artist + track title match",
    "label+title": "Label + title match",
    "q=artist_phrase": "Artist match",
    "artist+release_title": "Artist & title match",
    "artist+title+country": "Artist & title + country",
    "label+year": "Label + year match",
    "q=combined": "Text match",
    "q=combined+year": "Text + year match",
    "artist+title+y-1": "Artist & title (year−1)",
    "artist+title+y+1": "Artist & title (year+1)",
    "q=title": "Title match",
    "q=artist": "Artist match",
}

# Strategies exempt from B2 text-similarity penalty (matched by Discogs index fields)
_STRUCTURAL_STRATEGIES = {
    "matrix_code", "matrix+label", "barcode",
    "catno+label", "catno", "catno+country",
    "label+title", "label+track", "artist+track",
    "q=artist_phrase", "tracklist",
    "artist+title+country",
}

# Near-unique identifiers — when present, reliable enough to try alone before paying
# for the full ~20-strategy fan-out (search_releases only; debug/outcome-logging
# keep running everything so strategy-effectiveness data stays complete).
_FAST_STRATEGIES = {
    "matrix_code", "matrix+label", "barcode",
    "catno+label", "catno", "catno+country",
}

# Label suffixes to strip before fuzzy comparison
_LABEL_SUFFIX_RE = re.compile(
    r"\b(records?|music|label|entertainment|recordings?|productions?|releasing|group)\b",
    re.IGNORECASE,
)


def _normalize_label(label: str) -> str:
    """Strip common label suffixes and normalize for fuzzy comparison."""
    s = _LABEL_SUFFIX_RE.sub("", label).strip().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def _format_match_multiplier(scan_format: str | None, result_formats: list[str]) -> float:
    """Score multiplier: bonus for matching format, penalty for wrong format."""
    if not scan_format:
        return 1.0
    sf = scan_format.lower()
    rf = " ".join(result_formats).lower()
    # Format match bonuses
    if '7"' in sf and '7"' in rf:
        return 1.5
    if '12"' in sf and '12"' in rf:
        return 1.5
    if '10"' in sf and '10"' in rf:
        return 1.4
    if "lp" in sf and ("lp" in rf or "album" in rf):
        return 1.3
    if "ep" in sf and "ep" in rf:
        return 1.3
    # Mismatch penalties
    if '7"' in sf and ("lp" in rf or "album" in rf):
        return 0.3
    if "lp" in sf and '7"' in rf:
        return 0.3
    if '12"' in sf and '7"' in rf:
        return 0.4
    return 1.0


def _compute_internal_confidence(
    ranked: list[dict],
    score: dict[int, float],
    hits: dict[int, list[str]],
    artist: str,
    title: str,
) -> int:
    """Compute 0-100 confidence from search signals (independent of Claude self-report)."""
    if not ranked:
        return 5
    top = ranked[0]
    top_id = top.get("id")
    top_score = score.get(top_id, 0)
    top_hits = hits.get(top_id, [])
    conf = 15  # base

    # Structural strategy bonus
    structural_hits = [s for s in top_hits if s in _STRUCTURAL_STRATEGIES]
    if structural_hits:
        if any(s in {"matrix_code", "matrix+label", "barcode"} for s in structural_hits):
            conf += 50  # near-certain
        elif any(s in {"catno+label", "catno"} for s in structural_hits):
            conf += 35
        else:
            conf += 20

    # Score gap between #1 and #2
    if len(ranked) >= 2:
        second_score = score.get(ranked[1].get("id"), 0)
        gap = (top_score / second_score) if second_score > 0 else 10.0
        if gap > 3.0:
            conf += 20
        elif gap > 1.5:
            conf += 10
        elif gap < 1.15:
            conf -= 10  # nearly tied with #2
    else:
        conf += 12  # only one result

    # Text similarity of best result title to query
    parts = (top.get("title", "") or "").split(" - ", 1)
    res_artist = parts[0] if len(parts) > 1 else ""
    res_title = parts[1] if len(parts) > 1 else (top.get("title", "") or "")
    sim = _text_sim(f"{artist} {title}", f"{res_artist} {res_title}")
    if sim > 0.8:
        conf += 15
    elif sim > 0.55:
        conf += 5
    elif sim < 0.3:
        conf -= 10

    # Strategy count
    if len(top_hits) >= 4:
        conf += 8
    elif len(top_hits) >= 2:
        conf += 4

    return max(0, min(100, conf))


async def _score_tracklist_parallel(
    top_rids: list[int],
    extracted_tracks: list[dict],
    access_token: str,
    access_token_secret: str,
) -> dict[int, float]:
    """
    Fetch release tracklists for top candidates in parallel and compute match ratio.
    Returns {release_id: match_ratio} where ratio is 0.0–1.0.
    Only called when extracted_tracks has >= 2 entries.
    """
    auth = _oauth1(access_token, access_token_secret)
    ext_titles = [t.get("title", "").lower().strip() for t in extracted_tracks if t.get("title")]
    if not ext_titles:
        return {}

    def _fetch_one(rid: int) -> tuple[int, float]:
        try:
            import requests as req
            r = req.get(
                f"{DISCOGS_BASE}/releases/{rid}",
                auth=auth,
                headers={"User-Agent": USER_AGENT},
                timeout=10,
            )
            if r.status_code != 200:
                return rid, 0.0
            disc_tracks = r.json().get("tracklist", [])
            disc_titles = [t.get("title", "").lower().strip() for t in disc_tracks]
            if not disc_titles:
                return rid, 0.0
            matches = sum(
                1 for et in ext_titles
                if any(_text_sim(et, dt) > 0.75 for dt in disc_titles)
            )
            return rid, matches / len(ext_titles)
        except Exception:
            return rid, 0.0

    import asyncio
    loop = asyncio.get_running_loop()
    results = await asyncio.gather(*[
        loop.run_in_executor(None, _fetch_one, rid) for rid in top_rids
    ])
    return dict(results)

# Strategies where larger result page is worth the cost
_WIDE_STRATEGIES = {"q=artist_phrase", "q=artist", "label+title", "q=title", "tracklist"}

_VINYL_KEYWORDS = {"lp", "ep", "single", '7"', '10"', '12"', "vinyl"}
_FEAT_RE = re.compile(r'\s+(feat\.?|ft\.?|featuring|with|vs\.?)\s+.*', re.IGNORECASE)
_VA_NAMES = {"various artists", "various", "va", "v.a.", "v/a"}


def _is_vinyl(fmt: str) -> bool:
    f = fmt.lower()
    return any(v in f for v in _VINYL_KEYWORDS)


def _clean_artist(artist: str) -> str:
    """Strip featured-artist suffix for Discogs artist= field."""
    return _FEAT_RE.sub("", artist).strip()


def _text_sim(a: str, b: str) -> float:
    norm = lambda s: re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()
    return SequenceMatcher(None, norm(a), norm(b)).ratio()


def _build_strategies(
    artist: str,
    title: str,
    label: str | None,
    catalog_number: str | None,
    year: int | None = None,
    tracklist: list[dict] | None = None,
    matrix_code: str | None = None,
    country: str | None = None,
    barcode: str | None = None,
) -> list[tuple[str, dict]]:
    """Build list of (name, params) tuples for Discogs search strategies."""
    strategies: list[tuple[str, dict]] = []
    a = (artist or "").strip()
    t = (title or "").strip()
    catno = (catalog_number or "").strip()
    lbl = (label or "").strip()
    mcode = (matrix_code or "").strip()
    ctry = (country or "").strip()
    a_clean = _clean_artist(a)
    is_va = a.lower() in _VA_NAMES

    # 0a. Barcode — near-exact identifier (EAN/UPC), weight 13.5
    bc = (barcode or "").strip().replace(" ", "").replace("-", "")
    if bc and bc.isdigit() and len(bc) in (12, 13):
        strategies.append(("barcode", {"barcode": bc}))

    # 0b. Matrix / dead wax code — highest precision identifier
    if mcode:
        # Strip trailing side letter for base catno search (WAG018A → WAG018)
        mcode_base = mcode.rstrip("ABCDabcd").strip() or mcode
        strategies.append(("matrix_code", {"catno": mcode_base}))
        if lbl:
            strategies.append(("matrix+label", {"catno": mcode_base, "label": lbl}))

    # 1. Catalog number alone
    if catno:
        strategies.append(("catno", {"catno": catno}))

    # 2. Catalog number + label
    if catno and lbl:
        strategies.append(("catno+label", {"catno": catno, "label": lbl}))

    # 2b. Catalog number + country — narrows pressing
    if catno and ctry:
        strategies.append(("catno+country", {"catno": catno, "country": ctry}))

    # Detect when title == label (label leaked into title field — common on comp labels)
    title_is_label = lbl and t and _text_sim(t, lbl) > 0.85

    # 3. Tracklist — multi-quoted fingerprint (requires ≥2 correct names)
    track_titles = [tr.get("title", "").strip() for tr in (tracklist or []) if tr.get("title", "").strip()]
    if len(track_titles) >= 2:
        q_parts = " ".join(f'"{tt}"' for tt in track_titles[:3])
        strategies.append(("tracklist", {"q": q_parts}))

    # 3b. Per-track free-text: label + single track title (VA / title==label)
    # Each track fires independently — one correct name is enough to find the release.
    if lbl and track_titles:
        for tt in track_titles[:3]:
            strategies.append(("label+track", {"q": f"{lbl} {tt}"}))

    # 3c. Per-track free-text: artist + single track title (non-VA)
    if a_clean and not is_va and track_titles:
        for tt in track_titles[:3]:
            strategies.append(("artist+track", {"q": f"{a_clean} {tt}"}))

    # 4. Artist quoted phrase — exact match, avoids word-order confusion
    if a_clean and not is_va:
        strategies.append(("q=artist_phrase", {"q": f'"{a_clean}"'}))

    # 5. Discogs dedicated artist= + release_title= fields
    if a_clean and t and not is_va and not title_is_label:
        params: dict = {"artist": a_clean, "release_title": t}
        if year:
            params["year"] = year
        strategies.append(("artist+release_title", params))

    # 5b. Artist + title scoped to pressing country
    if a_clean and t and ctry and not is_va and not title_is_label:
        strategies.append(("artist+title+country", {"artist": a_clean, "release_title": t, "country": ctry}))

    # 5c. Year range ±1 — catches pressings catalogued with off-by-one year
    if a_clean and t and year and not is_va and not title_is_label:
        strategies.append(("artist+title+y-1", {"artist": a_clean, "release_title": t, "year": year - 1}))
        strategies.append(("artist+title+y+1", {"artist": a_clean, "release_title": t, "year": year + 1}))

    # 6. Combined free-text q= — never include VA artist names, they match everything
    # When title==label strip title too (redundant with label strategies below)
    if is_va:
        combined = t if not title_is_label else ""
    else:
        combined = f"{a} {t}".strip() if not title_is_label else a
    if combined and year:
        strategies.append(("q=combined+year", {"q": combined, "year": year}))
    elif combined:
        strategies.append(("q=combined", {"q": combined}))

    # 7. Label + title — skip when title == label (same string twice = useless)
    if lbl and t and not title_is_label:
        strategies.append(("label+title", {"label": lbl, "release_title": t}))

    # 8. Label + year — useful for low-info records
    if lbl and year:
        strategies.append(("label+year", {"label": lbl, "year": year}))

    # 9. Title alone — skip for VA (too broad) and when title==label
    if t and t.lower() not in ("unknown",) and not is_va and not title_is_label:
        strategies.append(("q=title", {"q": t}))

    # 10. Artist alone — last resort when title misread
    if a and not is_va:
        strategies.append(("q=artist", {"q": a}))

    return strategies


async def search_releases(
    artist: str,
    title: str,
    access_token: str,
    access_token_secret: str,
    label: str | None = None,
    catalog_number: str | None = None,
    artist_alt: str | None = None,
    title_alt: str | None = None,
    scan_format: str | None = None,
    year: int | None = None,
    tracklist: list[dict] | None = None,
    matrix_code: str | None = None,
    country: str | None = None,
    barcode: str | None = None,
) -> tuple[list[dict], int]:
    """
    Parallel multi-strategy search. Strategies are weighted by precision.
    B2: string similarity penalty for bad matches (with label normalization).
    B3: CD penalty when scan is vinyl.
    B4: format bonus/penalty based on extracted format.
    B5: tracklist cross-reference for top-3 candidates (parallel, adds up to 8 pts).
    B6: small bonus for results with a real cover image.
    Returns (ranked_releases[:10], internal_confidence_0_100).
    """
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_search(params: dict, wide: bool = False) -> tuple[list[dict], str | None]:
        try:
            resp = req.get(
                f"{DISCOGS_BASE}/database/search",
                params={**params, "type": "release", "per_page": 25 if wide else 10},
                auth=auth,
                headers={"User-Agent": USER_AGENT},
                timeout=20,
            )
            if resp.status_code == 429:
                return [], "rate_limited"
            if resp.status_code == 401:
                return [], "auth_error"
            resp.raise_for_status()
            return resp.json().get("results", []), None
        except Exception as e:
            return [], type(e).__name__

    # Build named strategies for primary + alternate interpretations
    all_strategies: list[tuple[str, dict]] = _build_strategies(
        artist, title, label, catalog_number, year, tracklist, matrix_code, country, barcode
    )

    if artist_alt or title_alt:
        a_alt = artist_alt or artist
        t_alt = title_alt or title
        alt_strategies = _build_strategies(a_alt, t_alt, label, catalog_number, year, tracklist, matrix_code, country, barcode)
        primary_set = {frozenset(p.items()) for _, p in all_strategies}
        for name, params in alt_strategies:
            if frozenset(params.items()) not in primary_set:
                all_strategies.append((name, params))

    loop = asyncio.get_running_loop()

    async def _run_batch(batch: list[tuple[str, dict]]) -> tuple[list[str], list[tuple[list[dict], str | None]]]:
        names = [name for name, _ in batch]
        raw = await asyncio.gather(*[
            loop.run_in_executor(None, _sync_search, p, name in _WIDE_STRATEGIES)
            for name, p in batch
        ])
        return names, raw

    # Try the near-unique identifier strategies (catalog #, barcode, matrix code) alone
    # first — they're cheap (1-6 calls instead of ~24) and, when present, reliable enough
    # on their own. Only fall back to the full strategy fan-out when none of them hit
    # anything, so accuracy on harder/ambiguous scans is unaffected.
    fast = [(n, p) for n, p in all_strategies if n in _FAST_STRATEGIES]
    rest = [(n, p) for n, p in all_strategies if n not in _FAST_STRATEGIES]

    if fast:
        strategy_names, raw_per_strategy = await _run_batch(fast)
        if rest and not any(r for r, _ in raw_per_strategy):
            rest_names, rest_raw = await _run_batch(rest)
            strategy_names += rest_names
            raw_per_strategy += rest_raw
    else:
        strategy_names, raw_per_strategy = await _run_batch(all_strategies)

    results_per_strategy = [r for r, _ in raw_per_strategy]
    errors_per_strategy = [e for _, e in raw_per_strategy]

    seen: dict[int, dict] = {}
    score: dict[int, float] = {}
    hits: dict[int, list[str]] = {}  # strategy names that returned this release

    for strategy_name, strategy_results in zip(strategy_names, results_per_strategy):
        weight = _STRATEGY_WEIGHTS.get(strategy_name, 1.0)
        for r in strategy_results:
            rid = r.get("id")
            if rid is None:
                continue
            if rid not in seen:
                seen[rid] = r
                score[rid] = 0.0
                hits[rid] = []
            score[rid] += weight
            if strategy_name not in hits[rid]:
                hits[rid].append(strategy_name)

    # B2: string similarity penalty — heavy penalty when result is clearly wrong.
    # Skip for results found via structural strategies (catno, label+title, artist phrase)
    # because those are matched by Discogs index fields, not text similarity.
    query_text = f"{artist} {title}"
    scan_is_vinyl = _is_vinyl(scan_format or "lp")  # default assume vinyl
    norm_label = _normalize_label(label or "")

    for rid, r in seen.items():
        found_via_structural = any(s in _STRUCTURAL_STRATEGIES for s in hits.get(rid, []))
        if not found_via_structural:
            title_raw = r.get("title", "")
            parts = title_raw.split(" - ", 1)
            res_artist = parts[0] if len(parts) > 1 else ""
            res_title = parts[1] if len(parts) > 1 else title_raw
            text_s = _text_sim(query_text, f"{res_artist} {res_title}")

            # B2a: fuzzy label check — bonus when label also matches
            res_labels = r.get("label", []) or []
            if norm_label and isinstance(res_labels, list):
                label_sim = max(
                    (_text_sim(norm_label, _normalize_label(rl)) for rl in res_labels),
                    default=0.0,
                )
                if label_sim > 0.8:
                    text_s = min(1.0, text_s + 0.15)  # label match partially forgives weak text sim

            if text_s < 0.25:
                score[rid] *= 0.05
            elif text_s < 0.45:
                score[rid] *= 0.4

        # B3: heavily penalize CD results when scanning vinyl
        res_formats = r.get("format", []) or []
        if scan_is_vinyl and any("CD" in f for f in res_formats):
            score[rid] *= 0.05

        # B4: format match bonus / mismatch penalty
        fm = _format_match_multiplier(scan_format, res_formats)
        if fm != 1.0:
            score[rid] *= fm

        # B6: small bonus for real cover image
        img = r.get("cover_image", "") or ""
        if img and "spacer" not in img and img.startswith("http"):
            score[rid] += 0.3

        # Attach best match reason
        best_strategy = max(
            hits[rid],
            key=lambda n: _STRATEGY_WEIGHTS.get(n, 0),
            default=None,
        )
        r["_match_reason"] = _STRATEGY_REASONS.get(best_strategy or "", None)

    # B5: tracklist cross-reference for top-3 candidates (parallel async fetch)
    tl = tracklist or []
    if len(tl) >= 2 and seen:
        top3 = sorted(seen.keys(), key=lambda rid: score[rid], reverse=True)[:3]
        try:
            tl_ratios = await _score_tracklist_parallel(top3, tl, access_token, access_token_secret)
            for rid, ratio in tl_ratios.items():
                if ratio > 0.6:
                    score[rid] += ratio * 8.0  # up to +8 pts for full tracklist match
        except Exception:
            pass

    ranked = sorted(
        seen.values(),
        key=lambda r: (score[r["id"]], r.get("community", {}).get("want", 0)),
        reverse=True,
    )
    final = ranked[:10]

    # Compute internal confidence from search signals
    internal_confidence = _compute_internal_confidence(final, score, hits, artist, title)

    return final, internal_confidence


async def search_releases_debug(
    artist: str,
    title: str,
    access_token: str,
    access_token_secret: str,
    label: str | None = None,
    catalog_number: str | None = None,
    artist_alt: str | None = None,
    title_alt: str | None = None,
    scan_format: str | None = None,
    year: int | None = None,
    tracklist: list[dict] | None = None,
    matrix_code: str | None = None,
    country: str | None = None,
    barcode: str | None = None,
) -> dict:
    """
    Like search_releases but returns per-strategy debug info with full score breakdown.
    Admin-only endpoint use.
    """
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_search(params: dict, wide: bool = False) -> tuple[list[dict], str | None]:
        try:
            resp = req.get(
                f"{DISCOGS_BASE}/database/search",
                params={**params, "type": "release", "per_page": 25 if wide else 10},
                auth=auth,
                headers={"User-Agent": USER_AGENT},
                timeout=20,
            )
            if resp.status_code == 429:
                return [], "rate_limited"
            if resp.status_code == 401:
                return [], "auth_error"
            resp.raise_for_status()
            return resp.json().get("results", []), None
        except Exception as e:
            return [], type(e).__name__

    all_strategies = _build_strategies(
        artist, title, label, catalog_number, year, tracklist, matrix_code, country, barcode
    )
    if artist_alt or title_alt:
        a_alt = artist_alt or artist
        t_alt = title_alt or title
        alt_strats = _build_strategies(a_alt, t_alt, label, catalog_number, year, tracklist, matrix_code, country, barcode)
        primary_set = {frozenset(p.items()) for _, p in all_strategies}
        for name, params in alt_strats:
            if frozenset(params.items()) not in primary_set:
                all_strategies.append((name, params))

    loop = asyncio.get_running_loop()
    raw_per_strategy: list[tuple[list[dict], str | None]] = await asyncio.gather(
        *[
            loop.run_in_executor(None, _sync_search, p, name in _WIDE_STRATEGIES)
            for name, p in all_strategies
        ]
    )
    results_per_strategy = [r for r, _ in raw_per_strategy]
    errors_per_strategy = [e for _, e in raw_per_strategy]

    seen: dict[int, dict] = {}
    score: dict[int, float] = {}
    hits: dict[int, list[str]] = {}

    for (strategy_name, _), strategy_results in zip(all_strategies, results_per_strategy):
        weight = _STRATEGY_WEIGHTS.get(strategy_name, 1.0)
        for r in strategy_results:
            rid = r.get("id")
            if rid is None:
                continue
            if rid not in seen:
                seen[rid] = r
                score[rid] = 0.0
                hits[rid] = []
            score[rid] += weight
            if strategy_name not in hits[rid]:
                hits[rid].append(strategy_name)

    query_text = f"{artist} {title}"
    scan_is_vinyl = _is_vinyl(scan_format or "lp")
    norm_label = _normalize_label(label or "")

    # Per-result score breakdowns
    breakdowns: dict[int, dict] = {}

    for rid, r in seen.items():
        hit_weights = {s: _STRATEGY_WEIGHTS.get(s, 1.0) for s in hits.get(rid, [])}
        raw_score = sum(hit_weights.values())

        b2_sim: float | None = None
        b2_factor: float = 1.0
        b3_cd = False
        b4_fmt = 1.0
        b6_cover = 0.0

        found_via_structural = any(s in _STRUCTURAL_STRATEGIES for s in hits.get(rid, []))
        if not found_via_structural:
            title_raw = r.get("title", "")
            parts = title_raw.split(" - ", 1)
            res_artist = parts[0] if len(parts) > 1 else ""
            res_title = parts[1] if len(parts) > 1 else title_raw
            b2_sim = round(_text_sim(query_text, f"{res_artist} {res_title}"), 3)

            # label normalization boost
            res_labels = r.get("label", []) or []
            if norm_label and isinstance(res_labels, list):
                label_sim = max(
                    (_text_sim(norm_label, _normalize_label(rl)) for rl in res_labels),
                    default=0.0,
                )
                if label_sim > 0.8:
                    b2_sim = min(1.0, b2_sim + 0.15)

            if b2_sim < 0.25:
                b2_factor = 0.05
            elif b2_sim < 0.45:
                b2_factor = 0.4

        score[rid] = raw_score * b2_factor

        res_formats = r.get("format", []) or []
        if scan_is_vinyl and any("CD" in f for f in res_formats):
            b3_cd = True
            score[rid] *= 0.05

        # B4: format match bonus/penalty
        b4_fmt = _format_match_multiplier(scan_format, res_formats)
        if b4_fmt != 1.0:
            score[rid] *= b4_fmt

        img = r.get("cover_image", "") or ""
        if img and "spacer" not in img and img.startswith("http"):
            b6_cover = 0.3
            score[rid] += b6_cover

        breakdowns[rid] = {
            "hit_weights": hit_weights,
            "raw_score": round(raw_score, 3),
            "b2_sim": b2_sim,
            "b2_factor": b2_factor if b2_factor != 1.0 else None,
            "b3_cd": b3_cd,
            "b4_fmt": b4_fmt if b4_fmt != 1.0 else None,
            "b6_cover": b6_cover,
        }

        best_strategy = max(hits[rid], key=lambda n: _STRATEGY_WEIGHTS.get(n, 0), default=None)
        r["_match_reason"] = _STRATEGY_REASONS.get(best_strategy or "", None)
        r["_score"] = round(score[rid], 3)
        r["_hit_strategies"] = hits[rid]

    ranked = sorted(
        seen.values(),
        key=lambda r: (score[r["id"]], r.get("community", {}).get("want", 0)),
        reverse=True,
    )

    def _slim(r: dict) -> dict:
        rid = r.get("id")
        return {
            "id": rid,
            "title": r.get("title"),
            "catno": r.get("catno"),
            "format": r.get("format"),
            "cover_image": r.get("cover_image"),
            "_match_reason": r.get("_match_reason"),
            "_score": r.get("_score"),
            "_hit_strategies": r.get("_hit_strategies"),
            "_breakdown": breakdowns.get(rid),
        }

    return {
        "strategies": [
            {
                "name": name,
                "params": params,
                "result_count": len(res),
                "error": err,
                "top_results": [_slim(r) for r in res[:3]],
            }
            for (name, params), res, err in zip(all_strategies, results_per_strategy, errors_per_strategy)
        ],
        "ranked": [_slim(r) for r in ranked[:10]],
    }


async def search_by_barcode(
    barcode: str, access_token: str, access_token_secret: str
) -> list[dict]:
    auth = _oauth1(access_token, access_token_secret)
    params = {"barcode": barcode, "type": "release", "per_page": 5}

    import asyncio
    import requests as req

    def _sync_search():
        resp = req.get(
            f"{DISCOGS_BASE}/database/search",
            params=params,
            auth=auth,
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()

    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, _sync_search)
    return data.get("results", [])


import time as _time

# In-memory pricing cache: {release_id: {"data": {...}, "expires": float}}
_pricing_cache: dict[int, dict] = {}
_PRICING_TTL = 24 * 60 * 60  # 24 hours


async def get_marketplace_stats(
    release_id: int, access_token: str, access_token_secret: str
) -> dict | None:
    """
    Fetch lowest marketplace price for a release.
    Returns {"lowest": float, "currency": str, "num_for_sale": int} or None.
    In-memory cache with 24h TTL. Rate-limited: caller should space requests >= 2s apart.
    """
    now = _time.time()
    cached = _pricing_cache.get(release_id)
    if cached and cached["expires"] > now:
        return cached["data"]

    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_fetch():
        resp = req.get(
            f"{DISCOGS_BASE}/marketplace/stats/{release_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    loop = asyncio.get_running_loop()
    try:
        raw = await loop.run_in_executor(None, _sync_fetch)
    except Exception:
        return None

    if raw is None:
        data = None
    elif raw.get("lowest_price"):
        data = {
            "lowest": raw["lowest_price"]["value"],
            "currency": raw["lowest_price"]["currency"],
            "num_for_sale": raw.get("num_for_sale", 0),
        }
    else:
        data = None

    _pricing_cache[release_id] = {"data": data, "expires": now + _PRICING_TTL}
    return data


async def get_release_details(
    release_id: int, access_token: str, access_token_secret: str
) -> dict | None:
    """
    Fetch full release details from Discogs.
    Returns {"styles": ["Deep House", ...], "lowest_price": float|None, "num_for_sale": int} or None.
    """
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_fetch():
        resp = req.get(
            f"{DISCOGS_BASE}/releases/{release_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    loop = asyncio.get_running_loop()
    try:
        raw = await loop.run_in_executor(None, _sync_fetch)
    except Exception:
        return None

    if not raw:
        return None

    lp = raw.get("lowest_price")
    labels = raw.get("labels") or []
    formats = raw.get("formats") or []
    return {
        "styles": raw.get("styles", []),
        "genres": raw.get("genres", []),
        "lowest_price": float(lp) if lp is not None else None,
        "num_for_sale": raw.get("num_for_sale", 0),
        # The confirmed release's own data — authoritative, more reliable than the
        # original Claude Vision guess from the photo.
        "title": raw.get("title"),
        "year": raw.get("year"),
        "country": raw.get("country"),
        "label": labels[0].get("name") if labels else None,
        "catno": labels[0].get("catno") if labels else None,
        "format": ", ".join(f.get("name", "") for f in formats) if formats else None,
        "tracklist": [
            {"position": t.get("position", ""), "title": t.get("title", ""), "duration": t.get("duration", "")}
            for t in (raw.get("tracklist") or [])
            if t.get("type_", "track") == "track" and t.get("title")
        ],
    }


async def get_price_suggestions(
    release_id: int, access_token: str, access_token_secret: str
) -> dict | None:
    """
    Fetch Discogs price suggestions by condition.
    Returns {"Mint (M)": 35.0, "Near Mint (NM or M-)": 28.0, ...} or None.
    """
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_fetch():
        resp = req.get(
            f"{DISCOGS_BASE}/marketplace/price_suggestions/{release_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        if resp.status_code in (404, 403):
            return None
        resp.raise_for_status()
        return resp.json()

    loop = asyncio.get_running_loop()
    try:
        raw = await loop.run_in_executor(None, _sync_fetch)
    except Exception:
        return None

    if not raw:
        return None

    # Map Discogs condition names to our short codes
    _COND_MAP = {
        "Mint (M)": "M",
        "Near Mint (NM or M-)": "NM",
        "Very Good Plus (VG+)": "VG+",
        "Very Good (VG)": "VG",
        "Good Plus (G+)": "G",
        "Good (G)": "G",
    }
    return {
        _COND_MAP[k]: v["value"]
        for k, v in raw.items()
        if k in _COND_MAP and isinstance(v, dict) and v.get("value")
    }


async def add_to_collection(
    username: str, release_id: int, access_token: str, access_token_secret: str
) -> dict:
    """Add release to Discogs collection folder 1 (Uncategorized). Returns instance info."""
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_add():
        resp = req.post(
            f"{DISCOGS_BASE}/users/{username}/collection/folders/1/releases/{release_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _sync_add)


async def remove_from_collection(
    username: str, release_id: int, instance_id: int, access_token: str, access_token_secret: str
) -> None:
    """Remove a specific collection instance. Silently swallows 404 (already removed)."""
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_delete():
        resp = req.delete(
            f"{DISCOGS_BASE}/users/{username}/collection/folders/1/releases/{release_id}/instances/{instance_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        if resp.status_code == 404:
            return
        resp.raise_for_status()

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _sync_delete)


async def create_listing(
    release_id: int, price: float, condition: str, access_token: str, access_token_secret: str
) -> dict:
    """Create a Discogs marketplace listing. Returns dict with listing_id."""
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync():
        resp = req.post(
            f"{DISCOGS_BASE}/marketplace/listings",
            auth=auth,
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
            json={
                "release_id": release_id,
                "condition": condition,
                "sleeve_condition": condition,
                "price": round(float(price), 2),
                "status": "For Sale",
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _sync)


async def update_listing(
    listing_id: int, price: float, condition: str, access_token: str, access_token_secret: str
) -> None:
    """Update price/condition on an existing marketplace listing."""
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync():
        resp = req.post(
            f"{DISCOGS_BASE}/marketplace/listings/{listing_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
            json={
                "condition": condition,
                "sleeve_condition": condition,
                "price": round(float(price), 2),
                "status": "For Sale",
            },
            timeout=20,
        )
        resp.raise_for_status()

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _sync)


async def delete_listing(
    listing_id: int, access_token: str, access_token_secret: str
) -> None:
    """Remove a marketplace listing. Silently swallows 404 (already gone)."""
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync():
        resp = req.delete(
            f"{DISCOGS_BASE}/marketplace/listings/{listing_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        if resp.status_code == 404:
            return
        resp.raise_for_status()

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _sync)


def _fetch_collection_page_sync(
    username: str, access_token: str, access_token_secret: str, page: int, per_page: int = 500
) -> dict:
    """Blocking fetch of one collection page."""
    import requests as req
    auth = _oauth1(access_token, access_token_secret)
    resp = req.get(
        f"{DISCOGS_BASE}/users/{username}/collection/folders/0/releases",
        params={"page": page, "per_page": per_page, "sort": "added", "sort_order": "desc"},
        auth=auth,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


async def get_full_collection(
    username: str, access_token: str, access_token_secret: str
) -> list[dict]:
    """
    Fetch every item in the user's Discogs collection.
    Returns list of raw release dicts with instance_id attached.
    Paginates automatically (500 per page).
    """
    import asyncio

    loop = asyncio.get_running_loop()
    items: list[dict] = []
    page = 1

    while True:
        data = await loop.run_in_executor(
            None, _fetch_collection_page_sync, username, access_token, access_token_secret, page
        )
        releases = data.get("releases", [])
        items.extend(releases)

        pagination = data.get("pagination", {})
        if page >= pagination.get("pages", 1):
            break
        page += 1

    return items




def parse_search_results(results: list[dict]) -> list[dict]:
    matches = []
    for r in results[:10]:
        title_parts = r.get("title", "").split(" - ", 1)
        artist = title_parts[0] if len(title_parts) > 1 else r.get("artist", ["Unknown"])[0] if r.get("artist") else "Unknown"
        title = title_parts[1] if len(title_parts) > 1 else r.get("title", "")
        matches.append(
            {
                "release_id": r.get("id"),
                "title": title,
                "artist": artist,
                "year": r.get("year"),
                "format": ", ".join(r.get("format", [])),
                "country": r.get("country"),
                "label": ", ".join(r.get("label", [])) if r.get("label") else None,
                "cover_image": r.get("cover_image") or r.get("thumb"),
                "resource_url": r.get("resource_url"),
                "catno": r.get("catno"),
                "match_reason": r.get("_match_reason"),
            }
        )
    return matches
