"""iNaturalist helpers for field sessions: what's seen near a spot, and posting your own observations.

- Nearby: public iNaturalist API (no account). Location is rounded to 0.1 degrees (about 11 km) before
  it leaves this server, and answers are cached for an hour.
- Posting: uses YOUR iNaturalist API token, sent by your browser with each request and never stored
  here. Only what you approved is posted: your chosen name, date, location (with your privacy as
  iNaturalist geoprivacy), photos, and your own notes. iNaturalist doesn't allow machine-generated
  text, so the agent's write-up is never sent.
"""
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import uuid

import agent_api

API = "https://api.inaturalist.org/v1"
ICONIC = {"plant": "Plantae", "fungus": "Fungi", "insect": "Insecta", "mammal": "Mammalia", "bird": "Aves", "fish": "Actinopterygii",
          "reptile": "Reptilia,Amphibia", "microorganism": "Protozoa,Chromista", "other": None}
GEOPRIVACY = {"exact": "open", "approximate": "obscured", "hidden": "private"}
TOKEN_RE = re.compile(r"^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$")
_cache, _lock, TTL = {}, threading.Lock(), 3600


def _cached(key, compute):
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < TTL:
            return hit[1]
    value = compute()
    with _lock:
        if len(_cache) > 500:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (now, value)
    return value


def _get(path, params):
    return agent_api.http(f"{API}{path}?{urllib.parse.urlencode(params)}", timeout=15)


def nearby(lat, lon, name=None, group=None):
    """For a spot: how often a species is seen nearby and when, plus what's commonly seen there."""
    import weather_api  # Same coordinate validation and rounding as the weather endpoint.
    lat, lon = weather_api.coordinate(lat, 90), weather_api.coordinate(lon, 180)
    name = " ".join(str(name or "").split())
    if name and not agent_api.NAME_RE.match(name):
        raise agent_api.AgentError(400, "bad_name", "Give a species name between 2 and 120 characters.")
    if group is not None and group not in ICONIC:
        raise agent_api.AgentError(400, "bad_group", "Unknown organism group.")

    def compute():
        result = {"lat": lat, "lon": lon, "radiusKm": 10, "species": None, "common": [], "source": "iNaturalist"}
        try:
            if name:
                taxa = _get("/taxa", {"q": name, "per_page": 1, "is_active": "true"}).get("results") or []
                if taxa:
                    t = taxa[0]
                    count = _get("/observations", {"taxon_id": t["id"], "lat": lat, "lng": lon, "radius": 10, "per_page": 0, "verifiable": "true"}).get("total_results")
                    hist = _get("/observations/histogram", {"taxon_id": t["id"], "lat": lat, "lng": lon, "radius": 25, "interval": "month_of_year", "verifiable": "true"})
                    months = (hist.get("results") or {}).get("month_of_year") or {}
                    by_month = [int(months.get(str(m), months.get(m, 0)) or 0) for m in range(1, 13)]
                    result["species"] = {"taxonId": t.get("id"), "name": t.get("name"), "commonName": t.get("preferred_common_name"),
                                         "nearby": count if isinstance(count, int) else None, "months": by_month}
            iconic = ICONIC.get(group) if group else None
            params = {"lat": lat, "lng": lon, "radius": 10, "per_page": 8, "verifiable": "true"}
            if iconic:
                params["iconic_taxa"] = iconic
            for row in (_get("/observations/species_counts", params).get("results") or [])[:8]:
                t = row.get("taxon") or {}
                if t.get("name"):
                    result["common"].append({"name": t.get("name"), "commonName": t.get("preferred_common_name"), "count": row.get("count"), "taxonId": t.get("id")})
        except urllib.error.HTTPError as error:
            if error.code == 429:
                raise agent_api.AgentError(429, "quota", "iNaturalist is busy. Try again in a minute.") from None
            raise agent_api.AgentError(502, "upstream", "iNaturalist couldn't answer right now.") from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, TypeError):
            raise agent_api.AgentError(502, "upstream", "Couldn't reach iNaturalist. Check this computer's internet connection.") from None
        return result

    return _cached((lat, lon, name.lower(), group), compute)


