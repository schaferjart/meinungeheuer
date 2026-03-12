"""
HTTP print server — receives JSON print jobs and sends them to the thermal printer.

Usage:
    python print_server.py                  # start with real printer
    python print_server.py --dummy          # start in test mode (no printer needed)

Send jobs via HTTP POST:

    curl -X POST http://localhost:9100/print/receipt \
        -H "Content-Type: application/json" \
        -d '{"items":[{"name":"Coffee","qty":2,"price":5.0}]}'

    curl -X POST http://localhost:9100/print/message \
        -H "Content-Type: application/json" \
        -d '{"text":"Hello world!","title":"NOTICE"}'

    curl -X POST http://localhost:9100/print/label \
        -H "Content-Type: application/json" \
        -d '{"heading":"FRAGILE","lines":["Handle with care","This side up"]}'

    curl -X POST http://localhost:9100/print/list \
        -H "Content-Type: application/json" \
        -d '{"title":"Price List","rows":[["Coffee","3.50"],["Tea","2.80"]]}'

    curl -X POST http://localhost:9100/print/dictionary \
        -H "Content-Type: application/json" \
        -d '{"word":"Ephemeral","definition":"Lasting for a very short time.","citations":["All fame is ephemeral."]}'
"""

import io
import os
import sys
import time
import uuid
import hmac
import signal
import socket
import atexit
import argparse
import tempfile
import threading
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from zeroconf import ServiceInfo, Zeroconf
from printer_core import load_config, connect, Formatter, validate_config
import templates
from image_printer import process_image
try:
    from portrait_pipeline import (
        run_pipeline, transform_to_statue,
        process_portrait_stages_ab, print_portrait_duration,
    )
    _has_portrait = True
except ImportError:
    _has_portrait = False

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB

# Globals set at startup
_config = None
_printer = None
_dummy = False
_zeroconf = None
_print_lock = threading.Lock()
_server_start_time = None
_last_print_time = None
_save_dir = None          # When set, save all portrait intermediates here
_skip_transform = False   # When True, skip style transfer (use raw image)

_PUBLIC_ENDPOINTS = frozenset({"health", "index", "static"})

# ── Portrait job tracking (two-phase: upload → finalize) ─────────────
# Jobs hold the style-transferred image between /portrait/capture and
# /portrait/finalize. The background thread runs stages A+B; finalize
# applies the duration-based crop and prints.
_portrait_jobs = {}   # job_id → { event, status, image, error, created_at }
_jobs_lock = threading.Lock()
_JOB_TTL_SECONDS = 1800  # auto-cleanup orphaned jobs after 30 min

logger = logging.getLogger(__name__)


def get_formatter():
    global _printer
    width = _config.get("printer", {}).get("paper_width", 48)
    return Formatter(_printer, width)


def reconnect():
    """Reconnect to the printer after a failed print."""
    global _printer
    try:
        _printer.close()
    except Exception:
        pass
    time.sleep(0.5)
    _printer = connect(_config, dummy=_dummy)
    width = _config.get("printer", {}).get("paper_width", 48)
    return Formatter(_printer, width)


def _require_fields(data, *fields):
    """Validate JSON body has required fields.
    Returns (data, None) on success, or (None, (error_msg, field_name)) on failure."""
    if data is None:
        return None, ("Invalid or missing JSON body", None)
    if not isinstance(data, dict):
        return None, ("Request body must be a JSON object", None)
    for field in fields:
        if field not in data:
            return None, (f"Missing required field '{field}'", field)
    return data, None


def error_response(message, field=None, status=400):
    """Return a consistent JSON error response."""
    body = {"error": message}
    if field is not None:
        body["field"] = field
    return jsonify(body), status


@app.before_request
def check_api_key():
    """Reject requests without a valid API key when api_key is configured."""
    api_key = _config.get("server", {}).get("api_key")
    if not api_key:
        return
    if request.endpoint in _PUBLIC_ENDPOINTS:
        return
    provided = request.headers.get("X-Print-Key", "")
    if not hmac.compare_digest(provided, api_key):
        return error_response("Invalid or missing API key", status=401)


