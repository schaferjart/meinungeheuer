# Phase 4: Portrait + End-to-End Polish - Research

**Researched:** 2026-03-09 (forced re-research, code-grounded)
**Domain:** Browser camera capture, Canvas API, POS server portrait pipeline, system prompt engineering
**Confidence:** HIGH

## Summary

Phase 4 has two distinct workstreams: (1) portrait capture from the tablet camera and delivery to the POS server for dithered thermal printing (R7), and (2) improving the Mode A system prompt for better text citations (R8). Both are well-supported by existing infrastructure.

The portrait capture is the more technically nuanced task. The POS server (`apps/pos-server/`) already has a fully implemented `/portrait/capture` endpoint with a sophisticated pipeline: AI-based photo selection (`select_best_photo` via OpenRouter), style transfer via n8n webhook (`transform_to_statue` via Gemini 2.5 Flash Image), face-landmark zoom crops (`detect_face_landmarks` + `compute_zoom_crops`), and multi-zoom dithered printing (`print_portrait`). The missing piece is entirely tablet-side: capturing a high-resolution frame from the camera during conversation and POSTing it. The critical iOS Safari constraint is that **a second `getUserMedia()` call mutes the first stream's tracks** (WebKit bug #179363, confirmed still present). The solution is to request a single higher-resolution stream at init and share it between face detection and portrait capture. The current `useFaceDetection` hook (line 90-94) requests `320x240`; this must be upgraded. The hook stores the stream in `streamRef` (line 112) but only exposes `{ isPresent, isAwake, isSleeping, error, cameraReady }` -- the `videoRef` is already passed in from the parent, so portrait capture can use the same ref.

The system prompt improvement (R8) is a prompt engineering task. The current `buildTextTermPrompt` in `systemPrompt.ts` already has a QUOTE move (line 71) and instructions to "reference the text" (lines 56-58). However, the context text is injected as raw text in `buildModeBlock` (lines 275-285) with no line numbers, no paragraph markers, and no explicit citation format instructions. The QUOTE move merely says "Reference a specific line from the text. Ask what it means to them." -- too vague for reliable citation. The fix is: (1) add paragraph numbers to the injected text, (2) strengthen the QUOTE move with explicit citation format instructions, and (3) add TEXT ENGAGEMENT rules requiring at least 2 specific text references per conversation.

**Primary recommendation:** Upgrade camera resolution in `useFaceDetection`, create `usePortraitCapture` hook that reads frames from the same `videoRef`, POST as multipart/form-data to POS `/portrait/capture`. For prompts, add numbered paragraphs to injected text and strengthen citation instructions in QUOTE move.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R7 | Portrait Capture and Print: Capture visitor face from tablet camera during conversation (Canvas API to blob). POST to POS server `/portrait/capture`. Print dithered portrait on thermal card alongside definition. | Camera stream sharing via shared `videoRef` (already passed into `useFaceDetection`), Canvas `drawImage` + `toBlob` for frame capture, existing POS `/portrait/capture` endpoint accepts multipart files with `skip_selection` and `mode` params, `run_pipeline` handles full style-transfer-to-print flow, print coordination via timing (definition via print_queue is fast, portrait via direct POST + style transfer takes 30-180s) |
| R8 | Improve Agent Text Context: Review and improve system prompt for Mode A (text_term). Agent should make specific citations from the text, reference passages, and demonstrate genuine textual understanding. | Current `buildModeBlock` injects raw text without line numbers (systemPrompt.ts:275-285), QUOTE move exists but is vague (line 71), numbered-paragraph injection technique proven effective for LLM citation grounding, need to strengthen citation instructions without bloating prompt |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Already in apps/tablet |
| Canvas API | native | Frame capture from video | Only cross-browser approach for still capture from getUserMedia on iOS Safari -- ImageCapture API is NOT supported in any Safari version |
| Fetch API | native | POST image to POS server | Standard browser HTTP client |
| FormData | native | Multipart file upload | Required by `/portrait/capture` endpoint (uses `request.files.getlist("file")`) |
| MediaPipe tasks-vision | 0.10.32 | Face detection | Already used in useFaceDetection, loaded from CDN |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @mediapipe/tasks-vision | 0.10.32 | Face detection WASM runtime | Already installed, CDN-loaded in useFaceDetection.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas drawImage + toBlob | ImageCapture API (takePhoto) | NOT viable -- Safari/iOS does not support ImageCapture API at all. Canvas is the only option. |
| Single shared stream | Two getUserMedia() calls | NOT viable -- iOS Safari mutes the first stream's tracks when a second getUserMedia() is called (WebKit bug #179363). Must share one stream. |
| Direct videoRef sharing | MediaStream.clone() | clone() is an option but unnecessary here -- CameraDetector already creates the videoRef and passes it to useFaceDetection. usePortraitCapture can receive the same videoRef. |

