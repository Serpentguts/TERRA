import os
from flask import Flask, send_from_directory, jsonify, request



def load_env_file(path=".env"):
    """Read KEY=value lines from a private .env file (git-ignored, never served). Real environment variables win."""
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key, value = key.strip(), value.strip().strip('"').strip("'")
                if key.replace("_", "").isalnum() and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        pass


load_env_file(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import agent_api  # noqa: E402  (after .env so keys are visible)
import weather_api  # noqa: E402
import inat_api  # noqa: E402

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 34 * 1024 * 1024  # Up to 4 photos to post to iNaturalist (each route checks its own limit).
PORT = int(os.environ.get("PORT", 8080))

# --- Serve frontend ---
@app.route("/")
def index():
    return send_from_directory(".", "index.html")

# Never serve secrets or server code: dotfiles (.env, .git), Python, or anything outside the app folder.
BLOCKED = (".py", ".pyc", ".env", ".pem", ".key")


@app.route("/<path:path>")
def static_files(path):
    parts = path.replace("\\", "/").split("/")
    if any(p.startswith(".") for p in parts) or path.lower().endswith(BLOCKED) or "__pycache__" in parts:
        return "Not found", 404
    if os.path.isfile(path):
        return send_from_directory(".", path)
    return "Not found", 404

# --- API routes ---
@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})

# --- TERRA agent: identification and species info (keys stay on this server) ---
def agent_error(error):
    return jsonify({"error": error.code, "message": error.message}), error.status


@app.route("/api/agent/status")
def agent_status():
    return jsonify({"plantnet": bool(os.environ.get("PLANTNET_API_KEY", "").strip()), "inat_vision": False,
                    "species": True})


@app.route("/api/identify", methods=["POST"])
def identify():
    upload = request.files.get("image")
    if request.content_length and request.content_length > agent_api.MAX_IMAGE + 64 * 1024:
        return jsonify({"error": "bad_image", "message": "Send one JPEG or PNG photo up to 8 MB."}), 413
    try:
        return jsonify(agent_api.identify(upload.read() if upload else b"", request.form.get("organ", "auto")))
    except agent_api.AgentError as error:
        return agent_error(error)


@app.route("/api/weather")
def weather():
    try:
        return jsonify(weather_api.weather(request.args.get("lat"), request.args.get("lon")))
    except agent_api.AgentError as error:
        return agent_error(error)


@app.route("/api/nearby")
def nearby():
    try:
        return jsonify(inat_api.nearby(request.args.get("lat"), request.args.get("lon"), request.args.get("name") or None, request.args.get("group") or None))
    except agent_api.AgentError as error:
        return agent_error(error)


@app.route("/api/inat/observations", methods=["POST"])
def inat_post():
    # The browser sends the user's own token per request; it is never stored on this server.
    import json as _json
    try:
        fields = _json.loads(request.form.get("observation") or "{}")
        if not isinstance(fields, dict):
            raise ValueError
    except ValueError:
        return jsonify({"error": "bad_request", "message": "Malformed observation."}), 400
    photos = [f.read() for f in request.files.getlist("photos")][:5]
    try:
        return jsonify(inat_api.post_observation(request.headers.get("X-iNat-Token", ""), fields, photos))
    except agent_api.AgentError as error:
        return agent_error(error)


@app.route("/api/species")
def species():
    try:
        return jsonify(agent_api.species(request.args.get("name", "")))
    except agent_api.AgentError as error:
        return agent_error(error)

if __name__ == "__main__":
    # TERRA_HOST=0.0.0.0 lets a phone on the same Wi-Fi reach this computer (for trying field
    # sessions). Phones only share location over HTTPS, so real field use needs a hosted HTTPS copy.
    app.run(host=os.environ.get("TERRA_HOST", "127.0.0.1"), port=PORT)