def with_retry(fn):
    """Run a print function with mutex lock and reconnect on failure."""
    global _last_print_time
    with _print_lock:
        try:
            fmt = get_formatter()
            fmt.p.hw("INIT")  # ESC@ reset printer state
            fn(fmt)
            _last_print_time = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            logger.warning("Print failed (%s), reconnecting...", e)
            try:
                fmt = reconnect()
                fmt.p.hw("INIT")
                fn(fmt)
                _last_print_time = datetime.now(timezone.utc).isoformat()
            except Exception as e2:
                logger.error("Retry also failed: %s", e2)
                raise


@app.route("/print/receipt", methods=["POST"])
def print_receipt():
    data = request.get_json(force=True, silent=True)
    data, err = _require_fields(data, "items")
    if err:
        return error_response(err[0], err[1])
    with_retry(lambda fmt: templates.receipt(fmt, data, _config))
    return jsonify({"status": "ok", "template": "receipt"})


@app.route("/print/message", methods=["POST"])
def print_message():
    data = request.get_json(force=True, silent=True)
    data, err = _require_fields(data, "text")
    if err:
        return error_response(err[0], err[1])
    with_retry(lambda fmt: templates.simple_message(fmt, data["text"], data.get("title")))
    return jsonify({"status": "ok", "template": "message"})


@app.route("/print/label", methods=["POST"])
def print_label():
    data = request.get_json(force=True, silent=True)
    data, err = _require_fields(data, "heading")
    if err:
        return error_response(err[0], err[1])
    with_retry(lambda fmt: templates.label(fmt, data["heading"], data.get("lines", [])))
    return jsonify({"status": "ok", "template": "label"})


@app.route("/print/list", methods=["POST"])
def print_list():
    data = request.get_json(force=True, silent=True)
    data, err = _require_fields(data, "title", "rows")
    if err:
        return error_response(err[0], err[1])
    rows = [tuple(r) for r in data["rows"]]
    with_retry(lambda fmt: templates.two_column_list(fmt, data["title"], rows))
    return jsonify({"status": "ok", "template": "list"})


@app.route("/print/dictionary", methods=["POST"])
def print_dictionary():
    data = request.get_json(force=True, silent=True)
    data, err = _require_fields(data, "word", "definition")
    if err:
        return error_response(err[0], err[1])
    with_retry(lambda fmt: templates.dictionary_entry(fmt, data, _config))
    return jsonify({"status": "ok", "template": "dictionary"})


@app.route("/print/image", methods=["POST"])
def print_image():
    """
    Print an image with halftone/dithering.

    Accepts multipart/form-data with:
        file: image file (required)
        mode: halftone | floyd | bayer (optional)
        dot_size: int (optional)
        contrast: float (optional)
        brightness: float (optional)
        sharpness: float (optional)
        blur: float (optional)
    """
    if "file" not in request.files:
        return error_response("No file uploaded", "file")
    uploaded = request.files["file"]
    if not uploaded.filename:
        return error_response("Empty filename", "file")

    suffix = os.path.splitext(uploaded.filename)[1] or ".png"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        uploaded.save(tmp)
        tmp.close()

        mode = request.form.get("mode")
        dot_size = request.form.get("dot_size")
        contrast = request.form.get("contrast")
        brightness = request.form.get("brightness")
        sharpness = request.form.get("sharpness")
        blur = request.form.get("blur")

        img = process_image(
            tmp.name, _config,
            mode=mode,
            dot_size=int(dot_size) if dot_size else None,
            contrast=float(contrast) if contrast else None,
            brightness=float(brightness) if brightness else None,
            sharpness=float(sharpness) if sharpness else None,
            blur=float(blur) if blur else None,
        )

        mode_name = {"floyd": "FLOYD-STEINBERG", "halftone": "HALFTONE", "bayer": "BAYER 8x8"}.get(mode or "floyd", mode or "floyd")
        blur_val = blur
        label = f"{mode_name} + BLUR {blur_val}" if blur_val else mode_name

        def do_print(fmt):
            fmt.font_b_text(label)
            fmt.blank()
            fmt.p.image(img)
            fmt.feed()
            fmt.cut()

        with_retry(do_print)

        return jsonify({"status": "ok", "template": "image", "mode": mode or "floyd"})
    finally:
        os.unlink(tmp.name)


@app.route("/print/markdown", methods=["POST"])
def print_markdown():
    data = request.get_json(force=True, silent=True)
    data, err = _require_fields(data, "text")
    if err:
        return error_response(err[0], err[1])
    with_retry(lambda fmt: templates.markdown(fmt, data["text"], _config, show_date=data.get("show_date", True), style=data.get("style", "dictionary")))
    return jsonify({"status": "ok", "template": "markdown"})


