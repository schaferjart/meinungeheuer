# Research: Integrating Python POS Server into Node.js Monorepo

**Domain:** Local hardware integration (thermal printer + portrait pipeline)
**Researched:** 2026-03-08
**Overall confidence:** HIGH

---

## Executive Summary

The MeinUngeheuer monorepo (pnpm, Node.js/TypeScript) needs to integrate a standalone Python Flask server (`POS-thermal-printer`) that handles ESC/POS thermal printing and a portrait pipeline (MediaPipe face landmarks + Gemini Flash style transfer + multi-zoom dithered printing). The existing `printer-bridge` (Node.js) already relays print jobs to the POS server via HTTP POST. The question is how to bring the Python server into the monorepo, whether to eliminate the Node.js bridge, how to capture visitor portraits from the tablet, and how to deploy the combined system to a Raspberry Pi.

**Recommendation:** Keep both services. Move the Python POS server into `apps/pos-server/` as a co-located but independently managed Python project. Keep the Node.js `printer-bridge` as the Supabase Realtime listener that relays to the POS server. Add portrait capture from the tablet's existing camera stream. Deploy on Pi via docker-compose with two containers (printer-bridge + pos-server) or systemd services.

---

## 1. Monorepo Integration Patterns

### Recommendation: Co-located Python directory, NOT a pnpm workspace member

pnpm workspaces are designed for Node.js packages. Python projects cannot participate in pnpm dependency resolution, linking, or build orchestration. Attempting to register `apps/pos-server/` in `pnpm-workspace.yaml` would be misleading and cause confusion.

**Directory structure:**

```
meinungeheuer/
  apps/
    tablet/          # React/Vite (pnpm workspace member)
    backend/         # Hono (pnpm workspace member)
    printer-bridge/  # Node.js Supabase relay (pnpm workspace member)
    pos-server/      # Python Flask -- NOT in pnpm workspace
  packages/
    shared/          # TypeScript types
```

**Confidence:** HIGH -- This follows the pattern documented by teams running multi-language monorepos. The Python service lives in the monorepo for co-location and single-repo convenience, but uses its own toolchain (venv + pip).

### pnpm scripts for Python orchestration

Add convenience scripts to the root `package.json` that shell out to the Python venv. This keeps `pnpm dev` as the single entry point for the full stack:

```json
{
  "scripts": {
    "dev:pos": "cd apps/pos-server && ./venv/bin/python print_server.py --dummy",
    "setup:pos": "cd apps/pos-server && ./setup.sh --deps-only"
  }
}
```

The existing `pnpm dev` script uses `pnpm -r --parallel dev` which only hits workspace members. Add pos-server to the parallel dev command separately:

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev & cd apps/pos-server && ./venv/bin/python print_server.py --dummy"
  }
}
```

Or better: use a process manager like `concurrently` (already a common monorepo pattern) to run both Node.js and Python services:

```json
{
  "scripts": {
    "dev:all": "concurrently -n tablet,backend,bridge,pos -c blue,green,yellow,magenta \"pnpm dev:tablet\" \"pnpm dev:backend\" \"pnpm dev:printer\" \"pnpm dev:pos\""
  }
}
```

**Confidence:** HIGH -- Standard pattern. The `setup.sh` script already handles venv creation and pip install.

### What to copy vs. what to change

Copy the entire POS directory contents into `apps/pos-server/`:
- All `.py` files
- `config.yaml`
- `requirements.txt`
- `fonts/` directory
- `templates/` directory (Flask HTML templates)
- `setup.sh`
- `.gitignore` (add `venv/`, `__pycache__/`)

**Do NOT copy:**
- `venv/` -- regenerated via `setup.sh`
- `__pycache__/` -- generated
- Preview images (`preview_*.png`) -- test artifacts
- `.git/` -- already in parent monorepo

Add `apps/pos-server/venv/` to the root `.gitignore`.

---

## 2. Communication Protocol

### Current architecture

```
Supabase (print_queue table)
    |
    | Realtime INSERT event
    v
printer-bridge (Node.js)
    |
    | HTTP POST /print/dictionary
    v
POS server (Python Flask, port 9100)
    |
    | python-escpos USB
    v