**Installation:** No new packages needed. All required APIs are browser-native.

## Architecture Patterns

### Current Camera Architecture (As-Is)

```
App.tsx
  └── CameraDetector (creates videoRef, renders hidden <video>)
        └── useFaceDetection (gets videoRef as prop)
              ├── getUserMedia({ width: 320, height: 240 })
              ├── stream → video.srcObject
              ├── FaceDetector.detectForVideo(video, ...) at 500ms interval
              └── Returns { isPresent, isAwake, isSleeping, error, cameraReady }
```

Key observations from actual code:
- `CameraDetector` creates its own `videoRef` internally (line 23 of CameraDetector.tsx)
- The `<video>` element is rendered with `width: 0, height: 0, opacity: 0` but NOT `display: none` (so MediaPipe can still read frames)
- `useFaceDetection` stores the stream in `streamRef` but does not expose it
- Detection runs at 2fps via `setInterval(..., 500)` with `detector.detectForVideo(video, now)`
- The hook uses `delegate: 'CPU'` for the MediaPipe model (not GPU)

### Target Camera Architecture (To-Be)

```
App.tsx
  ├── videoRef (created at App level, shared down)
  ├── CameraDetector (receives videoRef as prop)
  │     └── useFaceDetection (gets videoRef, upgraded to 1280x960)
  └── usePortraitCapture (receives same videoRef)
        ├── captureFrame(): Canvas drawImage → toBlob → JPEG
        └── uploadPortrait(): FormData POST to POS /portrait/capture
```

Changes required:
1. **Move videoRef creation up to `App.tsx`** (or `InstallationApp`). Currently `CameraDetector` creates its own ref (line 23). The ref needs to be passed in so `usePortraitCapture` can also use it.
2. **Upgrade resolution** in `useFaceDetection` from `320x240` to `1280x960` ideal. MediaPipe handles arbitrary input sizes internally.
3. **New `usePortraitCapture` hook** that takes `videoRef` and POS server URL.
4. **Wire capture trigger** in App.tsx -- fire during or after conversation screen.

### Pattern 1: Camera Stream Resolution Upgrade

**What:** Change the `getUserMedia` constraints in `useFaceDetection.ts` (lines 90-94).

**Current code (line 90-94):**
```typescript
stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'user',
    width: { ideal: 320 },
    height: { ideal: 240 },
  },
  audio: false,
});
```

**Target code:**
```typescript
stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 960 },
  },
  audio: false,
});
```

**Why `ideal` not `exact`:** iOS Safari returns the closest available resolution. iPad front cameras typically support up to 720p or 1080p via getUserMedia. Using `ideal` ensures the constraint never fails. Even 640x480 is sufficient for the thermal printer's 576px paper width.

**Performance impact:** MediaPipe face detection runs at 2fps (500ms interval) with `delegate: 'CPU'`. The blaze_face_short_range model handles arbitrary input sizes. The increased resolution adds negligible CPU overhead because the model internally downscales. Verified: the detection loop (line 164-221) already guards with `video.readyState < 2` before calling `detectForVideo`.

### Pattern 2: VideoRef Sharing

**What:** Lift `videoRef` out of `CameraDetector` into `App.tsx`.

**Current `CameraDetector` (CameraDetector.tsx:22-23):**
```typescript
export function CameraDetector({ onWake, onSleep }: CameraDetectorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
```