def _cleanup_stale_jobs():
    """Remove portrait jobs older than TTL (called periodically)."""
    now = time.time()
    with _jobs_lock:
        stale = [jid for jid, j in _portrait_jobs.items()
                 if now - j.get("created_at", 0) > _JOB_TTL_SECONDS]
        for jid in stale:
            del _portrait_jobs[jid]
            logger.info("Cleaned up stale portrait job %s", jid)


@app.route("/portrait/capture", methods=["POST"])
def portrait_capture():
    """
    Phase 1: Receive photo, start style transfer in background.
    Returns immediately with a job_id. Call /portrait/finalize later
    with the job_id and conversation duration to crop and print.

    Accepts multipart/form-data:
        file: one or more image files (required)
        skip_selection: "1" or "true" to use first image

    Returns: { status: "processing", job_id: "...", photos_received: N }
    """
    if not _has_portrait:
        return jsonify({"error": "Portrait pipeline unavailable — install numpy and mediapipe"}), 501

    files = request.files.getlist("file")
    if not files:
        return error_response("No files uploaded", "file")

    tmp_paths = []
    for uploaded in files:
        if not uploaded.filename:
            continue
        suffix = os.path.splitext(uploaded.filename)[1] or ".jpg"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        uploaded.save(tmp)
        tmp.close()
        tmp_paths.append(tmp.name)

    if not tmp_paths:
        return error_response("No valid files", "file")

    skip_selection = request.form.get("skip_selection", "").lower() in ("1", "true")

    # Cleanup stale jobs before creating a new one
    _cleanup_stale_jobs()

    job_id = str(uuid.uuid4())
    event = threading.Event()

    # Per-job save directory (when global _save_dir is set)
    job_save_dir = None
    if _save_dir:
        job_save_dir = os.path.join(_save_dir, job_id)
        os.makedirs(job_save_dir, exist_ok=True)

    with _jobs_lock:
        _portrait_jobs[job_id] = {
            "event": event,
            "status": "processing",
            "image": None,
            "error": None,
            "created_at": time.time(),
            "save_dir": job_save_dir,
        }

    def worker():
        try:
            # Save raw capture
            if job_save_dir:
                import shutil
                shutil.copy2(tmp_paths[0], os.path.join(job_save_dir, "01_raw_capture.jpg"))

            _, image = process_portrait_stages_ab(
                tmp_paths, _config,
                skip_selection=skip_selection,
                skip_transform=_skip_transform,
            )

            # Save style-transferred image
            if job_save_dir:
                image.save(os.path.join(job_save_dir, "02_transformed.png"))

            with _jobs_lock:
                _portrait_jobs[job_id]["image"] = image
                _portrait_jobs[job_id]["status"] = "done"
            logger.info("Portrait job %s: transform complete (%dx%d)",
                        job_id, image.size[0], image.size[1])
        except Exception as e:
            logger.error("Portrait job %s failed: %s", job_id, e)
            with _jobs_lock:
                if job_id in _portrait_jobs:
                    _portrait_jobs[job_id]["error"] = str(e)
                    _portrait_jobs[job_id]["status"] = "error"
        finally:
            event.set()
            for p in tmp_paths:
                try:
                    os.unlink(p)
                except OSError:
                    pass

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    logger.info("Portrait job %s: started (%d photos)", job_id, len(tmp_paths))

    return jsonify({
        "status": "processing",
        "job_id": job_id,
        "photos_received": len(tmp_paths),
    })


