import os
from flask import Flask, send_from_directory, jsonify

app = Flask(__name__)
PORT = int(os.environ.get("PORT", 8080))

# --- Serve frontend ---
@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def static_files(path):
    if os.path.isfile(path):
        return send_from_directory(".", path)
    return "Not found", 404

# --- API routes ---
@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})

# TODO: Add your API routes here

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
