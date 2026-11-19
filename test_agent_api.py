"""TERRA agent API: Pl@ntNet proxy and species lookup, with every outside call mocked."""
import io
import json
import os
import unittest
import urllib.error
from unittest.mock import patch

import agent_api
from server import app

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100
PLANTNET = {
    "results": [
        {"score": 0.8123, "species": {"scientificNameWithoutAuthor": "Polystichum munitum", "commonNames": ["Western sword fern", "Sword fern"],
                                      "family": {"scientificNameWithoutAuthor": "Dryopteridaceae"}, "genus": {"scientificNameWithoutAuthor": "Polystichum"}},
         "gbif": {"id": "5274864"}},
        {"score": 0.05, "species": {"scientificNameWithoutAuthor": "Blechnum spicant", "commonNames": []}, "gbif": {}},
        {"score": 0.01, "species": {}},
    ],
    "remainingIdentificationRequests": 497,
}
GBIF = {"usageKey": 5274864, "scientificName": "Polystichum munitum (Kaulf.) C.Presl", "canonicalName": "Polystichum munitum", "rank": "SPECIES",
        "status": "ACCEPTED", "confidence": 98, "matchType": "EXACT", "kingdom": "Plantae", "phylum": "Tracheophyta", "class": "Polypodiopsida",
        "order": "Polypodiales", "family": "Dryopteridaceae", "genus": "Polystichum"}
INAT = {"total_results": 1, "results": [{"id": 52611, "name": "Polystichum munitum", "rank": "species", "preferred_common_name": "Western Sword Fern",
                                        "observations_count": 61234, "iconic_taxon_name": "Plantae", "wikipedia_url": "http://en.wikipedia.org/wiki/Polystichum_munitum",
                                        "default_photo": {"medium_url": "https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg", "attribution": "(c) someone, CC BY"}}]}
WIKI = {"type": "standard", "title": "Polystichum munitum", "extract": "Polystichum munitum, the western sword fern, is an evergreen fern native to western North America.",
        "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Polystichum_munitum"}}}


def fake_http(calls):
    def http(url, data=None, headers=None, timeout=None):
        calls.append((url, data, headers))
        if "plantnet" in url:
            return PLANTNET
        if "gbif" in url:
            return GBIF
        if "inaturalist" in url:
            return INAT
        if "wikipedia" in url:
            return WIKI
        raise AssertionError(url)
    return http