@app.route("/portrait/finalize", methods=["POST"])
def portrait_finalize():
    """
    Phase 2: Apply duration-based width crop and print.

    Accepts JSON:
        job_id: string (required) — from /portrait/capture response
        duration_seconds: number (required) — conversation length

    The longer the conversation, the narrower the crop (more precise).
    Height is always full. See portrait.crop config for thresholds.
    """
    if not _has_portrait:
        return jsonify({"error": "Portrait pipeline unavailable"}), 501

    data = request.get_json(force=True, silent=True)
    if not data or "job_id" not in data:
        return error_response("Missing job_id", "job_id")

    job_id = data["job_id"]
    duration_seconds = float(data.get("duration_seconds", 0))

    with _jobs_lock:
        job = _portrait_jobs.get(job_id)

    if not job:
        return error_response(f"Unknown or expired job: {job_id}", "job_id", 404)

    # Wait for style transfer to complete (up to 5 min)
    if not job["event"].wait(timeout=300):
        with _jobs_lock:
            _portrait_jobs.pop(job_id, None)
        return error_response("Style transfer timed out", status=504)

    if job["status"] == "error":
        err = job.get("error", "unknown")
        with _jobs_lock:
            _portrait_jobs.pop(job_id, None)
        return error_response(f"Transform failed: {err}", status=500)

    image = job["image"]
    job_save_dir = job.get("save_dir")

    try:
        width_pct = print_portrait_duration(
            image, duration_seconds, _config, _printer,
            dummy=_dummy, save_dir=job_save_dir,
        )

        # Write metadata for the gallery
        if job_save_dir:
            meta_path = os.path.join(job_save_dir, "meta.txt")
            with open(meta_path, "w") as f:
                f.write(f"duration_seconds={duration_seconds}\n")
                f.write(f"width_percent={width_pct:.1f}\n")
                f.write(f"blur={_config.get('portrait', {}).get('blur', 10)}\n")
                f.write(f"dither_mode={_config.get('portrait', {}).get('dither_mode', 'bayer')}\n")

        return jsonify({
            "status": "ok",
            "duration_seconds": duration_seconds,
            "width_percent": round(width_pct, 1),
            "save_dir": job_save_dir,
        })
    except Exception as e:
        logger.error("Portrait finalize failed: %s", e)
        return error_response(f"Print failed: {e}", status=500)
    finally:
        with _jobs_lock:
            _portrait_jobs.pop(job_id, None)


@app.route("/portrait/transform", methods=["POST"])
def portrait_transform():
    if not _has_portrait:
        return jsonify({"error": "Portrait pipeline unavailable — install numpy and mediapipe"}), 501
    """
    Transform a single image to Roman statue aesthetic (no printing).
    Returns the transformed image as PNG.

    Accepts multipart/form-data with a 'file' field.
    """
    if "file" not in request.files:
        return error_response("No file uploaded", "file")
    uploaded = request.files["file"]
    if not uploaded.filename:
        return error_response("Empty filename", "file")

    suffix = os.path.splitext(uploaded.filename)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        uploaded.save(tmp)
        tmp.close()

        img = transform_to_statue(tmp.name, _config)

        # Return as PNG
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        from flask import send_file
        return send_file(buf, mimetype="image/png", download_name="portrait_statue.png")
    finally:
        os.unlink(tmp.name)


@app.route("/health", methods=["GET"])
def health():
    now = time.time()
    result = {
        "status": "running",
        "dummy": _dummy,
        "uptime_seconds": round(now - _server_start_time, 1) if _server_start_time else 0,
        "last_print": _last_print_time,
    }
    try:
        result["printer"] = "connected" if _printer.is_online() else "disconnected"
    except NotImplementedError:
        result["printer"] = "dummy"
    except Exception:
        result["printer"] = "disconnected"
    return jsonify(result)


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.errorhandler(Exception)
def handle_error(e):
    """Return JSON error responses instead of HTML."""
    code = getattr(e, "code", 500)
    logger.error("Request error: %s", e)
    return jsonify({"error": str(e)}), code


@app.route("/gallery")
def gallery():
    """Browse all saved portrait pipeline stages."""
    if not _save_dir or not os.path.isdir(_save_dir):
        return "<h2>No save_dir configured. Start server with --save-dir test_output</h2>", 404

    jobs = []
    for name in sorted(os.listdir(_save_dir), reverse=True):
        job_dir = os.path.join(_save_dir, name)
        if not os.path.isdir(job_dir):
            continue
        images = sorted(f for f in os.listdir(job_dir)
                        if f.endswith((".png", ".jpg", ".jpeg")))
        meta = {}
        meta_path = os.path.join(job_dir, "meta.txt")
        if os.path.exists(meta_path):
            for line in open(meta_path):
                if "=" in line:
                    k, v = line.strip().split("=", 1)
                    meta[k] = v
        jobs.append({"id": name, "images": images, "meta": meta})

    html = """<!DOCTYPE html><html><head>
    <title>Portrait Pipeline Gallery</title>
    <style>
      body { font-family: monospace; background: #111; color: #eee; padding: 20px; }
      h1 { color: #fff; }
      .job { margin-bottom: 40px; border: 1px solid #333; padding: 20px; }
      .job h2 { margin-top: 0; font-size: 14px; color: #888; }
      .meta { color: #0f0; margin-bottom: 10px; }
      .stages { display: flex; gap: 10px; overflow-x: auto; }
      .stage { text-align: center; }
      .stage img { max-height: 400px; border: 1px solid #333; }
      .stage p { font-size: 11px; color: #888; margin: 4px 0; }
    </style></head><body>
    <h1>Portrait Pipeline Gallery</h1>"""

    if not jobs:
        html += "<p>No jobs yet. Send an image to /portrait/capture</p>"
    for job in jobs:
        meta_str = " | ".join(f"{k}={v}" for k, v in job["meta"].items())
        html += f'<div class="job"><h2>Job: {job["id"]}</h2>'
        if meta_str:
            html += f'<div class="meta">{meta_str}</div>'
        html += '<div class="stages">'
        for img in job["images"]:
            html += f'''<div class="stage">
                <img src="/gallery/{job["id"]}/{img}" />
                <p>{img}</p></div>'''
        html += "</div></div>"

    html += "</body></html>"
    return html


