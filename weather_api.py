"""Local weather for the terrarium, via Open-Meteo (no key for non-commercial use).

The browser sends a location already rounded to 0.1 degrees (about 11 km); this server rounds
again before calling Open-Meteo and caches each rounded spot for 15 minutes. Nothing else about
the user is sent. Set OPEN_METEO_API_KEY for Open-Meteo's commercial service.
"""
import os
import threading
import time
import urllib.error
import urllib.parse

import agent_api

FREE_URL = "https://api.open-meteo.com/v1/forecast"
CUSTOMER_URL = "https://customer-api.open-meteo.com/v1/forecast"
FIELDS = "temperature_2m,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,is_day"
CACHE_TTL = 15 * 60
_cache, _lock = {}, threading.Lock()


def kind(code):
    """WMO weather code -> a simple sky the jar can draw."""
    if code is None:
        return "clear"
    if code in (0, 1):
        return "clear"
    if code in (2, 3):
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if 51 <= code <= 57:
        return "drizzle"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if code >= 95:
        return "storm"
    return "cloudy"


def coordinate(value, limit):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise agent_api.AgentError(400, "bad_location", "Send a latitude and longitude.") from None
    if not -limit <= number <= limit or number != number:
        raise agent_api.AgentError(400, "bad_location", "That location is out of range.")
    return round(number, 1)


def weather(lat, lon):
    lat, lon = coordinate(lat, 90), coordinate(lon, 180)
    key = (lat, lon)
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]
    paid = os.environ.get("OPEN_METEO_API_KEY", "").strip()
    query = {"latitude": lat, "longitude": lon, "current": FIELDS, "timezone": "auto"}
    if paid:
        query["apikey"] = paid
    try:
        raw = agent_api.http(f"{CUSTOMER_URL if paid else FREE_URL}?{urllib.parse.urlencode(query)}", timeout=10)
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise agent_api.AgentError(429, "quota", "The weather service is busy. The jar will use the calendar for now.") from None
        raise agent_api.AgentError(502, "upstream", "Couldn't get local weather right now. The jar will use the calendar for now.") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise agent_api.AgentError(502, "upstream", "Couldn't reach the weather service. Check this computer's internet connection.") from None
    current = raw.get("current") or {}

    def num(name):
        value = current.get(name)
        return round(float(value), 1) if isinstance(value, (int, float)) else None

    code = current.get("weather_code")
    code = int(code) if isinstance(code, (int, float)) else None
    result = {
        "lat": lat, "lon": lon, "time": current.get("time") if isinstance(current.get("time"), str) else None,
        "temperature": num("temperature_2m"), "precipitation": num("precipitation"), "snowfall": num("snowfall"),
        "cloud": num("cloud_cover"), "wind": num("wind_speed_10m"), "code": code, "kind": kind(code),
        "isDay": bool(current.get("is_day")) if current.get("is_day") is not None else None,
        "source": "Open-Meteo",
    }
    with _lock:
        if len(_cache) > 500:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (now, result)
    return result