Thermal Printer
```

### Should we eliminate the Node.js bridge?

**No. Keep the bridge.** Here is the analysis:

#### Option A: Supabase Realtime directly from Python (eliminate bridge)

The `supabase-py` library supports Realtime subscriptions via async client (`acreate_client` + `on_postgres_changes`). This would let the Python server subscribe to `print_queue` INSERTs directly.

**Pros:**
- One fewer service to run
- Direct path from database to printer

**Cons:**
- supabase-py Realtime requires async (`asyncio`). Flask is synchronous. Would need to either:
  - Switch to an async framework (FastAPI/Quart) -- significant rewrite
  - Run the Realtime listener in a separate asyncio thread alongside Flask -- fragile
- The POS server is a well-tested, stable printing service. Mixing Supabase subscription logic into it violates its clean single responsibility.
- The POS server's `_print_lock` (threading.Lock) serializes USB access. Adding async Realtime callbacks alongside synchronous Flask request handling creates concurrency nightmares.
- Supabase Realtime Python is younger and less battle-tested than the JS client.

**Verdict: Not worth it.** The bridge is 188 lines of TypeScript, trivially maintainable, and cleanly separates concerns.

**Confidence:** HIGH -- Based on reading the actual POS server code and Supabase Python docs.

#### Option B: Keep HTTP relay (current approach) -- RECOMMENDED

The current pattern works well:
- printer-bridge is a lightweight, reliable Supabase Realtime listener
- It POSTs to `http://localhost:9100/print/dictionary`
- POS server handles ESC/POS rendering, font loading, image dithering
- Clean separation: bridge owns the "when to print" logic, POS server owns "how to print"

The only addition needed: the bridge should also relay portrait data to `/portrait/capture` when a visitor face image is available.

**Confidence:** HIGH

#### Option C: Direct USB from Node.js (eliminate Python server entirely)

Theoretically possible via `node-escpos` or `node-thermal-printer` npm packages. But:
- The POS server's image-rendering pipeline (PIL, custom fonts, dithering) would need to be rewritten in Node.js
- The portrait pipeline (MediaPipe, Gemini Flash) is Python-native
- The existing POS server is mature and tested on Pi hardware

**Verdict: Terrible idea.** Would be a massive rewrite for no benefit.

---

## 3. Portrait Pipeline Integration

### How it works today (POS server)

The portrait pipeline has 3 stages:
1. **Photo selection** -- Multiple photos sent to OpenRouter vision model (Gemini Flash), AI picks best portrait
2. **Style transfer** -- Photo sent to n8n webhook which calls Gemini 2.5 Flash Image to transform portrait into monochrome wax sculpture aesthetic
3. **Print** -- MediaPipe FaceMesh detects landmarks, computes 4 zoom crops, each is dithered (bayer/floyd/halftone) and printed as a separate receipt

The POS server exposes:
- `POST /portrait/capture` -- Accepts multipart `file` fields, runs full pipeline (select + transform + print)
- `POST /portrait/transform` -- Accepts single `file`, returns transformed PNG (no print)

### Capturing visitor face from the tablet

The tablet already has a camera stream running for face detection (`useFaceDetection.ts`). The hidden `<video>` element receives the front-facing camera at 320x240. This is too low resolution for a portrait print.

**Recommended approach:**

1. **Create a `usePortraitCapture` hook** that requests a higher-resolution camera stream (separate from face detection):
   ```typescript
   // Request 1280x960 or highest available for portrait quality
   const stream = await navigator.mediaDevices.getUserMedia({
     video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
     audio: false,
   });
   ```

2. **Capture frames using Canvas API:**
   ```typescript
   function captureFrame(video: HTMLVideoElement): Promise<Blob> {
     const canvas = document.createElement('canvas');
     canvas.width = video.videoWidth;
     canvas.height = video.videoHeight;
     const ctx = canvas.getContext('2d')!;
     ctx.drawImage(video, 0, 0);
     return new Promise((resolve) => {
       canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92);
     });
   }
   ```

3. **Capture timing: During the conversation, NOT at the end.**
   - The visitor is most engaged and expressively present during the conversation phase
   - Capture 3-5 frames at intervals during the conversation (e.g., at 30s, 60s, 90s)
   - Send all frames to `/portrait/capture` which uses AI to pick the best one
   - Do NOT capture during farewell (visitor may already be looking away)

4. **Send to POS server via the printer-bridge (or directly):**
   - Option A: POST multipart form-data directly from tablet to POS server URL (requires tablet to know POS server address -- breaks if POS server is on different host)
   - Option B (recommended): POST to the cloud backend, which stores the image in Supabase Storage, then the printer-bridge downloads and forwards to POS server
   - Option C (simplest for MVP): POST directly from tablet to POS server. The tablet already needs `VITE_POS_SERVER_URL` or discovers it via mDNS.

