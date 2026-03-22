# Print Rendering → Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ALL rendering (portrait processing, dictionary card layout, markdown) off the Raspberry Pi into a cloud Python service. The Pi becomes a pure image-to-ESC/POS print spooler — ~50 lines of code, zero ML or font dependencies.

**Architecture:** A new FastAPI service (`apps/print-renderer/`) handles all image rendering: portrait pipeline (mediapipe + dithering) AND text card rendering (dictionary/markdown with custom fonts). The printer-bridge on the Pi becomes a smart relay: it checks the payload type in `print_queue`, calls the render service for text payloads, downloads pre-rendered images for portrait payloads, and forwards everything to the pos-server as ready-to-print images. The tablet and backend keep inserting into `print_queue` as before — zero upstream changes for text cards.

**Tech Stack:** FastAPI, mediapipe, Pillow, custom fonts, Supabase Storage, existing Supabase Realtime flow

---

## Architecture Overview

### Current Flow

```
TEXT CARDS:
  Tablet/Backend → INSERT JSON into print_queue
  → Printer Bridge (Pi) picks up via Realtime
  → POST JSON to POS Server /print/dictionary
  → POS Server renders text as image using PIL + fonts
  → ESC/POS print

PORTRAITS:
  Tablet → POST photo directly to POS Server (Pi)
  → POS Server calls OpenRouter + n8n (remote)
  → POS Server runs mediapipe (BROKEN on ARM)
  → POS Server crops + dithers + prints
```

### Target Flow

```
TEXT CARDS (zero upstream changes):
  Tablet/Backend → INSERT JSON into print_queue (same as today)
  → Printer Bridge (Pi) picks up via Realtime
  → Bridge detects text payload → POST JSON to Print Renderer (cloud)
  → Print Renderer renders image with PIL + fonts → returns PNG
  → Bridge sends PNG to POS Server /print
  → POS Server prints image. That's it.

PORTRAITS:
  Tablet → POST photo to Print Renderer (cloud)
  → Print Renderer: style transfer + mediapipe + crop + dither
  → Upload print-ready PNGs to Supabase Storage
  → INSERT image URLs into print_queue
  → Printer Bridge picks up → downloads images → POS Server /print
```

### What Runs Where

```
☁️  CLOUD                             🍓 PI
─────────────────────                  ────────────────────────
Print Renderer (FastAPI)               Printer Bridge (Node.js)
  - mediapipe face detection             - Supabase Realtime sub
  - portrait zoom crops                  - Routes by payload type
  - 3 dithering algorithms               - Calls render-api for text
  - dictionary card layout               - Downloads images for portraits
  - markdown rendering                   - Forwards images to POS server
  - custom fonts (Burra, Acidic, etc.)
                                       POS Server (Python)
Supabase (managed)                       - receive image → print → cut
Backend (Hono, unchanged)                - ~50 lines of code
                                         - deps: flask, python-escpos, Pillow
📱 Tablet (unchanged for text cards)
  - Portraits: calls print-renderer
```

---

## File Structure

### New: `apps/print-renderer/`

| File | Responsibility |
|------|---------------|
| `main.py` | FastAPI app, endpoints: `/render/dictionary`, `/render/markdown`, `/process/portrait`, `/health` |
| `pipeline.py` | Portrait pipeline: mediapipe face detection, zoom crops, style transfer. Adapted from `pos-server/portrait_pipeline.py`, no OpenCV fallback. |
| `dithering.py` | 3 dithering modes (bayer, floyd, halftone) + `_prepare`, `_apply_blur`. Copied from `pos-server/image_printer.py`. |
| `templates.py` | Dictionary card image rendering. Copied from `pos-server/templates.py` (`_render_dictionary_image`). |
| `md_renderer.py` | Markdown-to-image rendering. Copied from `pos-server/md_renderer.py`. |
| `helpers.py` | `open_image()`, `resolve_font_path()`, `wrap_text()`. Adapted from `pos-server/helpers.py`. |
| `fonts/` | Bundled font files (Burra-Thin.ttf, Burra-Bold.ttf, Acidic.TTF). Copied from `pos-server/fonts/`. |
| `config.yaml` | Font/layout settings only (dictionary, helvetica, acidic sections). Copied from `pos-server/config.yaml`, printer/server sections removed. |
| `requirements.txt` | FastAPI, mediapipe, Pillow, numpy, requests, supabase-py, pyyaml |
| `Dockerfile` | Python 3.11 slim + system deps for mediapipe |
| `.dockerignore` | Exclude venv, .env, __pycache__ |
| `.env.example` | API keys, Supabase credentials |