**Target `CameraDetector`:**
```typescript
interface CameraDetectorProps {
  onWake: () => void;
  onSleep: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function CameraDetector({ onWake, onSleep, videoRef }: CameraDetectorProps) {
  // No longer creates its own ref — uses the one from parent
```

**Target `App.tsx` (in InstallationApp):**
```typescript
const videoRef = useRef<HTMLVideoElement | null>(null);

// Pass to CameraDetector
<CameraDetector onWake={handleWake} onSleep={handleFaceLost} videoRef={videoRef} />

// Also use in portrait capture
const { captureAndUpload, isCapturing } = usePortraitCapture({
  videoRef,
  posServerUrl: import.meta.env['VITE_POS_SERVER_URL'] ?? '',
});
```

### Pattern 3: Canvas Frame Capture (Safari-Compatible)

**What:** Draw a video frame to an offscreen canvas, convert to Blob.

```typescript
async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  if (video.readyState < 2 || video.videoWidth === 0) {
    throw new Error('Video not ready for capture');
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context');

  ctx.drawImage(video, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      0.92,
    );
  });
}
```

**iOS black frame defense:** Check `video.readyState >= 2` AND `video.videoWidth > 0` before drawing. The `useFaceDetection` detection loop already uses this guard (line 166: `if (!video || video.readyState < 2) return;`). For portrait capture, add a retry mechanism: if the first capture produces a tiny blob (< 1KB), retry after 100ms.

### Pattern 4: Portrait Upload to POS Server

**What:** POST the captured frame to the existing `/portrait/capture` endpoint.

**From `print_server.py` (lines 270-315):** The endpoint accepts multipart `file` fields, optional `skip_selection` (string "true"/"1"), optional `mode` (dither mode), optional `blur`. It calls `run_pipeline()` which runs the full A->B->C pipeline: photo selection -> style transfer via n8n -> face-landmark zoom crops -> dithered printing at 4 zoom levels.

```typescript
async function uploadPortrait(
  posServerUrl: string,
  imageBlob: Blob,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'portrait.jpg');
  formData.append('skip_selection', 'true'); // Single image, no AI selection needed
  // mode and blur default to config.yaml values (bayer, blur=10)

  const url = `${posServerUrl.replace(/\/+$/, '')}/portrait/capture`;

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type -- browser sets multipart boundary automatically
    signal: AbortSignal.timeout(300_000), // 5 min: style transfer can take 30-180s
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Portrait upload failed ${res.status}: ${text}`);
  }
}
```

**Critical detail from POS server code:** The `run_pipeline` function (portrait_pipeline.py:389-420) runs synchronously on the Flask thread. The endpoint does NOT return until the entire pipeline completes (style transfer 30-180s + printing). This means the tablet's fetch call will hang for minutes. The tablet MUST fire-and-forget (catch errors, don't block UI).

### Pattern 5: Print Coordination

**What:** Definition card prints first, portrait prints second. Two independent paths.

**Current print flow (from App.tsx lines 119-128):**
1. `handleDefinitionReceived` fires -> calls `persistPrintJob(result, sessionId)` -> inserts into Supabase `print_queue`
2. Printer bridge picks up the job (Realtime subscription) -> POSTs to POS `/print/dictionary` -> card prints
3. Tablet dispatches `DEFINITION_READY` after 2s timeout -> transitions to `definition` screen -> `TIMER_10S` -> `printing` screen -> `PRINT_DONE` (after 30s `TIMERS.PRINT_TIMEOUT_MS`) -> `farewell`

**Portrait timing strategy:**
- Capture a frame during `conversation` screen (visitor is facing tablet, face is detected)
- Fire portrait upload AFTER `persistPrintJob` succeeds in `handleDefinitionReceived`
- The definition card prints almost immediately (bridge picks up in seconds, POS prints in seconds)
- The portrait upload takes 30-180s for style transfer -- definition card is already printed by then
- Natural timing ensures correct print order without explicit coordination

**Where to trigger:** Inside `handleDefinitionReceived` callback (App.tsx line 119-128), after `persistPrintJob`:
```typescript
// After persistPrintJob...
void captureAndUpload(); // Fire-and-forget portrait upload
```

Actually, capture should happen DURING conversation (better face framing), upload can be deferred to definition received. Store the captured blob in a ref.

**Better approach:** Capture frame ~5s into conversation (face is engaged), store as blob ref. Upload after definition is received. This separates capture timing from upload timing.

### Pattern 6: System Prompt Citation Improvement

**What:** Improve `buildTextTermPrompt` and `buildModeBlock` in `systemPrompt.ts` for better text citations.

**Current issues identified in actual code:**

1. **No line numbers in injected text** (`buildModeBlock`, lines 275-285): Text is injected raw between `---` markers. The LLM has no way to reference specific passages precisely.

2. **QUOTE move is vague** (line 71): `"QUOTE: Reference a specific line from the text. Ask what it means to them."` -- no format instruction, no example.

3. **No citation requirement** -- there's no explicit instruction to cite a minimum number of passages.

4. **Context text description is good** (lines 278-280): "This is a raw, stream-of-consciousness text -- rough, full of contradictions, full of humanity." -- keep this.

**Improvement approach:**

1. **Add paragraph numbers to injected text.** Create a helper function:
```typescript
function addParagraphNumbers(text: string): string {
  return text
    .split(/\n\n+/)
    .filter(p => p.trim().length > 0)
    .map((p, i) => `[${i + 1}] ${p.trim()}`)
    .join('\n\n');
}
```
Use in `buildModeBlock` for `text_term` case.

2. **Strengthen QUOTE move** (replace line 71):
```
- QUOTE: Read them a specific passage from the text by paragraph number.
  Say "In paragraph [N], the author writes: '...' " and then ask what
  it makes them think. Ground your question in the actual words.
