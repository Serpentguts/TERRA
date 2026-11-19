"""Field-session server helpers: iNaturalist nearby lookups and posting (all calls mocked)."""
import io
import json
import unittest
import urllib.error
from unittest.mock import patch

import agent_api
import inat_api
from server import app

JPEG = b"\xff\xd8\xff\xe0" + b"1" * 200
TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX2lkIjoxfQ.c2lnbmF0dXJl"


def fake(calls, created_id=123456):
    def http(url, data=None, headers=None, timeout=None):
        calls.append((url, data, headers or {}))
        if "/taxa?" in url:
            return {"results": [{"id": 52611, "name": "Polystichum munitum", "preferred_common_name": "Western Sword Fern"}]}
        if "/observations/histogram" in url:
            return {"results": {"month_of_year": {str(m): (m * 3 if m in (3, 4, 5) else 1) for m in range(1, 13)}}}
        if "/observations/species_counts" in url:
            return {"results": [{"count": 412, "taxon": {"id": 1, "name": "Amanita muscaria", "preferred_common_name": "Fly Agaric"}}, {"count": 90, "taxon": {"id": 2, "name": "Trametes versicolor", "preferred_common_name": "Turkey Tail"}}]}
        if url.endswith("/v1/observations"):
            return {"results": [{"id": created_id}]}
        if "/observations?" in url:
            return {"total_results": 214}
        if url.endswith("/observation_photos"):
            return {"id": 9, "observation_id": created_id}
        raise AssertionError(url)
    return http


class Nearby(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        inat_api._cache.clear()

    def test_species_counts_seasonality_and_common_species_with_rounded_location(self):
        calls = []
        with patch.object(agent_api, "http", fake(calls)):
            body = self.client.get("/api/nearby?lat=37.77491&lon=-122.41942&name=Polystichum%20munitum&group=fungus").get_json()
        self.assertEqual(body["species"], {"taxonId": 52611, "name": "Polystichum munitum", "commonName": "Western Sword Fern", "nearby": 214,
                                           "months": [1, 1, 9, 12, 15, 1, 1, 1, 1, 1, 1, 1]})
        self.assertEqual([c["name"] for c in body["common"]], ["Amanita muscaria", "Trametes versicolor"])
        self.assertEqual((body["lat"], body["lon"], body["radiusKm"]), (37.8, -122.4, 10))
        self.assertTrue(all("37.77491" not in c[0] and "lat=37.8" in c[0] for c in calls if "lat=" in c[0]), "only the rounded spot leaves the server")
        self.assertTrue(any("iconic_taxa=Fungi" in c[0] for c in calls))
        with patch.object(agent_api, "http", fake(calls)):
            self.client.get("/api/nearby?lat=37.78&lon=-122.41&name=Polystichum%20munitum&group=fungus")
        self.assertEqual(len(calls), 4, "cached")

    def test_validation_and_errors(self):
        for q in ["lat=x&lon=1", "lat=1&lon=1&group=dragons", "lat=1&lon=1&name=%3Cb%3E"]:
            self.assertEqual(self.client.get(f"/api/nearby?{q}").status_code, 400, q)
        with patch.object(agent_api, "http", side_effect=urllib.error.URLError("offline")):
            self.assertEqual(self.client.get("/api/nearby?lat=1&lon=1").status_code, 502)


class Posting(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def post(self, fields, photos=(JPEG,), token=TOKEN):
        data = {"observation": json.dumps(fields), "photos": [(io.BytesIO(p), "p.jpg") for p in photos]}
        return self.client.post("/api/inat/observations", data=data, content_type="multipart/form-data", headers={"X-iNat-Token": token} if token else {})

    def test_posts_only_what_was_approved_with_geoprivacy_and_photos(self):
        calls = []
        fields = {"name": "Western sword fern", "taxonId": 52611, "date": "2024-03-13", "privacy": "approximate", "lat": 37.774912, "lon": -122.419416, "accuracy": 12,
                  "notes": "Under alders by the creek.", "agentSummary": "MACHINE TEXT", "id": "local-id"}
        with patch.object(agent_api, "http", fake(calls)):
            r = self.post(fields, photos=(JPEG, JPEG))
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(r.get_json(), {"id": 123456, "url": "https://www.inaturalist.org/observations/123456", "photos": 2})
        url, data, headers = calls[0]
        self.assertEqual(url, "https://api.inaturalist.org/v1/observations")
        self.assertEqual(headers["Authorization"], TOKEN)
        sent = json.loads(data)["observation"]
        self.assertEqual(sent, {"observed_on_string": "2024-03-13", "geoprivacy": "obscured", "description": "Under alders by the creek.", "species_guess": "Western sword fern",
                                "taxon_id": 52611, "latitude": 37.77491, "longitude": -122.41942, "positional_accuracy": 12})
        self.assertNotIn("MACHINE", data.decode())
        self.assertEqual([c[0] for c in calls[1:]], ["https://api.inaturalist.org/v1/observation_photos"] * 2)
        self.assertIn(b'name="observation_photo[observation_id]"\r\n\r\n123456', calls[1][1])
        self.assertIn(JPEG, calls[1][1])

    def test_scientific_name_attaches_the_matching_inat_taxon_only_on_exact_match(self):
        calls = []
        with patch.object(agent_api, "http", fake(calls)):
            self.post({"name": "Sword fern", "scientificName": "Polystichum munitum", "date": "2024-03-13", "privacy": "exact"}, photos=())
            sent = json.loads(next(c for c in calls if c[0].endswith("/v1/observations"))[1])["observation"]
            self.assertEqual(sent["taxon_id"], 52611)
            calls.clear()
            self.post({"name": "Sword fern", "scientificName": "Polystichum imbricans", "date": "2024-03-13", "privacy": "exact"}, photos=())
            sent = json.loads(next(c for c in calls if c[0].endswith("/v1/observations"))[1])["observation"]
            self.assertNotIn("taxon_id", sent, "no exact match: the name stays a guess")

    def test_privacy_mapping_unknown_names_and_errors(self):
        calls = []
        with patch.object(agent_api, "http", fake(calls)):
            self.post({"name": "Unknown", "date": "2024-03-13", "privacy": "hidden"}, photos=())
        sent = json.loads(calls[0][1])["observation"]
        self.assertEqual(sent["geoprivacy"], "private")
        self.assertNotIn("species_guess", sent)
        self.assertNotIn("latitude", sent)
        self.assertEqual(self.post({"date": "2024-03-13", "privacy": "exact"}, token="").get_json()["error"], "no_token")
        self.assertEqual(self.post({"date": "2024-03-13", "privacy": "exact"}, token="not a jwt").status_code, 401)
        self.assertEqual(self.post({"date": "nope", "privacy": "exact"}).status_code, 400)
        self.assertEqual(self.post({"date": "2024-03-13", "privacy": "public"}).status_code, 400)
        self.assertEqual(self.post({"date": "2024-03-13", "privacy": "exact"}, photos=(b"GIF89a",)).status_code, 400)
        def unauthorized(*a, **k):
            raise urllib.error.HTTPError("u", 401, "no", {}, None)
        with patch.object(agent_api, "http", unauthorized):
            r = self.post({"date": "2024-03-13", "privacy": "exact"})
        self.assertEqual((r.status_code, r.get_json()["error"]), (401, "bad_token"))
        r = self.client.post("/api/inat/observations", data={"observation": "[1,2"}, content_type="multipart/form-data")
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()