### Modified

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `PortraitPrintPayload` schema |
| `apps/printer-bridge/src/index.ts` | Route by payload type (portrait vs text) |
| `apps/printer-bridge/src/printer.ts` | Add `printPortrait()` (download + print), update `printCard()` to call render-api then print |
| `apps/printer-bridge/src/config.ts` | Add `PRINT_RENDERER_URL` config |
| `apps/tablet/src/hooks/usePortraitCapture.ts` | Point to print-renderer instead of POS server |
| `apps/tablet/.env.example` | Add `VITE_PRINT_RENDERER_URL` |

### Stripped down: `apps/pos-server/`

| Remove | Why |
|--------|-----|
| `portrait_pipeline.py` | → print-renderer |
| `templates.py` | → print-renderer |
| `md_renderer.py` | → print-renderer |
| `image_printer.py` | → print-renderer (dithering) |
| `image_slicer.py` | → print-renderer (if still needed) |
| `helpers.py` | → print-renderer (font/wrap helpers) |
| `fonts/` | → print-renderer |
| `opencv_tuner.html` | Obsolete |
| Most of `config.yaml` | Only `printer` + `server` sections remain |
| Most of `print_server.py` routes | Only `/print` and `/health` remain |

### Keep on Pi: `apps/pos-server/`

| File | Why |
|------|-----|
| `printer_core.py` | ESC/POS connection, `Formatter` class — talks to USB printer |
| `print_server.py` | Stripped to: `/print` (image), `/health`. Flask + mutex + reconnect. |
| `config.yaml` | Only `printer` (vendor_id, product_id, connection) + `server` (host, port) sections |

---

## Task 1: Create print-renderer service

**Files:**
- Create: `apps/print-renderer/main.py`
- Create: `apps/print-renderer/pipeline.py`
- Create: `apps/print-renderer/dithering.py`
- Create: `apps/print-renderer/templates.py`
- Create: `apps/print-renderer/md_renderer.py`
- Create: `apps/print-renderer/helpers.py`
- Copy: `apps/pos-server/fonts/` → `apps/print-renderer/fonts/`
- Create: `apps/print-renderer/config.yaml`
- Create: `apps/print-renderer/requirements.txt`
- Create: `apps/print-renderer/.env.example`
- Create: `apps/print-renderer/.dockerignore`

- [ ] **Step 1: Create directory and requirements.txt**

```
fastapi>=0.115.0
uvicorn[standard]>=0.34.0
mediapipe>=0.10.0
Pillow>=10.0
numpy>=1.24
requests>=2.31
python-multipart>=0.0.9
supabase>=2.0
python-dotenv>=1.0
pyyaml>=6.0
```

- [ ] **Step 2: Create .env.example and .dockerignore**

`.env.example`:
```
OPENROUTER_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
N8N_WEBHOOK_URL=https://n8n.baufer.beauty/webhook/portrait-statue
RENDER_API_KEY=
```

`.dockerignore`:
```
venv/
.env
__pycache__/
*.pyc
test_output/
*.jpg
```

- [ ] **Step 3: Copy fonts/ directory**

```bash
cp -r apps/pos-server/fonts/ apps/print-renderer/fonts/
```

- [ ] **Step 4: Create config.yaml (rendering settings only)**

Copy the `dictionary`, `helvetica`, `acidic`, `halftone`, and `portrait` sections from `apps/pos-server/config.yaml`. Remove `printer` and `server` sections.

- [ ] **Step 5: Create helpers.py**

