"""Terrarium weather endpoint: Open-Meteo mocked; rounding, caching, codes and errors."""
import os
import unittest
import urllib.error
from unittest.mock import patch

import agent_api
import weather_api
from server import app

CURRENT = {"current": {"time": "2026-11-17T10:45", "interval": 900, "temperature_2m": 11.26, "precipitation": 0.4, "rain": 0.4, "snowfall": 0.0,
                       "weather_code": 61, "cloud_cover": 96, "wind_speed_10m": 12.3, "is_day": 1}}


class WeatherApi(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        weather_api._cache.clear()

    def test_rounds_location_normalizes_and_caches(self):
        calls = []
        def http(url, data=None, headers=None, timeout=None):
            calls.append(url)
            return CURRENT
        with patch.object(agent_api, "http", http), patch.dict(os.environ, {"OPEN_METEO_API_KEY": ""}):
            body = self.client.get("/api/weather?lat=37.7749&lon=-122.4194").get_json()
            again = self.client.get("/api/weather?lat=37.7612&lon=-122.4499").get_json()
        self.assertEqual(body, {"lat": 37.8, "lon": -122.4, "time": "2026-11-17T10:45", "temperature": 11.3, "precipitation": 0.4, "snowfall": 0.0,
                                "cloud": 96.0, "wind": 12.3, "code": 61, "kind": "rain", "isDay": True, "source": "Open-Meteo"})
        self.assertEqual(again, body, "same rounded spot served from cache")
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0].startswith("https://api.open-meteo.com/v1/forecast?latitude=37.8&longitude=-122.4&current="))
        self.assertNotIn("37.7749", calls[0])

    def test_commercial_key_uses_customer_server(self):
        calls = []
        with patch.object(agent_api, "http", lambda url, **k: calls.append(url) or CURRENT), patch.dict(os.environ, {"OPEN_METEO_API_KEY": "k123"}):
            self.client.get("/api/weather?lat=1&lon=2")
        self.assertTrue(calls[0].startswith("https://customer-api.open-meteo.com/v1/forecast?"))
        self.assertIn("apikey=k123", calls[0])

    def test_weather_codes(self):
        cases = {0: "clear", 1: "clear", 2: "cloudy", 3: "cloudy", 45: "fog", 48: "fog", 53: "drizzle", 63: "rain", 81: "rain", 71: "snow", 86: "snow", 95: "storm", 99: "storm", None: "clear"}
        for code, expected in cases.items():
            self.assertEqual(weather_api.kind(code), expected, code)

    def test_bad_input_and_upstream_errors(self):
        for q in ["", "lat=abc&lon=1", "lat=91&lon=0", "lat=0&lon=181", "lat=nan&lon=0"]:
            self.assertEqual(self.client.get(f"/api/weather?{q}").status_code, 400, q)
        with patch.object(agent_api, "http", side_effect=urllib.error.URLError("offline")):
            r = self.client.get("/api/weather?lat=1&lon=1")
        self.assertEqual((r.status_code, r.get_json()["error"]), (502, "upstream"))
        def busy(*a, **k):
            raise urllib.error.HTTPError("u", 429, "busy", {}, None)
        with patch.object(agent_api, "http", busy):
            self.assertEqual(self.client.get("/api/weather?lat=2&lon=2").status_code, 429)
        with patch.object(agent_api, "http", lambda *a, **k: {}):
            body = self.client.get("/api/weather?lat=3&lon=3").get_json()
        self.assertEqual((body["kind"], body["temperature"]), ("clear", None))


if __name__ == "__main__":
    unittest.main()


class EnvFile(unittest.TestCase):
    def test_env_file_loads_keys_without_overriding_real_environment(self):
        import tempfile
        import server
        with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as f:
            f.write("# comment\nPLANTNET_API_KEY='from-file'\nTERRA_TEST_ONLY=yes\nnot a line\n")
        try:
            with patch.dict(os.environ, {"TERRA_TEST_ONLY": "real"}, clear=False):
                os.environ.pop("PLANTNET_API_KEY", None)
                server.load_env_file(f.name)
                self.assertEqual(os.environ["PLANTNET_API_KEY"], "from-file")
                self.assertEqual(os.environ["TERRA_TEST_ONLY"], "real", "real environment wins")
                os.environ.pop("PLANTNET_API_KEY", None)
            server.load_env_file("/nonexistent/.env")  # Missing file is fine.
        finally:
            os.unlink(f.name)
        self.assertEqual(app.test_client().get("/.env").status_code, 404)
        self.assertEqual(app.test_client().get("/.env.example").status_code, 404)