```

3. **Add TEXT ENGAGEMENT minimum** -- add after the MOVES section:
```
TEXT ENGAGEMENT:
You MUST reference at least 2 specific paragraphs from the text during
the conversation. Use their paragraph numbers: "In paragraph [3], they
write..." This is not optional. The text is your shared ground with the
visitor. Use it.
```

4. **Keep prompt length manageable.** The current text_term prompt is ~158 lines (lines 30-158 of `buildTextTermPrompt`). The additions are roughly 8-10 lines net (replacing 1 QUOTE line with 3, adding 5 TEXT ENGAGEMENT lines). This stays well under any concerning length threshold.

### Anti-Patterns to Avoid

- **Multiple getUserMedia() calls on iOS:** iOS Safari mutes the previous stream. NEVER call getUserMedia a second time.
- **Setting Content-Type for FormData:** The browser must set the multipart boundary automatically. Manually setting Content-Type will break the upload.
- **Blocking the UI during portrait upload:** The POS server's `run_pipeline` runs synchronously (30-180s). The tablet MUST fire-and-forget.
- **Requesting getUserMedia with exact constraints:** Use `{ ideal: X }` not `{ exact: X }`.
- **Capturing portrait during sleep/welcome screens:** Camera may not have a clear face. Capture during `conversation` screen.
- **Adding too many prompt instructions:** Keep citation improvements concise. Replace vague with specific rather than adding entirely new sections.
- **Creating videoRef inside CameraDetector if it needs sharing:** Must lift to parent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image dithering | Custom JS dithering | POS server `portrait_pipeline.py` `_dither_image()` | Already implements bayer, floyd, halftone with proper blur and contrast |
| Face detection for crop | JS face landmark detection | POS server `detect_face_landmarks()` | Uses MediaPipe FaceMesh server-side for precise zoom crops |
| Style transfer | Custom image processing | POS server n8n webhook (`transform_to_statue()`) | Configured with Gemini 2.5 Flash Image, prompt in config.yaml |
| Photo selection | Custom comparison | POS server `select_best_photo()` | Uses OpenRouter vision model, not needed for single-shot |
| Zoom crop computation | Manual crop math | POS server `compute_zoom_crops()` | 4-level zoom (shoulders, face, eyes, strip) from landmarks |

**Key insight:** The POS server has the ENTIRE portrait pipeline (`portrait_pipeline.py`, 451 lines). The tablet's only job is: (1) capture a high-quality JPEG frame, (2) POST it. Everything else -- selection, style transfer, dithering, face-landmark zoom crops, multi-zoom printing -- is handled server-side.

## Common Pitfalls

### Pitfall 1: iOS Safari Stream Muting
**What goes wrong:** Calling getUserMedia() a second time mutes the first stream's tracks. Face detection stops working.
**Why it happens:** iOS Safari enforces single-stream-per-device. Second call auto-mutes the first (WebKit bug #179363).
**How to avoid:** Use a single getUserMedia() call. Share the videoRef between face detection and portrait capture. The current architecture already passes videoRef into useFaceDetection -- just need to also share it with usePortraitCapture.
**Warning signs:** Face detection suddenly stops detecting after portrait capture code is added.

### Pitfall 2: Black Image from Canvas on iOS
**What goes wrong:** `canvas.drawImage(video, ...)` produces a solid black image.
**Why it happens:** WebKit bug #237424 -- GPU Process canvas rendering can cause black frames. Also happens if video has not started playing or `readyState < HAVE_CURRENT_DATA`.
**How to avoid:** Check `video.readyState >= 2` AND `video.videoWidth > 0` before drawing. Add a size check on the resulting blob -- if < 1KB, it's likely black. Implement a retry with 100ms delay.
**Warning signs:** Portrait shows up as solid black on the printed card. Blob size is suspiciously small.

### Pitfall 3: Portrait Upload Timeout / UI Blocking
**What goes wrong:** The POS server `run_pipeline` (portrait_pipeline.py:389-420) is synchronous. The n8n style transfer takes 30-180s. If the tablet waits synchronously, it blocks screen transitions.
**Why it happens:** `transform_to_statue` calls `requests.post(webhook_url, ..., timeout=180)` (portrait_pipeline.py:116-124). The Flask endpoint returns only after the full pipeline completes.
**How to avoid:** Fire-and-forget from the tablet. Catch errors, log them, but never await the response in a way that blocks UI transitions. Use a long timeout (5 minutes) on the fetch but wrap in a void promise.
**Warning signs:** Visitor staring at a frozen printing screen. State machine not advancing.

### Pitfall 4: Camera Resolution Not Available
**What goes wrong:** Requesting 1280x960 on a device that only supports lower resolution.
**Why it happens:** Not all iPad cameras provide that resolution via getUserMedia. Some iOS devices cap at 720p.
**How to avoid:** Use `{ ideal: 1280 }` not `{ exact: 1280 }`. The browser picks the closest available. Even 640x480 is usable -- the thermal printer's paper width is 576px.
**Warning signs:** getUserMedia rejects the constraint (would only happen with `exact`).

### Pitfall 5: Missing VITE_POS_SERVER_URL Env Var
**What goes wrong:** The tablet has no configured POS server URL. Current `.env.example` has: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ELEVENLABS_API_KEY`, `VITE_ELEVENLABS_AGENT_ID`, `VITE_ELEVENLABS_VOICE_ID`, `VITE_BACKEND_URL`. No POS server URL.
**Why it happens:** The tablet previously never needed to talk to the POS server directly -- the printer-bridge handled everything.
**How to avoid:** Add `VITE_POS_SERVER_URL` to `.env.example` and `.env`. Default to empty string (portrait capture disabled). In `usePortraitCapture`, skip upload if URL is empty.
**Warning signs:** Portrait upload fails silently because URL is undefined.