Adapted from `apps/pos-server/helpers.py`. Include:
- `open_image(source)` — accepts file path, bytes, or BytesIO
- `resolve_font_path(path)` — resolve relative font paths
- `wrap_text(text, font, max_width, draw)` — word wrapping
- `FONT_THIN`, `FONT_BOLD` constants

- [ ] **Step 6: Create dithering.py**

Copy entire `apps/pos-server/image_printer.py` verbatim. Change `from helpers import open_image` to local import. Add public `dither_image(grey, mode, dot_size)` wrapper function.

- [ ] **Step 7: Create templates.py**

Copy `_render_dictionary_image()` from `apps/pos-server/templates.py` (lines 128-220). Make it a public function `render_dictionary_image(data, config)`. Update imports to use local `helpers.py`.

- [ ] **Step 8: Copy md_renderer.py**

Copy `apps/pos-server/md_renderer.py` verbatim. Update imports to use local `helpers.py`.

- [ ] **Step 9: Create pipeline.py**

Adapted from `apps/pos-server/portrait_pipeline.py`:
- **Remove** `_detect_face_opencv()` and all OpenCV code
- **Remove** `try: import mediapipe` fallback — import unconditionally
- **Remove** `print_portrait()` — no local printing
- **Add** `transform_to_statue_bytes(image_bytes, config)` — accepts/returns bytes
- **Add** `process_portrait(image_bytes, config)` — returns `list[tuple[str, Image]]`
- **Keep** `detect_face_landmarks()`, `compute_zoom_crops()`, `_fallback_box()`, `_fallback_strip()`
- **Import** `_prepare`, `_apply_blur`, `dither_image` from local `dithering.py`

See previous version of this plan for full code of `detect_face_landmarks`, `transform_to_statue_bytes`, `process_portrait`.

- [ ] **Step 10: Create main.py**

```python
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
import yaml
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client

from pipeline import transform_to_statue_bytes, process_portrait
from templates import render_dictionary_image
from md_renderer import render_markdown

load_dotenv()

# Load rendering config (fonts, layout, dithering settings)
_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")
with open(_CONFIG_PATH) as f:
    RENDER_CONFIG = yaml.safe_load(f)

app = FastAPI(title="MeinUngeheuer Print Renderer")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
RENDER_API_KEY = os.environ.get("RENDER_API_KEY", "")

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)


def verify_api_key(x_api_key: str = Header(default="")):
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
    template: str = "dictionary"  # config section: dictionary, helvetica, acidic


@app.post("/render/dictionary", dependencies=[Depends(verify_api_key)])
def render_dictionary(req: DictionaryRequest):
    """Render a dictionary card as a PNG image and return it directly."""
    data = {"word": req.word, "definition": req.definition, "citations": req.citations}
    # Use the requested template section from config
    config = {req.template: RENDER_CONFIG.get(req.template, RENDER_CONFIG.get("dictionary", {}))}
    img = render_dictionary_image(data, config, style=req.template)
    return _image_response(img)


# ── Markdown rendering ────────────────────────────────────

class MarkdownRequest(BaseModel):
    text: str
    style: str = "dictionary"
    show_date: bool = True


@app.post("/render/markdown", dependencies=[Depends(verify_api_key)])
def render_md(req: MarkdownRequest):
    """Render markdown text as a PNG image and return it directly."""
    img = render_markdown(req.text, RENDER_CONFIG, req.show_date, req.style)
    return _image_response(img)


# ── Portrait processing ──────────────────────────────────

@app.post("/process/portrait", dependencies=[Depends(verify_api_key)])
async def process_portrait_endpoint(
    file: UploadFile = File(...),
    session_id: str | None = None,
    skip_transform: bool = False,
):
    """
    Full portrait pipeline: style transfer → face detection → crop → dither.
    Uploads print-ready images to Supabase Storage, inserts into print_queue.
    """
    if not supabase_client:
        raise HTTPException(500, "Supabase not configured")

    image_bytes = await file.read()

    portrait_cfg = RENDER_CONFIG.get("portrait", {})
    config = {
        "n8n_webhook_url": os.environ.get("N8N_WEBHOOK_URL") or portrait_cfg.get("n8n_webhook_url"),
        "openrouter_api_key_env": portrait_cfg.get("openrouter_api_key_env", "OPENROUTER_API_KEY"),
        "style_prompt": portrait_cfg.get("style_prompt", "Transform this portrait into a monochrome sculpture."),
        "paper_px": RENDER_CONFIG.get("halftone", {}).get("paper_px", 576),
        "contrast": RENDER_CONFIG.get("halftone", {}).get("contrast", 1.3),
        "brightness": RENDER_CONFIG.get("halftone", {}).get("brightness", 1.0),
        "sharpness": RENDER_CONFIG.get("halftone", {}).get("sharpness", 1.2),
        "blur": portrait_cfg.get("blur", 10),
        "dither_mode": portrait_cfg.get("dither_mode", "bayer"),
    }

    if not skip_transform and config.get("n8n_webhook_url"):
        image_bytes = transform_to_statue_bytes(image_bytes, config)

    results = process_portrait(image_bytes, config)

    job_id = str(uuid.uuid4())
    image_urls = []
    for name, img in results:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        path = f"portraits/{job_id}/{name}.png"
        supabase_client.storage.from_("prints").upload(
            path, buf.getvalue(), file_options={"content-type": "image/png"}
        )
        url = supabase_client.storage.from_("prints").get_public_url(path)
        image_urls.append({"name": name, "url": url})

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

    return {"status": "ok", "job_id": job_id, "zoom_levels": len(results), "image_urls": image_urls}


# ── Health ────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "print-renderer"}
```

