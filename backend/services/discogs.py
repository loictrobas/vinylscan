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


async def search_releases(
    artist: str, title: str, access_token: str, access_token_secret: str
) -> list[dict]:
    auth = _oauth1(access_token, access_token_secret)
    # Discogs ignores separate artist/title params — use combined q= query
    params = {"q": f"{artist} {title}".strip(), "type": "release", "per_page": 5}

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


async def add_to_collection(
    username: str, release_id: int, access_token: str, access_token_secret: str
) -> dict:
    import asyncio
    import requests as req

    auth = _oauth1(access_token, access_token_secret)

    def _sync_add():
        resp = req.post(
            f"{DISCOGS_BASE}/users/{username}/collection/folders/0/releases/{release_id}",
            auth=auth,
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _sync_add)


def parse_search_results(results: list[dict]) -> list[dict]:
    matches = []
    for r in results[:3]:
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