### Pitfall 6: System Prompt Bloat
**What goes wrong:** Adding too many citation instructions dilutes other instructions.
**Why it happens:** The text_term prompt is already ~158 lines. LLMs degrade instruction following with excessive length.
**How to avoid:** Keep changes to ~10 lines net. Replace vague QUOTE move with specific one (same line count). Add TEXT ENGAGEMENT as a compact 3-line block. Do not add examples of good citations -- the model will figure it out from the numbered text.
**Warning signs:** Agent ignores one-question-per-turn rule or CRITICAL CONSTRAINT after prompt changes.

### Pitfall 7: CameraDetector Video Element Size
**What goes wrong:** Portrait capture produces usable frames but they're tiny.
**Why it happens:** The `<video>` element in CameraDetector has `width: 0, height: 0` styling. Canvas drawImage uses `video.videoWidth` and `video.videoHeight` (the stream's intrinsic dimensions), NOT the CSS dimensions. This is actually fine -- `video.videoWidth` reflects the actual camera resolution regardless of CSS sizing.
**How to avoid:** This is NOT actually a pitfall. Just verify by checking `video.videoWidth` and `video.videoHeight` are the expected resolution before capture.

## Code Examples

### Complete usePortraitCapture Hook

```typescript
// Source: project conventions (hooks/use{Name}.ts pattern)
import { useCallback, useRef, useState } from 'react';

interface UsePortraitCaptureOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  posServerUrl: string;
}

interface UsePortraitCaptureReturn {
  /** Capture a frame from the video. Returns the blob for deferred upload. */
  captureFrame: () => Promise<Blob | null>;
  /** Upload a previously captured blob to POS server. Fire-and-forget. */
  uploadPortrait: (blob: Blob) => Promise<void>;
  /** Convenience: capture + upload in one call. */
  captureAndUpload: () => Promise<void>;
  isCapturing: boolean;
  lastError: string | null;
}

export function usePortraitCapture({
  videoRef,
  posServerUrl,
}: UsePortraitCaptureOptions): UsePortraitCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      console.warn('[Portrait] Video not ready for capture');
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 1024) {
            resolve(blob);
          } else {
            console.warn('[Portrait] Captured blob too small, likely black frame');
            resolve(null);
          }
        },
        'image/jpeg',
        0.92,
      );
    });
  }, [videoRef]);

  const uploadPortrait = useCallback(async (blob: Blob): Promise<void> => {
    if (!posServerUrl) {
      console.warn('[Portrait] No POS server URL configured, skipping upload');
      return;
    }

    setIsCapturing(true);
    setLastError(null);

    try {
      const formData = new FormData();
      formData.append('file', blob, 'portrait.jpg');
      formData.append('skip_selection', 'true');

      const url = `${posServerUrl.replace(/\/+$/, '')}/portrait/capture`;

      const res = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(300_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Portrait upload failed ${res.status}: ${text}`);
      }

      console.log('[Portrait] Upload successful');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Portrait] Upload error:', msg);
      setLastError(msg);
    } finally {
      setIsCapturing(false);
    }
  }, [posServerUrl]);

  const captureAndUpload = useCallback(async (): Promise<void> => {
    const blob = await captureFrame();
    if (blob) {
      await uploadPortrait(blob);
    }
  }, [captureFrame, uploadPortrait]);

  return { captureFrame, uploadPortrait, captureAndUpload, isCapturing, lastError };
}
```

### CameraDetector with Shared VideoRef

```typescript
// Source: existing CameraDetector.tsx, modified
interface CameraDetectorProps {
  onWake: () => void;
  onSleep: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>; // NEW: shared ref
}