- [ ] **Step 11: Test locally**

```bash
cd apps/print-renderer
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Test dictionary rendering:
```bash
curl -X POST http://localhost:8000/render/dictionary \
  -H "Content-Type: application/json" \
  -d '{"word":"VOGEL","definition":"Ein Vogel ist ein Test.","citations":["test"]}' \
  --output test_card.png
```

Test portrait (skip transform):
```bash
curl -X POST http://localhost:8000/process/portrait \
  -F "file=@../pos-server/test_portrait.jpg" \
  -F "skip_transform=true"
```

- [ ] **Step 12: Commit**

```bash
git add apps/print-renderer/
git commit -m "feat: add print-renderer service — portraits, dictionary cards, markdown rendering"
```

---

## Task 2: Add PortraitPrintPayload to shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add schema after PrintPayloadSchema**

```typescript
export const PortraitPrintPayloadSchema = z.object({
  type: z.literal('portrait'),
  image_urls: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
  })),
  job_id: z.string(),
  timestamp: z.string().datetime({ offset: true }),
});
export type PortraitPrintPayload = z.infer<typeof PortraitPrintPayloadSchema>;
```

- [ ] **Step 2: Build and typecheck**

```bash
pnpm --filter @meinungeheuer/shared build && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add PortraitPrintPayload schema for image-based print jobs"
```

---

## Task 3: Update printer-bridge to render-then-print

The printer-bridge becomes the smart relay. For text payloads, it calls the print-renderer to get a PNG, then sends the PNG to the pos-server. For portrait payloads, it downloads pre-rendered images from Storage.

**Files:**
- Modify: `apps/printer-bridge/src/printer.ts`
- Modify: `apps/printer-bridge/src/index.ts`
- Modify: `apps/printer-bridge/src/config.ts`
- Modify: `apps/printer-bridge/.env.example`

- [ ] **Step 1: Add PRINT_RENDERER_URL to config**

In `config.ts`, add `printRendererUrl` field loaded from `PRINT_RENDERER_URL` env var.
In `.env.example`, add `PRINT_RENDERER_URL=http://localhost:8000`.

- [ ] **Step 2: Add `renderAndPrint()` to printer.ts**