def _multipart(fields, files):
    boundary = uuid.uuid4().hex
    parts = []
    for key, value in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode())
    for key, (filename, data, kind) in files.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"; filename=\"{filename}\"\r\nContent-Type: {kind}\r\n\r\n".encode() + data + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def post_observation(token, fields, photos):
    """Create an observation on iNaturalist as the token's owner, then attach photos."""
    token = (token or "").strip()
    if not TOKEN_RE.match(token) or len(token) > 4000:
        raise agent_api.AgentError(401, "no_token", "Add your iNaturalist API token first (Profile → iNaturalist).")
    name = " ".join(str(fields.get("name") or "").split())[:120]
    date = str(fields.get("date") or "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise agent_api.AgentError(400, "bad_date", "The observation needs a date.")
    privacy = fields.get("privacy")
    if privacy not in GEOPRIVACY:
        raise agent_api.AgentError(400, "bad_privacy", "Unknown privacy setting.")
    observation = {"observed_on_string": date, "geoprivacy": GEOPRIVACY[privacy], "description": str(fields.get("notes") or "")[:2000]}
    if name and name.lower() != "unknown":
        observation["species_guess"] = name
    taxon_id = fields.get("taxonId")
    scientific = " ".join(str(fields.get("scientificName") or "").split())[:200]
    if not (isinstance(taxon_id, int) and taxon_id > 0) and scientific and agent_api.NAME_RE.match(scientific):
        # Attach iNaturalist's taxon only on an exact scientific-name match; otherwise the name stays a guess.
        try:
            hits = _get("/taxa", {"q": scientific, "per_page": 3, "is_active": "true"}).get("results") or []
            taxon_id = next((t.get("id") for t in hits if str(t.get("name", "")).lower() == scientific.lower()), None)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            taxon_id = None
    if isinstance(taxon_id, int) and taxon_id > 0:
        observation["taxon_id"] = taxon_id
    lat, lon, accuracy = fields.get("lat"), fields.get("lon"), fields.get("accuracy")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and -90 <= lat <= 90 and -180 <= lon <= 180:
        observation["latitude"], observation["longitude"] = round(float(lat), 5), round(float(lon), 5)
        if isinstance(accuracy, (int, float)) and 0 < accuracy < 1_000_000:
            observation["positional_accuracy"] = int(accuracy)
    if len(photos) > 4 or any(len(p) > agent_api.MAX_IMAGE or not agent_api.image_type(p) for p in photos):
        raise agent_api.AgentError(400, "bad_image", "Up to 4 JPEG or PNG photos, 8 MB each.")
    headers = {"Authorization": token}
    try:
        created = agent_api.http(f"{API}/observations", data=json.dumps({"observation": observation}).encode(), headers={**headers, "Content-Type": "application/json"}, timeout=30)
        record = (created.get("results") or [created])[0] if isinstance(created, dict) else {}
        obs_id = record.get("id")
        if not isinstance(obs_id, int):
            raise agent_api.AgentError(502, "upstream", "iNaturalist didn't confirm the new observation.")
        uploaded = 0
        for photo in photos:
            body, kind = _multipart({"observation_photo[observation_id]": obs_id}, {"file": ("photo.jpg", photo, agent_api.image_type(photo))})
            agent_api.http(f"{API}/observation_photos", data=body, headers={**headers, "Content-Type": kind}, timeout=60)
            uploaded += 1
    except urllib.error.HTTPError as error:
        if error.code == 401:
            raise agent_api.AgentError(401, "bad_token", "iNaturalist didn't accept the token. Tokens last 24 hours; get a fresh one and try again.") from None
        if error.code == 429:
            raise agent_api.AgentError(429, "quota", "iNaturalist is busy. Wait a minute and try again.") from None
        raise agent_api.AgentError(502, "upstream", "iNaturalist couldn't save this observation right now.") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise agent_api.AgentError(502, "upstream", "Couldn't reach iNaturalist. Check this computer's internet connection.") from None
    return {"id": obs_id, "url": f"https://www.inaturalist.org/observations/{obs_id}", "photos": uploaded}