export function CameraDetector({ onWake, onSleep, videoRef }: CameraDetectorProps) {
  // Remove: const videoRef = useRef<HTMLVideoElement | null>(null);
  const { error, cameraReady } = useFaceDetection({ videoRef, onWake, onSleep });
  // ... rest unchanged
}
```

### Text Injection with Paragraph Numbers

```typescript
// Source: prompt engineering best practice for citation grounding
function addParagraphNumbers(text: string): string {
  return text
    .split(/\n\n+/)
    .filter(p => p.trim().length > 0)
    .map((p, i) => `[${i + 1}] ${p.trim()}`)
    .join('\n\n');
}
```

Used in `buildModeBlock` for the `text_term` case:
```typescript
case 'text_term':
  return `A visitor has just finished reading the following text.
Each paragraph is numbered for reference:
---
${addParagraphNumbers(contextText ?? '')}
---
This is a raw, stream-of-consciousness text -- rough, full of contradictions,
full of humanity. The visitor has been sitting with these words.
...`;
```

### Strengthened QUOTE Move

```
- QUOTE: Read them a specific passage by paragraph number.
  Say "In paragraph [N], the author writes: '...' " then ask what it
  stirs in them. Ground your question in the author's actual words.
```

### TEXT ENGAGEMENT Addition

```
TEXT ENGAGEMENT:
You MUST reference at least 2 specific paragraphs during the conversation.
Use paragraph numbers: "In paragraph [3]..." The text is your shared ground.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ImageCapture API (takePhoto) | Canvas drawImage + toBlob | Safari never supported ImageCapture | Must use canvas approach for iOS compatibility |
| Multiple getUserMedia() calls | Single stream, shared via videoRef | iOS constraint since early Safari WebRTC | One stream for all camera consumers |
| Vague "reference the text" prompts | Numbered-paragraph injection + explicit citation format | LLM citation research 2024-2025 | Dramatically improves citation specificity |