```typescript
/**
 * Renders a text payload (dictionary card) via the cloud print-renderer,
 * then sends the resulting PNG to the POS server.
 * Retries once on network error.
 */
export async function renderAndPrint(
  posServerUrl: string,
  rendererUrl: string,
  payload: PrintPayload,
): Promise<void> {
  if (!posServerUrl || posServerUrl === 'console') {
    // Console mode: log as before
    console.log(`\n${'='.repeat(48)}`);
    console.log(`  ${payload.term}`);
    console.log('-'.repeat(48));
    console.log(payload.definition_text);
    console.log('='.repeat(48) + '\n');
    return;
  }

  // Step 1: Call render-api to get PNG
  const renderBody = {
    word: payload.term,
    definition: payload.definition_text,
    citations: payload.citations,
    template: payload.template ?? 'dictionary',
  };

  const renderRes = await fetch(`${rendererUrl.replace(/\/+$/, '')}/render/dictionary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(renderBody),
    signal: AbortSignal.timeout(15_000),
  });

  if (!renderRes.ok) {
    throw new Error(`Render API error: ${renderRes.status} ${await renderRes.text().catch(() => '')}`);
  }

  const imageBlob = await renderRes.blob();

  // Step 2: Send PNG to POS server
  const printUrl = `${posServerUrl.replace(/\/+$/, '')}/print`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const form = new FormData();
      form.append('file', imageBlob, 'card.png');

      const printRes = await fetch(printUrl, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(10_000),
      });

      if (!printRes.ok) {
        throw new Error(`POS server responded ${printRes.status}`);
      }
      return;
    } catch (err) {
      if (attempt === 1) {
        console.warn(`[printer] First attempt failed, retrying…`);
        continue;
      }
      throw err;
    }
  }
}
```

- [ ] **Step 3: Add `printPortrait()` to printer.ts**

```typescript
/**
 * Downloads pre-rendered portrait images from Supabase Storage,
 * sends them as a batch to POS server /print/batch.
 * Retries once on network error.
 */
export async function printPortrait(
  posServerUrl: string,
  payload: PortraitPrintPayload,
): Promise<void> {
  if (!posServerUrl || posServerUrl === 'console') {
    console.log(`[portrait] Job ${payload.job_id}: ${payload.image_urls.length} zoom levels`);
    return;
  }

  // Download all images
  const images: { name: string; blob: Blob }[] = [];
  for (const img of payload.image_urls) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`Download failed for ${img.name}: ${res.status}`);
    images.push({ name: img.name, blob: await res.blob() });
  }

  // Send all as batch
  const url = `${posServerUrl.replace(/\/+$/, '')}/print/batch`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const form = new FormData();
      for (const img of images) {
        form.append('files', img.blob, `${img.name}.png`);
      }
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`POS server responded ${res.status}`);
      return;
    } catch (err) {
      if (attempt === 1) { console.warn('[portrait] Retrying…'); continue; }
      throw err;
    }
  }
}
```

- [ ] **Step 4: Update processJob() in index.ts**

Replace the payload parsing/routing logic:

```typescript
import { PortraitPrintPayloadSchema } from '@meinungeheuer/shared';
import { renderAndPrint, printPortrait } from './printer.js';

// In processJob(), after claiming:
try {
  if (rawPayload.type === 'portrait') {
    const parsed = PortraitPrintPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      console.error(`[bridge] Invalid portrait payload:`, parsed.error.flatten());
      await supabase.from('print_queue').update({ status: 'error' }).eq('id', rowId);
      return;
    }
    await printPortrait(config.posServerUrl, parsed.data);
  } else {
    const parsed = PrintPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      console.error(`[bridge] Invalid payload:`, parsed.error.flatten());
      await supabase.from('print_queue').update({ status: 'error' }).eq('id', rowId);
      return;
    }
    await renderAndPrint(config.posServerUrl, config.printRendererUrl, parsed.data);
  }

  await supabase
    .from('print_queue')
    .update({ status: 'done', printed_at: new Date().toISOString() })
    .eq('id', rowId);

  console.log(`[bridge] Job ${rowId} done`);
} catch (err) {
  // existing error handling
}
```

- [ ] **Step 5: Build and typecheck**

```bash
pnpm --filter @meinungeheuer/shared build
pnpm --filter @meinungeheuer/printer-bridge build
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/printer-bridge/ packages/shared/
git commit -m "feat: printer-bridge renders text via cloud service, downloads portraits from Storage"
```

---

## Task 4: Strip pos-server to bare image printer

The pos-server becomes ~60 lines: receive image(s), print, cut.

**Files:**
- Rewrite: `apps/pos-server/print_server.py`
- Delete: `apps/pos-server/portrait_pipeline.py`
- Delete: `apps/pos-server/templates.py`
- Delete: `apps/pos-server/md_renderer.py`
- Delete: `apps/pos-server/image_printer.py`
- Delete: `apps/pos-server/image_slicer.py`
- Delete: `apps/pos-server/helpers.py`
- Delete: `apps/pos-server/print_cli.py`
- Delete: `apps/pos-server/opencv_tuner.html`
- Simplify: `apps/pos-server/config.yaml`
- Keep: `apps/pos-server/printer_core.py`

- [ ] **Step 1: Rewrite print_server.py**

```python
"""
Minimal POS print server — receives images and prints them.
All rendering (text layout, portrait processing, dithering) happens
in the cloud print-renderer service. This server just does ESC/POS.
"""
import os
import tempfile
import time
import signal
import sys
import threading
import logging
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from printer_core import load_config, connect, validate_config

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