class AgentApi(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        agent_api._cache.clear()

    def test_status_reports_configuration_without_revealing_the_key(self):
        with patch.dict(os.environ, {"PLANTNET_API_KEY": "secret-key-123"}):
            body = self.client.get("/api/agent/status").get_json()
        self.assertEqual(body, {"plantnet": True, "inat_vision": False, "species": True})
        with patch.dict(os.environ, {"PLANTNET_API_KEY": ""}):
            self.assertFalse(self.client.get("/api/agent/status").get_json()["plantnet"])

    def test_identify_without_key_explains_setup(self):
        with patch.dict(os.environ, {"PLANTNET_API_KEY": ""}):
            r = self.client.post("/api/identify", data={"image": (io.BytesIO(JPEG), "p.jpg")}, content_type="multipart/form-data")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.get_json()["error"], "not_configured")

    def test_identify_sends_only_the_photo_and_normalizes_results(self):
        calls = []
        with patch.dict(os.environ, {"PLANTNET_API_KEY": "secret-key-123"}), patch.object(agent_api, "http", fake_http(calls)):
            r = self.client.post("/api/identify", data={"image": (io.BytesIO(JPEG), "p.jpg"), "organ": "leaf", "notes": "do not send", "lat": "37.7"},
                                 content_type="multipart/form-data")
        body = r.get_json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(body["source"], "plantnet")
        self.assertEqual(body["remaining"], 497)
        self.assertEqual([x["scientificName"] for x in body["results"]], ["Polystichum munitum", "Blechnum spicant"])
        self.assertEqual(body["results"][0], {"scientificName": "Polystichum munitum", "commonNames": ["Western sword fern", "Sword fern"],
                                              "family": "Dryopteridaceae", "genus": "Polystichum", "score": 0.8123, "gbifKey": 5274864})
        self.assertIsNone(body["results"][1]["gbifKey"])
        url, data, headers = calls[0]
        self.assertTrue(url.startswith("https://my-api.plantnet.org/v2/identify/all?"))
        self.assertIn("api-key=secret-key-123", url)
        self.assertIn(b'name="organs"\r\n\r\nleaf', data)
        self.assertIn(JPEG, data)
        self.assertNotIn(b"do not send", data)
        self.assertNotIn(b"37.7", data)
        self.assertNotIn("secret-key-123", json.dumps(body))

    def test_identify_rejects_non_images_and_maps_upstream_errors(self):
        with patch.dict(os.environ, {"PLANTNET_API_KEY": "k"}):
            r = self.client.post("/api/identify", data={"image": (io.BytesIO(b"GIF89a..."), "p.gif")}, content_type="multipart/form-data")
            self.assertEqual((r.status_code, r.get_json()["error"]), (400, "bad_image"))
            r = self.client.post("/api/identify", data={}, content_type="multipart/form-data")
            self.assertEqual(r.status_code, 400)
            for code, expected in [(404, (200, None)), (401, (502, "bad_key")), (429, (429, "quota")), (500, (502, "upstream"))]:
                def boom(*a, **k):
                    raise urllib.error.HTTPError("u", code, "x", {}, None)
                with patch.object(agent_api, "http", boom):
                    r = self.client.post("/api/identify", data={"image": (io.BytesIO(JPEG), "p.jpg")}, content_type="multipart/form-data")
                self.assertEqual((r.status_code, r.get_json().get("error")), expected, code)
            with patch.object(agent_api, "http", side_effect=urllib.error.URLError("offline")):
                r = self.client.post("/api/identify", data={"image": (io.BytesIO(JPEG), "p.jpg")}, content_type="multipart/form-data")
            self.assertEqual(r.get_json()["error"], "upstream")
        big = self.client.post("/api/identify", data={"image": (io.BytesIO(JPEG + b"0" * (10 * 1024 * 1024)), "p.jpg")}, content_type="multipart/form-data")
        self.assertEqual(big.status_code, 413)

    def test_species_combines_sources_and_caches(self):
        calls = []
        with patch.object(agent_api, "http", fake_http(calls)):
            body = self.client.get("/api/species?name=Polystichum%20munitum").get_json()
            again = self.client.get("/api/species?name=polystichum  MUNITUM").get_json()
        self.assertEqual(body["sources"], ["GBIF", "iNaturalist", "Wikipedia"])
        self.assertEqual(body["gbif"]["key"], 5274864)
        self.assertEqual(body["gbif"]["kingdom"], "Plantae")
        self.assertEqual(body["inat"]["commonName"], "Western Sword Fern")
        self.assertEqual(body["inat"]["observations"], 61234)
        self.assertEqual(body["inat"]["url"], "https://www.inaturalist.org/taxa/52611")
        self.assertIn("evergreen fern", body["wikipedia"]["extract"])
        self.assertEqual(len(calls), 3, "second lookup served from cache")
        self.assertEqual(again["gbif"]["key"], 5274864)
        self.assertTrue(any("Polystichum_munitum" in c[0] for c in calls), "Wikipedia looked up by canonical name")

    def test_species_survives_partial_outages_and_validates_names(self):
        def only_inat(url, **k):
            if "inaturalist" in url:
                return INAT
            raise urllib.error.URLError("down")
        with patch.object(agent_api, "http", only_inat):
            body = self.client.get("/api/species?name=Sword fern").get_json()
        self.assertEqual(body["sources"], ["iNaturalist"])
        with patch.object(agent_api, "http", side_effect=urllib.error.URLError("down")):
            r = self.client.get("/api/species?name=Nothing here")
        self.assertEqual((r.status_code, r.get_json()["error"]), (404, "not_found"))
        for bad in ["", "x", "a" * 121, "<script>", "name;rm -rf"]:
            r = self.client.get("/api/species", query_string={"name": bad})
            self.assertEqual(r.status_code, 400, bad)

    def test_secrets_and_server_code_are_never_served(self):
        for path in ["/server.py", "/agent_api.py", "/.env", "/.git/config", "/__pycache__/server.cpython-312.pyc", "/sub/.hidden"]:
            self.assertEqual(self.client.get(path).status_code, 404, path)
        self.assertEqual(self.client.get("/app.js").status_code, 200)


if __name__ == "__main__":
    unittest.main()