**Deprecated/outdated:**
- ImageCapture API: Not available on Safari/iOS Safari as of March 2026. Do not attempt to use it.
- HTMLMediaElement.captureStream(): Not supported on Safari. Irrelevant for still capture anyway.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (in vite.config.ts) |
| Config file | apps/tablet/vite.config.ts |
| Quick run command | `pnpm --filter @meinungeheuer/tablet exec vitest run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R7-a | captureFrame returns Blob from video element | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts -x` | Wave 0 |
| R7-b | captureFrame returns null if video not ready | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts -x` | Wave 0 |
| R7-c | uploadPortrait sends FormData to POS server | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts -x` | Wave 0 |
| R7-d | uploadPortrait skips if no POS URL configured | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts -x` | Wave 0 |
| R7-e | CameraDetector accepts external videoRef | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/components/CameraDetector.test.ts -x` | Wave 0 |
| R8-a | text_term prompt includes numbered paragraphs | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Exists (extend) |
| R8-b | text_term prompt contains citation format instructions | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Exists (extend) |
| R8-c | QUOTE move references paragraph numbers | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Exists (extend) |
| R8-d | addParagraphNumbers correctly numbers paragraphs | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @meinungeheuer/tablet exec vitest run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/tablet/src/hooks/usePortraitCapture.test.ts` -- covers R7-a, R7-b, R7-c, R7-d
- [ ] Extend `apps/tablet/src/lib/systemPrompt.test.ts` -- covers R8-a through R8-d (file exists, needs new tests)
- [ ] `VITE_POS_SERVER_URL` in `.env.example` -- needed for portrait upload

## Open Questions

1. **iPad Camera Resolution via getUserMedia**
   - What we know: iPad front cameras typically support up to 720p or 1080p via getUserMedia, but Safari may cap at 720p for some devices. Using `ideal` constraints always succeeds.
   - What's unclear: Exact resolution the target iPad will provide when requesting 1280x960.
   - Recommendation: Use `{ ideal: 1280, ideal: 960 }` and log the actual `video.videoWidth` x `video.videoHeight` obtained. Even 640x480 produces a usable thermal portrait (576px paper width).

2. **Portrait Capture Timing**
   - What we know: Face is most reliably facing the tablet during `conversation` screen. Style transfer takes 30-180s.
   - What's unclear: Whether to capture once early or multiple times.
   - Recommendation: Capture a single frame ~5-10 seconds into the conversation screen (after initial face detection confirms presence). Store the blob in a ref. Upload after definition is received. This gives the best face framing without complexity.

3. **Print Order Coordination**
   - What we know: Definition prints via Supabase print_queue -> bridge -> POS `/print/dictionary`. Portrait prints via direct POST -> POS `/portrait/capture`. These are independent paths.
   - What's unclear: Whether the POS server can handle concurrent print jobs (definition printing while portrait pipeline runs).
   - Recommendation: The POS server uses a `_print_lock` mutex (print_server.py:65). The definition card will finish printing before the portrait pipeline completes its style transfer (30-180s vs ~2s). The lock ensures they don't overlap on the printer hardware. Natural timing handles this.

4. **VITE_POS_SERVER_URL Discovery**
   - What we know: In the installation, tablet and POS server are on the same local network. The POS server registers mDNS (print_server.py:390-415) as `POS Thermal Printer._http._tcp.local.`.
   - What's unclear: Whether to use mDNS discovery from the browser or just hardcode the URL in env.
   - Recommendation: Use `VITE_POS_SERVER_URL` env var (e.g., `http://192.168.1.50:9100`). mDNS discovery from browser JS is not straightforward. The env var approach matches how `VITE_BACKEND_URL` already works. If the URL is empty/unset, portrait capture is silently disabled.

