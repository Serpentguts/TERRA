import os
from flask import Flask, send_from_directory, jsonify, request

import agent_api

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 9 * 1024 * 1024  # One photo for identification, plus form overhead.
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


@app.route("/api/species")
def species():
    try:
        return jsonify(agent_api.species(request.args.get("name", "")))
    except agent_api.AgentError as error:
        return agent_error(error)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