_config = None
_printer = None
_dummy = False
_print_lock = threading.Lock()
_server_start_time = None
_last_print_time = None

logger = logging.getLogger(__name__)


def reconnect():
    global _printer
    try:
        _printer.close()
    except Exception:
        pass
    time.sleep(0.5)
    _printer = connect(_config, dummy=_dummy)


def with_retry(fn):
    global _last_print_time
    with _print_lock:
        try:
            _printer.hw("INIT")
            fn(_printer)
            _last_print_time = datetime.now(timezone.utc).isoformat()
        except Exception:
            logger.warning("Print failed, reconnecting...")
            reconnect()
            _printer.hw("INIT")
            fn(_printer)
            _last_print_time = datetime.now(timezone.utc).isoformat()


@app.route("/print", methods=["POST"])
def print_image():
    """Print a single pre-rendered image. Accepts multipart/form-data with 'file'."""
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    uploaded = request.files["file"]
    suffix = os.path.splitext(uploaded.filename or "img.png")[1] or ".png"
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
        return jsonify({"error": "No files"}), 400

    tmp_paths = []
    try:
        for f in files:
            suffix = os.path.splitext(f.filename or "img.png")[1] or ".png"
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            f.save(tmp)
            tmp.close()
            tmp_paths.append(tmp.name)

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
    except (NotImplementedError, Exception):
        result["printer"] = "dummy" if _dummy else "unknown"
    return jsonify(result)


def main():
    global _config, _printer, _dummy, _server_start_time
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dummy", action="store_true")
    parser.add_argument("--config", default="config.yaml")
    args = parser.parse_args()

    _config = load_config(args.config)
    validate_config(_config)
    _server_start_time = time.time()
    _dummy = args.dummy

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
```

- [ ] **Step 2: Simplify config.yaml**

```yaml
printer:
  connection: "usb"
  vendor_id: 0x1fc9
  product_id: 0x2016
  network_host: "192.168.1.100"
  network_port: 9100
  paper_width: 48

server:
  host: "0.0.0.0"
  port: 9100
```

Everything else (fonts, templates, halftone, portrait) is gone — lives in print-renderer now.

- [ ] **Step 3: Delete rendering files**

```bash
cd apps/pos-server
rm -f portrait_pipeline.py templates.py md_renderer.py image_printer.py \
      image_slicer.py helpers.py print_cli.py opencv_tuner.html
```

Note: keep `printer_core.py` (ESC/POS connection + Formatter class).

- [ ] **Step 4: Verify it starts**

```bash
python print_server.py --dummy
curl http://localhost:9100/health
```

- [ ] **Step 5: Commit**

```bash
git add apps/pos-server/print_server.py apps/pos-server/config.yaml apps/pos-server/printer_core.py
git rm apps/pos-server/portrait_pipeline.py apps/pos-server/templates.py \
       apps/pos-server/md_renderer.py apps/pos-server/image_printer.py \
       apps/pos-server/image_slicer.py apps/pos-server/helpers.py \
       apps/pos-server/print_cli.py apps/pos-server/opencv_tuner.html
