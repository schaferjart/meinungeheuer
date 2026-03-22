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
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from supabase_config import get_render_config, get_active_template, get_paper_px

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")

app = FastAPI(title="MeinUngeheuer Print Renderer")

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


@app.post("/render/dictionary", dependencies=[Depends(verify_api_key)])
def render_dictionary(req: DictionaryRequest):
    """Render a dictionary card as a PNG image and return it directly."""
    from templates import render_dictionary_image

    data = {"word": req.word, "definition": req.definition, "citations": req.citations}
    img = render_dictionary_image(data, get_render_config(_CONFIG_PATH), style=req.template)
    return _image_response(img)


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


# ── Health ────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "print-renderer"}
