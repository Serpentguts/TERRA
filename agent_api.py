"""TERRA agent: server-side helpers for photo identification and species information.

The browser never talks to these services directly and never sees an API key.
- Pl@ntNet (plants only) needs PLANTNET_API_KEY in the environment (free at my.plantnet.org).
- GBIF, iNaturalist and Wikipedia public endpoints need no key.
Only the image and a species name are sent; never the observation's location, notes or id.
Uses the standard library only (no extra dependencies).
"""
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

USER_AGENT = "TERRA/0.1 (local field journal; https://github.com/Serpentguts/TERRA)"
PLANTNET_URL = "https://my-api.plantnet.org/v2/identify/all"
GBIF_MATCH = "https://api.gbif.org/v1/species/match"
INAT_TAXA = "https://api.inaturalist.org/v1/taxa"
WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
ORGANS = {"auto", "leaf", "flower", "fruit", "bark"}
NAME_RE = re.compile(r"^[\w\s.'()\-×]{2,120}$", re.UNICODE)
MAX_IMAGE = 8 * 1024 * 1024
TIMEOUT = 20


class AgentError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def http(url, data=None, headers=None, timeout=TIMEOUT):
    """GET (or POST bytes) and parse JSON. Patched in tests."""
    request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


# ---- small in-memory cache for species lookups (names repeat a lot) ----
_cache, _lock, CACHE_TTL, CACHE_MAX = {}, threading.Lock(), 24 * 3600, 500


def cached(key, compute):
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]
    value = compute()
    with _lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (now, value)
    return value


def image_type(data):
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return None


def identify(image, organ="auto", key=None):
    """Ask Pl@ntNet for plant species. Returns normalized suggestions."""
    key = key if key is not None else os.environ.get("PLANTNET_API_KEY", "").strip()
    if not key:
        raise AgentError(503, "not_configured", "Plant identification isn't set up on this TERRA server. Add a free Pl@ntNet API key as PLANTNET_API_KEY and restart.")
    if not image or len(image) > MAX_IMAGE:
        raise AgentError(400, "bad_image", "Send one JPEG or PNG photo up to 8 MB.")
    kind = image_type(image)
    if not kind:
        raise AgentError(400, "bad_image", "Send one JPEG or PNG photo up to 8 MB.")
    organ = organ if organ in ORGANS else "auto"
    boundary = uuid.uuid4().hex
    body = b"".join([
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"images\"; filename=\"photo.{'png' if kind == 'image/png' else 'jpg'}\"\r\nContent-Type: {kind}\r\n\r\n".encode(),
        image, b"\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"organs\"\r\n\r\n{organ}\r\n--{boundary}--\r\n".encode(),
    ])
    query = urllib.parse.urlencode({"api-key": key, "nb-results": 5, "lang": "en", "include-related-images": "false"})
    try:
        raw = http(f"{PLANTNET_URL}?{query}", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return {"source": "plantnet", "results": [], "remaining": None}  # Pl@ntNet: "Species not found"
        if error.code in (401, 403):
            raise AgentError(502, "bad_key", "Pl@ntNet rejected the API key. Check PLANTNET_API_KEY.") from None
        if error.code == 429:
            raise AgentError(429, "quota", "Today's Pl@ntNet identification quota is used up. Try again tomorrow.") from None
        raise AgentError(502, "upstream", "Pl@ntNet couldn't identify this photo right now. Try again later.") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise AgentError(502, "upstream", "Couldn't reach Pl@ntNet. Check this computer's internet connection.") from None
    results = []
    for r in (raw.get("results") or [])[:5]:
        species = r.get("species") or {}
        name = species.get("scientificNameWithoutAuthor") or species.get("scientificName")
        if not isinstance(name, str) or not name:
            continue
        score = r.get("score")
        results.append({
            "scientificName": name[:200],
            "commonNames": [c for c in (species.get("commonNames") or []) if isinstance(c, str)][:5],
            "family": ((species.get("family") or {}).get("scientificNameWithoutAuthor") or "")[:60],
            "genus": ((species.get("genus") or {}).get("scientificNameWithoutAuthor") or "")[:60],
            "score": round(float(score), 4) if isinstance(score, (int, float)) else None,
            "gbifKey": int((r.get("gbif") or {}).get("id")) if str((r.get("gbif") or {}).get("id") or "").isdigit() else None,
        })
    remaining = raw.get("remainingIdentificationRequests")
    return {"source": "plantnet", "results": results, "remaining": remaining if isinstance(remaining, int) else None}


def _gbif(name):
    m = http(f"{GBIF_MATCH}?{urllib.parse.urlencode({'name': name, 'verbose': 'false'})}")
    if not m or m.get("matchType") == "NONE" or not m.get("usageKey"):
        return None
    pick = {k: m.get(k) for k in ("scientificName", "canonicalName", "rank", "kingdom", "phylum", "class", "order", "family", "genus", "matchType", "confidence") if m.get(k) is not None}
    pick["key"] = m.get("acceptedUsageKey") or m.get("usageKey")
    pick["status"] = m.get("status")
    return pick


def _inat(name):
    data = http(f"{INAT_TAXA}?{urllib.parse.urlencode({'q': name, 'per_page': 1, 'is_active': 'true'})}")
    results = data.get("results") or []
    if not results:
        return None
    t = results[0]
    photo = t.get("default_photo") or {}
    status = t.get("conservation_status") or {}
    return {
        "id": t.get("id"), "name": t.get("name"), "rank": t.get("rank"),
        "commonName": t.get("preferred_common_name"), "observations": t.get("observations_count"),
        "iconic": t.get("iconic_taxon_name"), "wikipedia": t.get("wikipedia_url"),
        "conservation": status.get("status_name") or status.get("status"),
        "photo": {"url": photo.get("medium_url") or photo.get("url"), "attribution": photo.get("attribution")} if (photo.get("medium_url") or photo.get("url")) else None,
        "url": f"https://www.inaturalist.org/taxa/{t.get('id')}" if t.get("id") else None,
    }


def _wiki(title):
    data = http(WIKI_SUMMARY + urllib.parse.quote(title.replace(" ", "_"), safe=""))
    if data.get("type") == "disambiguation" or not data.get("extract"):
        return None
    return {"title": data.get("title"), "extract": data["extract"][:1200], "url": ((data.get("content_urls") or {}).get("desktop") or {}).get("page")}


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception:  # A failed source just means less info; never fails the whole lookup.
        return None


def species(name):
    """Combine GBIF taxonomy, iNaturalist and Wikipedia for a species name (common or scientific)."""
    name = " ".join(str(name or "").split())
    if not NAME_RE.match(name):
        raise AgentError(400, "bad_name", "Give a species name between 2 and 120 characters.")

    def compute():
        with ThreadPoolExecutor(max_workers=2) as pool:
            gbif_f, inat_f = pool.submit(_safe, _gbif, name), pool.submit(_safe, _inat, name)
            gbif, inat = gbif_f.result(), inat_f.result()
        title = (gbif or {}).get("canonicalName") or (inat or {}).get("name") or name
        wiki = _safe(_wiki, title)
        if not (gbif or inat or wiki):
            raise AgentError(404, "not_found", f"No species information found for “{name}”.")
        return {"query": name, "gbif": gbif, "inat": inat, "wikipedia": wiki,
                "sources": [s for s, v in (("GBIF", gbif), ("iNaturalist", inat), ("Wikipedia", wiki)) if v]}

    return cached(name.lower(), compute)