git commit -m "refactor: strip pos-server to bare image printer — all rendering in cloud"
```

---

## Task 5: Update tablet for portrait uploads

**Files:**
- Modify: `apps/tablet/src/hooks/usePortraitCapture.ts`
- Modify: `apps/tablet/.env.example`

- [ ] **Step 1: Add VITE_PRINT_RENDERER_URL to .env.example**

- [ ] **Step 2: Update usePortraitCapture.ts target URL**

Change the upload target from POS server `/portrait/capture` to print-renderer `/process/portrait`. The print-renderer handles everything (style transfer, face detection, print_queue insertion).

- [ ] **Step 3: Build and typecheck**

```bash
pnpm --filter @meinungeheuer/tablet build && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/tablet/
git commit -m "feat: tablet uploads portraits to cloud print-renderer"
```

---

## Task 6: Supabase Storage bucket

**Files:**
- Create: `supabase/migrations/011_prints_storage.sql`

- [ ] **Step 1: Create migration**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('prints', 'prints', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "prints_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'prints');

CREATE POLICY "prints_service_upload" ON storage.objects
  FOR INSERT TO service_role WITH CHECK (bucket_id = 'prints');

CREATE POLICY "prints_service_delete" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'prints');
```

- [ ] **Step 2: Apply migration and verify**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_prints_storage.sql
git commit -m "feat: add Supabase Storage bucket for print-ready images"
```

---

## Task 7: Dockerfile

**Files:**
- Create: `apps/print-renderer/Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Test build**

```bash
docker build -t print-renderer apps/print-renderer/
docker run -p 8000:8000 --env-file apps/print-renderer/.env print-renderer
```

- [ ] **Step 3: Commit**

```bash
git add apps/print-renderer/Dockerfile apps/print-renderer/.dockerignore
git commit -m "feat: add Dockerfile for print-renderer"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Start all services**

```bash
# Terminal 1: print-renderer (cloud)
cd apps/print-renderer && uvicorn main:app --port 8000

# Terminal 2: printer-bridge (Pi)
PRINT_RENDERER_URL=http://localhost:8000 pnpm dev:printer

# Terminal 3: pos-server (Pi)
cd apps/pos-server && python print_server.py --dummy
```

- [ ] **Step 2: Test text card flow**

Insert a test print job into Supabase (simulating what the tablet does):
```sql
INSERT INTO print_queue (session_id, payload, status) VALUES (
  NULL,
  '{"term":"VOGEL","definition_text":"Ein Test.","citations":[],"language":"de","session_number":1,"chain_ref":null,"timestamp":"2026-03-21T12:00:00Z"}',
  'pending'
);
```

Verify: bridge picks up → calls render-api → gets PNG → sends to pos-server → prints.

- [ ] **Step 3: Test portrait flow**

```bash
curl -X POST http://localhost:8000/process/portrait \
  -F "file=@apps/pos-server/test_portrait.jpg" \
  -F "skip_transform=true"
```

Verify: render-api processes → uploads to Storage → inserts print_queue → bridge picks up → downloads → pos-server prints.

- [ ] **Step 4: Verify Pi has no ML deps**

```bash
grep -r "mediapipe\|import cv2\|import numpy\|import templates\|import md_renderer" apps/pos-server/*.py
# Should return nothing
```

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: end-to-end verification complete"
```

---

## Deployment Notes

- **Print Renderer** — deploy as separate Docker service on Coolify/Railway (Python)
- Env vars: `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_WEBHOOK_URL`, `RENDER_API_KEY`
- **Printer Bridge** — needs new env var `PRINT_RENDERER_URL` pointing to deployed renderer
- **Tablet** — needs new env var `VITE_PRINT_RENDERER_URL` for portrait uploads
- **POS Server on Pi** — remove from venv: `numpy`, `mediapipe`, `opencv-python`, `python-barcode`, `qrcode`. Only needs: `flask`, `flask-cors`, `python-escpos`, `Pillow`, `PyYAML`
- Consider a cleanup job to delete old portraits from Supabase Storage after 24h