**Recommended for MVP: Option C (direct POST from tablet to POS server).** The tablet and POS server are on the same local network. Add a `VITE_POS_SERVER_URL` env var to the tablet. The portrait capture is fire-and-forget during the conversation phase.

**Confidence:** HIGH for the Canvas API approach. MEDIUM for the direct-POST architecture (depends on network topology at the installation site).

### Camera permission sharing

The tablet already has camera permission for face detection. The `getUserMedia` call with `{ facingMode: 'user' }` should return the same camera. Modern browsers allow multiple `getUserMedia` calls to the same device. However, on some tablets (especially Safari), requesting a second stream may fail or produce a lower-quality duplicate.

**Better approach:** Share the camera stream. Use a single higher-resolution stream for both face detection and portrait capture. Modify `useFaceDetection` to accept an external stream or accept a higher resolution and downscale for detection internally. MediaPipe face detection at 2fps on a 1280x960 stream is still fast enough on modern tablets.

```typescript
// Single stream at portrait quality
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
  audio: false,
});
// Face detection reads from the same video element
// Portrait capture draws from the same video element at native resolution
```

**Confidence:** MEDIUM -- Needs testing on actual target tablet hardware (iPad vs. Android vs. Samsung).

### Integration with installation state machine

Add portrait capture to the conversation screen flow:

```
conversation (screen)
  - Start conversation with ElevenLabs
  - Start portrait capture timer (every 20-30 seconds, capture a frame)
  - Store captured blobs in state/ref
  - When conversation ends (DEFINITION_RECEIVED):
    - Send all captured frames to POS server /portrait/capture
    - This runs asynchronously alongside definition display

printing (screen)
  - Bridge sends /print/dictionary for definition card
  - POS server processes portrait (AI selection + style transfer + multi-zoom print)
  - Both print independently (portrait prints after dictionary card)
```

The portrait pipeline takes 30-180 seconds (n8n webhook + Gemini image generation). This should run asynchronously. The installation does NOT wait for the portrait to print before showing the farewell screen.

**Confidence:** HIGH for the flow design. The existing state machine transitions handle this naturally -- portrait submission happens as a side effect, not a blocking state transition.

---

## 4. Raspberry Pi Deployment

### Current state (from POS server CLAUDE.md)

The POS server already runs on a Pi 3 (Debian Trixie, aarch64) with:
- systemd service `pos-printer`
- USB printer access via udev rules + `usblp` blacklist
- Zeroconf/mDNS service registration
- User `stoffel`, project dir `/home/stoffel/POS-thermal-printer`

### Deployment strategy: Two systemd services (NOT docker-compose on Pi)

Docker on a Pi 3 (1GB RAM, ARM) is heavyweight and introduces unnecessary complexity. The Pi 3 can barely run Docker well. Use native systemd services instead:

1. **pos-printer.service** -- Already exists. Runs Python Flask POS server.
2. **printer-bridge.service** -- New. Runs Node.js printer-bridge.

```ini
# /etc/systemd/system/printer-bridge.service
[Unit]
Description=MeinUngeheuer Printer Bridge
After=network.target pos-printer.service
Wants=pos-printer.service

[Service]
Type=simple
User=stoffel
WorkingDirectory=/home/stoffel/meinungeheuer/apps/printer-bridge
ExecStart=/usr/bin/node /home/stoffel/meinungeheuer/apps/printer-bridge/dist/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/stoffel/meinungeheuer/apps/printer-bridge/.env
MemoryMax=200M

[Install]
WantedBy=multi-user.target
```

The bridge depends on the POS server (`After=pos-printer.service`) so it starts after the printer is ready.

**Confidence:** HIGH -- This is exactly how the existing POS server is deployed, and it works.

### Node.js on Pi 3

Node.js 20 LTS runs on ARM64 (aarch64). Install via:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

The printer-bridge has minimal dependencies (just `@supabase/supabase-js` and `zod`), so memory usage will be well under 100MB.

**Confidence:** HIGH -- Node.js 20 LTS has official ARM64 binaries.

### Network discovery (mDNS)

The POS server already registers itself via `zeroconf` (Python library) as `POS Thermal Printer._http._tcp.local.` on port 9100. This means:
- Any device on the local network can discover the printer at `<hostname>.local:9100`
- The Pi's hostname is accessible as `<hostname>.local` via Avahi/mDNS

