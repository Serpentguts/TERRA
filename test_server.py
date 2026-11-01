"""Local smoke/markup checks; no reporting backend or journal writes."""
import json
import os
import runpy
import unittest
from unittest.mock import patch
from html.parser import HTMLParser
from pathlib import Path

from server import app


class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.labels = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "label" and "for" in attrs:
            self.labels.append(attrs["for"])


class LocalAppChecks(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_existing_file_and_health_routes(self):
        for path, content_type in [
            ("/", "text/html"), ("/index.html", "text/html"),
            ("/app.js", "javascript"), ("/ui.js", "javascript"),
            ("/local-data.js", "javascript"), ("/local-map.js", "javascript"),
            ("/rewards.js", "javascript"), ("/profile.js", "javascript"),
            ("/styles.css", "text/css"),
            ("/ditto.json", "application/json"),
        ]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(content_type, response.content_type)
                response.close()
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/does-not-exist").status_code, 404)
        self.assertEqual(self.client.post("/api/projects", json={}).status_code, 405)

    def test_combined_panels_are_served(self):
        response = self.client.get("/")
        try:
            html = response.get_data(as_text=True)
            for control in ["identify-record", "identify-more", "discovery-previews",
                            "discovery-location", "add-project-button", "project-form",
                            "observation-map", "project-map", "trash-list", "project-endDate",
                            "project-group-choice", "view-stack-help", "genetic-data", "navigation-toggle",
                            "site-navigation", "bottom-navigation", "home", "map", "feed",
                            "profile", "profile-form",
                            "profile-tabs", "profile-observations", "rewards-terrarium",
                            "workspace", "workspace-views", "organism-choice", "organism-options",
                            "map-purpose", "map-organism", "map-results", "map-reset",
                            "identify-location", "demo-map", "demo-listings"]:
                with self.subTest(control=control):
                    self.assertIn(f'id="{control}"', html)
        finally:
            response.close()

    def test_startup_is_loopback_only_and_honors_port(self):
        with patch.dict(os.environ, {"PORT": "8091"}), patch("flask.Flask.run") as run:
            runpy.run_path("server.py", run_name="__main__")
        run.assert_called_once_with(host="127.0.0.1", port=8091)

    def test_manifest_and_markup(self):
        manifest = json.loads(Path("ditto.json").read_text())
        self.assertEqual(manifest["entrypoint"], "index.html")
        self.assertIn("Field Summary", manifest["description"])
        parser = Markup()
        parser.feed(Path("index.html").read_text())
        self.assertEqual(len(parser.ids), len(set(parser.ids)), "Duplicate HTML IDs")
        self.assertTrue(set(parser.labels).issubset(parser.ids), "Orphaned labels")
        for required in ["observation-form", "identification-form", "import-preview", "project-form", "project-report", "project-error"]:
            self.assertIn(required, parser.ids)


if __name__ == "__main__":
    unittest.main()
