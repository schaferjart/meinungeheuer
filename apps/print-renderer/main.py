"""
Print rendering API — renders all print content as images.

Endpoints:
  POST /render/dictionary  — renders dictionary card, returns PNG
  POST /render/markdown    — renders markdown text, returns PNG
  POST /process/portrait   — full portrait pipeline, uploads to Storage, inserts print_queue
  GET  /health
"""
import io
import os
import hmac
import uuid
import base64
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from supabase_config import get_render_config, get_active_template, get_paper_px
from helpers import open_image
from dithering import _prepare, _apply_blur, dither_image

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")

app = FastAPI(title="MeinUngeheuer Print Renderer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RENDER_API_KEY = os.environ.get("RENDER_API_KEY", "")


def verify_api_key(x_api_key: str = Header(default="")):
    """Reject requests without a valid API key (when configured)."""
    if RENDER_API_KEY and not hmac.compare_digest(x_api_key, RENDER_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def _image_response(img):
    """Return a PIL Image as a PNG streaming response."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


# ── Dictionary rendering ─────────────────────────────────

class DictionaryRequest(BaseModel):
    word: str
    definition: str
    citations: list[str] = []
    template: str = "dictionary"
    config_override: dict | None = None  # Merged onto template config for previews
    definition_id: str | None = None  # UUID for QR code linking to archive page


@app.post("/render/dictionary", dependencies=[Depends(verify_api_key)])
def render_dictionary(req: DictionaryRequest):
    """Render a dictionary card as a PNG image and return it directly."""
    from templates import render_dictionary_image

    data = {"word": req.word, "definition": req.definition, "citations": req.citations, "definition_id": req.definition_id}
    config = get_render_config(_CONFIG_PATH)
    if req.config_override:
        template_key = req.template
        if template_key in config:
            merged = {**config[template_key], **req.config_override}
            config = {**config, **{template_key: merged}}
    img = render_dictionary_image(data, config, style=req.template)
    return _image_response(img)


# ── Dither rendering ──────────────────────────────────────


@app.post("/render/dither", dependencies=[Depends(verify_api_key)])
def render_dither(
    file: UploadFile = File(...),
    dither_mode: str = Form("floyd"),
    contrast: float = Form(1.3),
    brightness: float = Form(1.0),
    sharpness: float = Form(1.2),
    blur: float = Form(0),
    paper_px: int = Form(576),
):
    """Dither an uploaded image and return the result as PNG."""
    image_bytes = file.file.read()
    img = open_image(image_bytes)

    grey = _prepare(img, paper_px, contrast, brightness, sharpness)
    if blur > 0:
        grey = _apply_blur(grey, blur)
    dithered = dither_image(grey, dither_mode)

    return _image_response(dithered)


# ── Portrait preview ──────────────────────────────────────


@app.post("/render/portrait-preview", dependencies=[Depends(verify_api_key)])
def render_portrait_preview(
    file: UploadFile = File(...),
    dither_mode: str = Form("bayer"),
    blur_radius: float = Form(10),
    contrast: float = Form(1.3),
    brightness: float = Form(1.0),
    sharpness: float = Form(1.2),
):
    """Dither a portrait image and return base64 PNG crops.
    Uses face detection if mediapipe is available, falls back to simple crops.
    No style transfer, no Storage upload, no print_queue insert.
    """
    image_bytes = file.file.read()
    img = open_image(image_bytes)
    paper_px = get_paper_px(get_render_config(_CONFIG_PATH))

    # Try face detection for smart crops, fall back to simple divisions
    crops_to_render = []
    try:
        from pipeline import detect_face_landmarks, compute_zoom_crops
        landmarks = detect_face_landmarks(img)
        if landmarks:
            zooms = compute_zoom_crops(img, landmarks)
        else:
            # No face found — simple quadrant crops
            w, h = img.size
            zooms = [
                {"name": "full", "box": (0, 0, w, h)},
                {"name": "top", "box": (0, 0, w, h // 2)},
                {"name": "center", "box": (w // 4, h // 4, 3 * w // 4, 3 * h // 4)},
                {"name": "bottom", "box": (0, h // 2, w, h)},
            ]
        for z in zooms:
            cropped = img.crop(z["box"])
            crops_to_render.append(cropped)
    except Exception:
        # Mediapipe not available — just use the full image
        crops_to_render.append(img)

    # Dither each crop
    results = []
    for cropped in crops_to_render:
        grey = _prepare(cropped, paper_px, contrast, brightness, sharpness)
        if blur_radius > 0:
            grey = _apply_blur(grey, blur_radius)
        dithered = dither_image(grey, dither_mode)
        buf = io.BytesIO()
        dithered.save(buf, format="PNG")
        results.append(base64.b64encode(buf.getvalue()).decode())

    return {"crops": results, "count": len(results)}


# ── Markdown rendering ────────────────────────────────────

class MarkdownRequest(BaseModel):
    text: str
    style: str = "dictionary"
    show_date: bool = True


@app.post("/render/markdown", dependencies=[Depends(verify_api_key)])
def render_md(req: MarkdownRequest):
    """Render markdown text as a PNG image and return it directly."""
    from md_renderer import render_markdown

    img = render_markdown(req.text, get_render_config(_CONFIG_PATH), req.show_date, req.style)
    return _image_response(img)


# ── Portrait processing ──────────────────────────────────

@app.post("/process/portrait", dependencies=[Depends(verify_api_key)])
async def process_portrait_endpoint(
    file: UploadFile = File(...),
    session_id: str | None = None,
    skip_transform: bool = False,
):
    """
    Full portrait pipeline: style transfer -> face detection -> crop -> dither.
    Uploads print-ready images to Supabase Storage, inserts into print_queue.
    """
    from pipeline import transform_to_statue_bytes, process_portrait

    # Lazy-init Supabase (only needed for portraits)
    supabase_client = _get_supabase()
    if not supabase_client:
        raise HTTPException(500, "Supabase not configured")

    image_bytes = await file.read()

    _render_cfg = get_render_config(_CONFIG_PATH)
    portrait_cfg = _render_cfg.get("portrait", {})
    config = {
        "n8n_webhook_url": os.environ.get("N8N_WEBHOOK_URL") or portrait_cfg.get("n8n_webhook_url"),
        "openrouter_api_key_env": portrait_cfg.get("openrouter_api_key_env", "OPENROUTER_API_KEY"),
        "style_prompt": portrait_cfg.get("style_prompt", "Transform this portrait into a monochrome sculpture."),
        "paper_px": _render_cfg.get("halftone", {}).get("paper_px", 576),
        "contrast": _render_cfg.get("halftone", {}).get("contrast", 1.3),
        "brightness": _render_cfg.get("halftone", {}).get("brightness", 1.0),
        "sharpness": _render_cfg.get("halftone", {}).get("sharpness", 1.2),
        "blur": portrait_cfg.get("blur", 10),
        "dither_mode": portrait_cfg.get("dither_mode", "bayer"),
    }

    # Stage B: Style transfer (optional)
    if not skip_transform and config.get("n8n_webhook_url"):
        image_bytes = transform_to_statue_bytes(image_bytes, config)

    # Stage C: Face detection + crops + dithering
    results = process_portrait(image_bytes, config)

    # Upload to Supabase Storage
    job_id = str(uuid.uuid4())
    image_urls = []

    for name, img in results:
        buf = io.BytesIO()
        img.save(buf, format="PNG")

        path = f"portraits/{job_id}/{name}.png"
        supabase_client.storage.from_("prints").upload(
            path, buf.getvalue(),
            file_options={"content-type": "image/png"}
        )

        url = supabase_client.storage.from_("prints").get_public_url(path)
        image_urls.append({"name": name, "url": url})

    # Insert print job
    payload = {
        "type": "portrait",
        "image_urls": image_urls,
        "job_id": job_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    supabase_client.table("print_queue").insert({
        "session_id": session_id,
        "payload": payload,
        "status": "pending",
    }).execute()

    return {
        "status": "ok",
        "job_id": job_id,
        "zoom_levels": len(results),
        "image_urls": image_urls,
    }


# ── Supabase client (lazy init) ──────────────────────────

_supabase = None


def _get_supabase():
    global _supabase
    if _supabase is not None:
        return _supabase
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if url and key:
        from supabase import create_client
        _supabase = create_client(url, key)
    return _supabase


# ── Slice rendering ──────────────────────────────────────

@app.post("/render/slice", dependencies=[Depends(verify_api_key)])
def render_slice(
    file: UploadFile = File(...),
    direction: str = Form("vertical"),
    count: int = Form(10),
    labels: str = Form("[]"),
    label_position: str = Form("above"),
    dither_mode: str | None = Form(None),
    paper_px: int | None = Form(None),
    contrast: float | None = Form(None),
    brightness: float | None = Form(None),
    sharpness: float | None = Form(None),
    blur: float | None = Form(None),
):
    """Slice an image into strips, optionally dither, add labels, return as base64 PNGs."""
    from PIL import Image, ImageDraw, ImageFont

    image_bytes = file.file.read()
    img = open_image(image_bytes)
    w, h = img.size

    config = get_render_config(_CONFIG_PATH)
    _paper_px = paper_px or get_paper_px(config)
    _dither_mode = dither_mode or config.get("halftone", {}).get("mode", "floyd")
    halftone_cfg = config.get("halftone", {})

    label_list = json.loads(labels)

    # Slice
    strips = []
    if direction == "vertical":
        strip_w = w // count
        for i in range(count):
            x0 = i * strip_w
            x1 = w if i == count - 1 else (i + 1) * strip_w
            strip = img.crop((x0, 0, x1, h))
            ratio = _paper_px / strip.size[0]
            strip = strip.resize((_paper_px, int(strip.size[1] * ratio)), Image.LANCZOS)
            strips.append(strip)
    else:
        ratio = _paper_px / w
        img = img.resize((_paper_px, int(h * ratio)), Image.LANCZOS)
        w, h = img.size
        strip_h = h // count
        for i in range(count):
            y0 = i * strip_h
            y1 = h if i == count - 1 else (i + 1) * strip_h
            strips.append(img.crop((0, y0, w, y1)))

    # Dither + label each strip (request params override config)
    _contrast = contrast if contrast is not None else halftone_cfg.get("contrast", 1.3)
    _brightness = brightness if brightness is not None else halftone_cfg.get("brightness", 1.0)
    _sharpness = sharpness if sharpness is not None else halftone_cfg.get("sharpness", 1.2)
    _blur = blur if blur is not None else halftone_cfg.get("blur", 0)

    results = []
    for i, strip in enumerate(strips):

        grey = _prepare(strip, _paper_px, _contrast, _brightness, _sharpness)
        if _blur:
            grey = _apply_blur(grey, _blur)
        dithered = dither_image(grey, _dither_mode)

        # Convert to RGB for labeling
        labeled = dithered.convert("RGB")

        # Add label if provided
        label = label_list[i] if i < len(label_list) else ""
        if label:
            draw = ImageDraw.Draw(labeled)
            try:
                font = ImageFont.truetype("fonts/DejaVuSans.ttf", 16)
            except Exception:
                font = ImageFont.load_default()
            bbox = draw.textbbox((0, 0), label, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            x = (_paper_px - tw) // 2
            if label_position == "above":
                # Prepend label area
                new_img = Image.new("RGB", (_paper_px, labeled.size[1] + th + 10), (255, 255, 255))
                draw2 = ImageDraw.Draw(new_img)
                draw2.text((x, 2), label, fill=(0, 0, 0), font=font)
                new_img.paste(labeled, (0, th + 10))
                labeled = new_img
            else:
                # Append label area
                new_img = Image.new("RGB", (_paper_px, labeled.size[1] + th + 10), (255, 255, 255))
                new_img.paste(labeled, (0, 0))
                draw2 = ImageDraw.Draw(new_img)
                draw2.text((x, labeled.size[1] + 2), label, fill=(0, 0, 0), font=font)
                labeled = new_img

        # Encode as base64 PNG
        buf = io.BytesIO()
        labeled.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        results.append({
            "name": f"slice_{i}",
            "label": label,
            "image_b64": b64,
        })

    return {"slices": results, "count": len(results), "direction": direction}


# ── Health ────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "print-renderer"}