For the tablet to discover the POS server:
- **Simple approach (MVP):** Hardcode `VITE_POS_SERVER_URL=http://<pi-hostname>.local:9100` in tablet build args
- **Advanced approach:** Use browser mDNS discovery. However, browsers do NOT support mDNS service browsing natively. You would need either:
  - A DNS-SD proxy service on the backend
  - Or simply use `.local` hostname resolution (which browsers DO support via OS resolver)

**Recommendation:** Use `.local` hostname. Set `VITE_POS_SERVER_URL=http://stoffel.local:9100` (or whatever the Pi hostname is). This resolves via Avahi/Bonjour on the local network. No discovery protocol needed.

**Confidence:** HIGH -- `.local` hostname resolution via mDNS is universally supported on macOS/iOS and Linux with Avahi installed.

### USB printer access

Already handled by the existing `setup.sh`:
1. udev rule at `/etc/udev/rules.d/99-thermal-printer.rules` grants non-root access to the USB printer (vendor `1fc9`, product `2016`)
2. `usblp` kernel module is blacklisted at `/etc/modprobe.d/no-usblp.conf` so it does not claim the device before python-escpos

No changes needed.

### Deploy script

Create a unified deploy script that sets up both services:

```bash
#!/bin/bash
# deploy-pi.sh -- run on Pi to set up both services

# 1. Clone/update monorepo
cd ~/meinungeheuer && git pull origin main

# 2. Set up POS server
cd apps/pos-server && ./setup.sh

# 3. Set up printer-bridge
cd ../printer-bridge
npm install --production
npm run build

# 4. Create printer-bridge systemd service
sudo cp printer-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable printer-bridge
sudo systemctl restart printer-bridge
```

**Confidence:** HIGH

---

## 5. Docker Compose (Development Only)

For local development on macOS/Linux (NOT for Pi deployment), docker-compose is useful for running the full local stack:

```yaml
# docker-compose.dev.yml
services:
  pos-server:
    build:
      context: ./apps/pos-server
      dockerfile: Dockerfile
    ports:
      - "9100:9100"
    command: python print_server.py --dummy
    volumes:
      - ./apps/pos-server:/app
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}

  printer-bridge:
    build:
      context: .
      dockerfile: apps/printer-bridge/Dockerfile
    depends_on:
      - pos-server
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - POS_SERVER_URL=http://pos-server:9100
```

This is optional and only for development convenience. Production on Pi uses systemd directly.

**Confidence:** MEDIUM -- Docker Compose is standard but writing the Dockerfiles for both services would need to be done. The POS server Dockerfile would need to handle Python venv, libusb, PIL dependencies.

---

## 6. Data Flow Summary (After Integration)

```
Tablet (React/Vite)
    |
    |--- ElevenLabs WebSocket (conversation)
    |       |
    |       v
    |    ElevenLabs → Custom LLM (OpenRouter) → save_definition tool call
    |       |
    |       v
    |    Backend (Hono, Vercel) → Supabase print_queue INSERT
    |
    |--- Portrait capture (Canvas API, during conversation)
    |       |
    |       v
    |    Direct POST to POS server /portrait/capture
    |       |
    |       v
    |    POS server: AI selection → n8n style transfer → MediaPipe zoom → dither → PRINT
    |
    v
Supabase Realtime
    |
    v
Printer Bridge (Node.js, on Pi)
    |
    | HTTP POST /print/dictionary
    v
POS Server (Python Flask, on Pi)
    |
    | python-escpos USB
    v
Thermal Printer
    |
    | Output: dictionary card + portrait prints (4 zoom levels)
```

---

## 7. Critical Pitfalls

### Pitfall 1: Camera stream conflicts on iPad Safari
**What goes wrong:** Requesting two `getUserMedia` streams for the same camera may fail on Safari/WebKit.
**Prevention:** Use a single shared camera stream at portrait resolution for both face detection and portrait capture.
**Detection:** Test on target tablet hardware early.

### Pitfall 2: Portrait pipeline blocking the print queue
**What goes wrong:** The portrait pipeline takes 30-180s (Gemini image generation). If it blocks the Flask print lock, dictionary card printing is delayed.
**Prevention:** The POS server already uses `_print_lock` (threading.Lock). Portrait capture runs through `with_retry()` which acquires the lock. Dictionary printing will queue behind it. Consider: run portrait processing outside the lock (only acquire lock for the final print step).
**Detection:** Monitor print latency during testing with concurrent dictionary + portrait jobs.