@app.route("/gallery/<job_id>/<filename>")
def gallery_image(job_id, filename):
    """Serve a saved pipeline image."""
    if not _save_dir:
        return "No save_dir", 404
    from flask import send_from_directory
    job_dir = os.path.join(_save_dir, job_id)
    return send_from_directory(job_dir, filename)


def register_mdns(port):
    """Register the print server as a Bonjour/mDNS service for iPad discovery."""
    global _zeroconf
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        info = ServiceInfo(
            "_http._tcp.local.",
            f"POS Thermal Printer._http._tcp.local.",
            addresses=[socket.inet_aton(local_ip)],
            port=port,
            properties={"path": "/", "type": "thermal-printer"},
            server=f"{hostname}.local.",
        )
        _zeroconf = Zeroconf()
        _zeroconf.register_service(info, allow_name_change=True)
        print(f"[INFO] Bonjour: registered '{info.name}' on {local_ip}:{port}")

        def cleanup():
            print("[INFO] Bonjour: unregistering service")
            _zeroconf.unregister_service(info)
            _zeroconf.close()

        atexit.register(cleanup)
    except Exception as e:
        print(f"[WARN] Bonjour registration failed: {e} — server will still work via IP")


def graceful_shutdown(signum, frame):
    """Clean up mDNS and printer connection on SIGTERM/SIGINT."""
    logger.info("Received signal %s, shutting down...", signum)
    if _zeroconf:
        try:
            _zeroconf.unregister_all_services()
            _zeroconf.close()
            logger.info("mDNS deregistered")
        except Exception:
            pass
    if _printer:
        try:
            _printer.close()
            logger.info("Printer connection closed")
        except Exception:
            pass
    sys.exit(0)


def main():
    global _config, _printer, _dummy, _server_start_time, _save_dir, _skip_transform

    parser = argparse.ArgumentParser(description="Thermal printer HTTP server")
    parser.add_argument("--dummy", action="store_true", help="Run without real printer")
    parser.add_argument("--config", default="config.yaml", help="Config file path")
    parser.add_argument("--save-dir", default=None,
                        help="Save all portrait pipeline intermediates to this directory")
    parser.add_argument("--skip-transform", action="store_true",
                        help="Skip n8n style transfer (use raw image)")
    args = parser.parse_args()

    _save_dir = args.save_dir
    _skip_transform = args.skip_transform
    if _save_dir:
        os.makedirs(_save_dir, exist_ok=True)
        print(f"[INFO] Saving portrait intermediates to: {os.path.abspath(_save_dir)}")
    if _skip_transform:
        print("[INFO] Style transfer SKIPPED (--skip-transform)")

    _config = load_config(args.config)
    validate_config(_config)  # fail fast if config incomplete
    _server_start_time = time.time()
    _dummy = args.dummy

    if _dummy:
        print("[INFO] Running in DUMMY mode — no printer connected")
    else:
        print("[INFO] Connecting to printer...")

    _printer = connect(_config, dummy=_dummy)
    print("[INFO] Printer ready")

    srv = _config.get("server", {})
    host = srv.get("host", "0.0.0.0")
    port = srv.get("port", 9100)

    register_mdns(port)

    signal.signal(signal.SIGTERM, graceful_shutdown)
    signal.signal(signal.SIGINT, graceful_shutdown)

    print(f"[INFO] Server listening on http://{host}:{port}")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
