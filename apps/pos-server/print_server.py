"""
Minimal POS print server — receives pre-rendered images and prints them.

All rendering (text layout, portrait processing, dithering) happens in the
cloud print-renderer service. This server just does ESC/POS image printing.

Usage:
    python print_server.py                  # start with real printer
    python print_server.py --dummy          # test mode (no printer needed)

Send jobs via HTTP POST:

    # Single image
    curl -X POST http://localhost:9100/print -F "file=@card.png"

    # Batch (multiple images, single cut)
    curl -X POST http://localhost:9100/print/batch -F "files=@z0.png" -F "files=@z1.png"
"""

import os
import sys
import time
import signal
import tempfile
import threading
import logging
import argparse
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from printer_core import load_config, connect, validate_config

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB

# Globals set at startup
_config = None
_printer = None
_dummy = False
_print_lock = threading.Lock()
_server_start_time = None
_last_print_time = None

logger = logging.getLogger(__name__)


def reconnect():
    """Reconnect to the printer after a failed print."""
    global _printer
    try:
        _printer.close()
    except Exception:
        pass
    time.sleep(0.5)
    _printer = connect(_config, dummy=_dummy)


def with_retry(fn):
    """Run a print function with mutex lock and reconnect on failure."""
    global _last_print_time
    with _print_lock:
        try:
            _printer.hw("INIT")
            fn(_printer)
            _last_print_time = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            logger.warning("Print failed (%s), reconnecting...", e)
            try:
                reconnect()
                _printer.hw("INIT")
                fn(_printer)
                _last_print_time = datetime.now(timezone.utc).isoformat()
            except Exception as e2:
                logger.error("Retry also failed: %s", e2)
                raise


@app.route("/print", methods=["POST"])
@app.route("/print/image", methods=["POST"])
def print_image():
    """Print a single pre-rendered image. Accepts multipart/form-data with 'file'."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Empty filename"}), 400

    suffix = os.path.splitext(uploaded.filename)[1] or ".png"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        uploaded.save(tmp)
        tmp.close()
        img = Image.open(tmp.name)

        def do_print(p):
            p.image(img)
            p.text("\n" * 3)
            p.cut()

        with_retry(do_print)
        return jsonify({"status": "ok"})
    finally:
        os.unlink(tmp.name)


@app.route("/print/batch", methods=["POST"])
def print_batch():
    """Print multiple images in sequence with a single cut at the end."""
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded"}), 400

    tmp_paths = []
    try:
        for f in files:
            if not f.filename:
                continue
            suffix = os.path.splitext(f.filename)[1] or ".png"
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            f.save(tmp)
            tmp.close()
            tmp_paths.append(tmp.name)

        if not tmp_paths:
            return jsonify({"error": "No valid files"}), 400

        def do_print(p):
            for path in tmp_paths:
                img = Image.open(path)
                p.image(img)
                p.text("\n\n")
            p.text("\n")
            p.cut()

        with_retry(do_print)
        return jsonify({"status": "ok", "printed": len(tmp_paths)})
    finally:
        for path in tmp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


@app.route("/health", methods=["GET"])
def health():
    result = {
        "status": "running",
        "dummy": _dummy,
        "uptime_seconds": round(time.time() - _server_start_time, 1) if _server_start_time else 0,
        "last_print": _last_print_time,
    }
    try:
        result["printer"] = "connected" if _printer.is_online() else "disconnected"
    except NotImplementedError:
        result["printer"] = "dummy"
    except Exception:
        result["printer"] = "unknown"
    return jsonify(result)


@app.errorhandler(Exception)
def handle_error(e):
    """Return JSON error responses instead of HTML."""
    code = getattr(e, "code", 500)
    logger.error("Request error: %s", e)
    return jsonify({"error": str(e)}), code


def main():
    global _config, _printer, _dummy, _server_start_time

    parser = argparse.ArgumentParser(description="Minimal POS print server")
    parser.add_argument("--dummy", action="store_true", help="Run without real printer")
    parser.add_argument("--config", default="config.yaml", help="Config file path")
    args = parser.parse_args()

    _config = load_config(args.config)
    validate_config(_config)
    _server_start_time = time.time()
    _dummy = args.dummy

    if _dummy:
        print("[POS] Running in DUMMY mode — no printer connected")

    _printer = connect(_config, dummy=_dummy)
    print(f"[POS] Printer {'(dummy)' if _dummy else 'connected'}")

    srv = _config.get("server", {})
    host = srv.get("host", "0.0.0.0")
    port = srv.get("port", 9100)

    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))

    print(f"[POS] Listening on http://{host}:{port}")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