### Pitfall 3: Pi memory limits with portrait pipeline
**What goes wrong:** Pi 3 has 1GB RAM. MediaPipe + NumPy + PIL image processing for 4 zoom crops could exceed memory limits.
**Prevention:** The existing systemd service has `MemoryMax=400M`. Portrait pipeline dependencies (numpy, mediapipe) are optional (lazy import). Monitor actual memory usage. Consider Pi 4 (2GB+) if Pi 3 is insufficient.
**Detection:** Run portrait pipeline on Pi and monitor via `htop`.

### Pitfall 4: CORS on direct tablet-to-POS-server POST
**What goes wrong:** The tablet (served from e.g., `tablet.meinungeheuer.local`) POSTs to `http://stoffel.local:9100/portrait/capture`. This is a cross-origin request.
**Prevention:** POS server already has `CORS(app)` (flask-cors with default allow-all). Verify CORS headers are correctly set for multipart form-data requests.
**Detection:** Test in browser dev tools, check for CORS preflight failures.

### Pitfall 5: Font paths on Pi vs macOS
**What goes wrong:** The `helvetica` font style in config.yaml references `/System/Library/Fonts/HelveticaNeue.ttc` (macOS-only). The Pi does not have these fonts.
**Prevention:** Already documented in POS server CLAUDE.md. Use `dictionary` or `acidic` styles on Pi. The bundled `fonts/Burra-*.ttf` files are portable.
**Detection:** Attempt to render with non-existent font path logs a clear error.

---

## 8. Recommended Implementation Order

1. **Copy POS server into monorepo** (`apps/pos-server/`). Add pnpm convenience scripts. Verify `setup.sh --deps-only` works. Add `.gitignore` for `venv/`.

2. **Add portrait capture to tablet.** Create `usePortraitCapture` hook. Share camera stream with face detection. Capture frames during conversation. Store as blobs.

3. **Add portrait submission endpoint.** When conversation ends, POST captured frames to POS server `/portrait/capture`. Handle async -- don't block UI flow.

4. **Extend printer-bridge (optional).** If direct tablet-to-POS communication is not desired, add portrait relay through the bridge. But for MVP, direct POST is simpler.

5. **Deploy to Pi.** Add `printer-bridge.service` systemd unit. Update `deploy-pi.sh` script. Test full loop on hardware.

6. **Test end-to-end.** Verify: face detect -> wake -> karaoke -> conversation -> portrait capture -> definition -> dictionary print -> portrait print -> farewell.

---

## Sources

### Official Documentation
- [Supabase Python Realtime API](https://supabase.com/docs/reference/python/realtime-api) -- Confirms async-only Realtime in Python
- [Supabase Python Subscribe](https://supabase.com/docs/reference/python/subscribe) -- Python subscription API
- [HTMLCanvasElement.toBlob() MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) -- Canvas frame capture
- [Canvas API: Manipulating video MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Manipulating_video_using_canvas) -- Drawing video frames to canvas
- [pnpm Workspaces](https://pnpm.io/workspaces) -- pnpm workspace configuration

### Community Sources
- [Python and TypeScript in a monorepo](https://medium.com/@julien.barbay/python-and-typescript-in-a-monorepo-c862a3bacddb) -- Multi-language monorepo patterns
- [Typethon monorepo](https://github.com/sonervergon/typethon) -- pnpm + Python example
- [Flask systemd service](https://blog.miguelgrinberg.com/post/running-a-flask-application-as-a-service-with-systemd) -- Flask + systemd patterns
- [How to capture single frame from HTML video](https://daverupert.com/2022/11/html5-video-capture-frame-still/) -- Practical frame capture guide
- [Docker Compose with monorepo services](https://tedspence.com/building-applications-on-a-monorepo-with-docker-containers-ae47a3bf847b) -- Multi-service Docker patterns

### Project-Specific (Codebase Analysis)
- `apps/printer-bridge/src/index.ts` -- Current bridge implementation (188 lines, clean)
- `apps/printer-bridge/src/printer.ts` -- HTTP relay to POS server
- POS server `print_server.py` -- Flask endpoints, threading lock, zeroconf registration
- POS server `portrait_pipeline.py` -- 3-stage pipeline (selection + transform + print)
- POS server `setup.sh` -- systemd + udev setup, already production-ready for Pi
- POS server `CLAUDE.md` -- Documents Pi deployment gotchas (usblp, fonts, WiFi)