## Sources

### Primary (HIGH confidence)
- `apps/pos-server/print_server.py` (lines 270-315) -- verified `/portrait/capture` endpoint: accepts multipart files, optional `skip_selection`/`mode`/`blur` params, calls `run_pipeline()`, returns synchronously after full pipeline
- `apps/pos-server/portrait_pipeline.py` (451 lines) -- verified full pipeline: `select_best_photo` -> `transform_to_statue` (n8n webhook, 180s timeout) -> `detect_face_landmarks` -> `compute_zoom_crops` (4 levels) -> `print_portrait`
- `apps/tablet/src/hooks/useFaceDetection.ts` (245 lines) -- verified: requests 320x240 (line 93-94), stores stream in `streamRef` (line 112), does not expose stream, detection at 2fps via setInterval (line 164), CPU delegate (line 140)
- `apps/tablet/src/components/CameraDetector.tsx` (56 lines) -- verified: creates own `videoRef` (line 23), renders hidden video element with zero dimensions
- `apps/tablet/src/lib/systemPrompt.ts` (302 lines) -- verified: text injected raw without numbering (lines 275-285), QUOTE move vague (line 71), no citation minimum
- `apps/tablet/src/App.tsx` (311 lines) -- verified: `handleDefinitionReceived` calls `persistPrintJob` then `DEFINITION_READY` after 2s, CameraDetector at root with `onWake`/`onSleep`
- `apps/pos-server/config.yaml` -- verified: portrait.n8n_webhook_url, portrait.blur=10, portrait.dither_mode=bayer, portrait.style_prompt (full wax-statue prompt)

### Secondary (MEDIUM confidence)
- [WebKit Bug #179363](https://bugs.webkit.org/show_bug.cgi?id=179363) -- iOS getUserMedia() muting confirmed
- [WebKit Bug #237424](https://bugs.webkit.org/show_bug.cgi?id=237424) -- Canvas drawImage black frame on GPU Process
- [caniuse.com/imagecapture](https://caniuse.com/imagecapture) -- ImageCapture NOT supported in any Safari version
- [MDN Taking still photos with getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos) -- Canvas drawImage is the standard approach
- [Getting Started With getUserMedia in 2026](https://blog.addpipe.com/getusermedia-getting-started/) -- iOS resolution caps and stream muting behavior

### Tertiary (LOW confidence)
- [Apple Developer Forums iOS 16 black image issue](https://developer.apple.com/forums/thread/708348) -- Canvas drawImage can produce black frames; may be resolved in recent iOS versions but worth defensive coding
- [Exploring LLM Citation Generation In 2025](https://medium.com/@prestonblckbrn/exploring-llm-citation-generation-in-2025-4ac7c8980794) -- Citation grounding techniques with numbered references

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all browser-native APIs, well-documented, verified compatibility. No new packages needed.
- Architecture: HIGH - POS server endpoint verified in source code. Camera sharing pattern confirmed necessary by iOS Safari constraints. Current code structure analyzed line-by-line.
- Pitfalls: HIGH - iOS Safari constraints well-documented in WebKit bug tracker. Black frame issue has known detection/retry strategy. POS server synchronous behavior verified in source code.
- System prompt: MEDIUM - prompt engineering is inherently empirical. Numbered-paragraph technique is well-supported in LLM research but actual citation quality improvement must be tested with real conversations.

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, browser APIs change slowly)
