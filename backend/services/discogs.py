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


def _build_strategies(
    artist: str,
    title: str,
    label: str | None,
    catalog_number: str | None,
) -> list[dict]:
    """Build list of Discogs search param dicts for one interpretation."""
    strategies: list[dict] = []
    a = (artist or "").strip()
    t = (title or "").strip()
    catno = (catalog_number or "").strip()
    lbl = (label or "").strip()

    # 1. Catalog number alone — most precise, nails 12" singles immediately
    if catno:
        strategies.append({"catno": catno})

    # 2. Catalog number + label — narrows when catno is generic
    if catno and lbl:
        strategies.append({"catno": catno, "label": lbl})

    # 3. Combined free-text q=
    combined = f"{a} {t}".strip()
    if combined:
        strategies.append({"q": combined})

    # 4. Discogs dedicated artist= + release_title= params
    if a and t:
        strategies.append({"artist": a, "release_title": t})

    # 5. Title alone — catches VA compilations or misidentified artist
    if t and t.lower() not in ("unknown",):
        strategies.append({"q": t})

    # 6. Artist alone — catches misidentified title
    if a and a.lower() not in ("unknown", "various artists", "various"):
        strategies.append({"q": a})

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
) -> list[dict]:
    """
    Parallel multi-strategy search across primary + alternate interpretations.

    All strategies fire concurrently. Results are deduplicated by release_id
    and ranked by how many strategies returned each release — overlap = confidence.
    Returns up to 10 unique releases, best-ranked first.
    """
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_search(params: dict) -> list[dict]:
        try:
            resp = req.get(
                f"{DISCOGS_BASE}/database/search",
                params={**params, "type": "release", "per_page": 10},
                auth=auth,
                headers={"User-Agent": USER_AGENT},
                timeout=20,
            )
            resp.raise_for_status()
            return resp.json().get("results", [])
        except Exception:
            return []

    # Build strategy lists for primary interpretation
    all_strategies = _build_strategies(artist, title, label, catalog_number)

    # Add alternate interpretation strategies (if Claude flagged ambiguity)
    if artist_alt or title_alt:
        a_alt = artist_alt or artist
        t_alt = title_alt or title
        alt_strategies = _build_strategies(a_alt, t_alt, label, catalog_number)
        # Append only strategies not already in primary set
        primary_set = {frozenset(s.items()) for s in all_strategies}
        for s in alt_strategies:
            if frozenset(s.items()) not in primary_set:
                all_strategies.append(s)

    loop = asyncio.get_running_loop()

    # Fire all strategies in parallel
    results_per_strategy: list[list[dict]] = await asyncio.gather(
        *[loop.run_in_executor(None, _sync_search, params) for params in all_strategies]
    )

    # Deduplicate + rank by overlap count
    seen: dict[int, dict] = {}   # release_id → result dict
    score: dict[int, int] = {}   # release_id → count of strategies that returned it

    for strategy_results in results_per_strategy:
        for r in strategy_results:
            rid = r.get("id")
            if rid is None:
                continue
            if rid not in seen:
                seen[rid] = r
                score[rid] = 0
            score[rid] += 1

    # Sort: highest overlap first, then by community_want (popularity proxy)
    ranked = sorted(seen.values(), key=lambda r: (score[r["id"]], r.get("community", {}).get("want", 0)), reverse=True)
    return ranked[:10]


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
            }
        )
    return matches
