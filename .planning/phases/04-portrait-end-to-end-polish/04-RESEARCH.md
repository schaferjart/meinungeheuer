# Phase 4: Portrait + End-to-End Polish - Research

**Researched:** 2026-03-09
**Domain:** Browser camera capture, Canvas API, POS server portrait pipeline, system prompt engineering
**Confidence:** HIGH

## Summary

Phase 4 has two distinct workstreams: (1) portrait capture from the tablet camera and delivery to the POS server for dithered thermal printing, and (2) improving the Mode A system prompt for better text citations. Both are well-supported by existing infrastructure.

The portrait capture is the more technically nuanced task. The POS server already has a fully implemented `/portrait/capture` endpoint with a sophisticated pipeline (AI-based photo selection, n8n style transfer to wax-statue aesthetic, face-landmark zoom crops, dithered printing). The missing piece is the tablet-side: capturing a high-resolution frame from the camera during conversation and POSTing it. The critical constraint is that **iOS Safari does not support multiple getUserMedia() calls** -- the second call mutes the first stream. The solution is to request a single higher-resolution stream at init and share it between face detection (which only needs 320x240) and portrait capture (which needs the highest resolution available). The current `useFaceDetection` hook requests 320x240; this must be upgraded to request higher resolution, with face detection receiving downscaled frames and portrait capture drawing from the full-resolution stream.

The system prompt improvement (R8) is primarily a prompt engineering task. The current text_term prompt already has a QUOTE move and instructions to reference the text, but lacks explicit instruction to cite specific lines with enough precision. Adding numbered lines or paragraph markers to the injected text, plus explicit instructions to quote with line references, will significantly improve citation specificity.

**Primary recommendation:** Share a single high-resolution camera stream between face detection and portrait capture. Use Canvas drawImage + toBlob for frame capture. POST as multipart/form-data to the existing POS `/portrait/capture` endpoint.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R7 | Portrait Capture and Print: Capture visitor face from tablet camera during conversation (Canvas API to blob). POST to POS server `/portrait/capture`. Print dithered portrait on thermal card alongside definition. | Camera stream sharing pattern, Canvas drawImage + toBlob approach, existing POS `/portrait/capture` endpoint, print coordination via state machine |
| R8 | Improve Agent Text Context: Review and improve system prompt for Mode A (text_term). Agent should make specific citations from the text, reference passages, and demonstrate genuine textual understanding. | Prompt engineering patterns for citation grounding, numbered-line injection technique, QUOTE move reinforcement |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Already in apps/tablet |
| Canvas API | native | Frame capture from video | Only cross-browser approach for still capture from getUserMedia on Safari |
| Fetch API | native | POST image to POS server | Standard browser HTTP client |
| FormData | native | Multipart file upload | Required for `/portrait/capture` endpoint |
| MediaPipe | 0.10.32 | Face detection | Already used in useFaceDetection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @mediapipe/tasks-vision | 0.10.32 | Face detection WASM runtime | Already installed, used for wake/sleep detection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas drawImage + toBlob | ImageCapture API (takePhoto) | NOT viable -- Safari/iOS does not support ImageCapture API at all (verified via caniuse.com). Canvas is the only option. |
| Single shared stream | Two getUserMedia() calls | NOT viable -- iOS Safari mutes the first stream when a second getUserMedia() is called. Must share one stream. |
| MediaStream.clone() | Second getUserMedia() | clone() is the correct iOS workaround for multiple consumers of the same camera |

**Installation:** No new packages needed. All required APIs are browser-native.

## Architecture Patterns

### Recommended Approach: Shared Camera Stream

```
                    getUserMedia (1280x960)
                            |
                    Single MediaStream
                     /              \
            clone() for           Original for
          face detection         portrait capture
         (320x240 via           (full resolution
          detectForVideo)        drawImage to canvas)
```

### Pattern 1: Camera Stream Upgrade and Sharing

**What:** Request a single camera stream at higher resolution (1280x960 ideal), share it between face detection (which processes at whatever resolution the video provides -- MediaPipe handles downscaling internally) and portrait capture (which draws the full frame to a canvas).

**When to use:** Always -- this is the only approach that works on iOS Safari.

**Key insight:** The current `useFaceDetection` requests `{ width: { ideal: 320 }, height: { ideal: 240 } }`. Upgrading to `{ width: { ideal: 1280 }, height: { ideal: 960 } }` will get a higher-res stream. MediaPipe face detection handles arbitrary input sizes (it internally resizes). The increased resolution is needed for portrait quality but should NOT noticeably impact face detection performance since detection runs at 2fps (500ms interval) and MediaPipe's blaze_face_short_range model is optimized for variable input.

**Implementation approach:**
```typescript
// In useFaceDetection.ts -- upgrade resolution request
stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 960 },
  },
  audio: false,
});
```

**Expose the stream:** The hook currently stores the stream in `streamRef` but does not expose it. Add the stream to the return value or expose the videoRef so that the portrait capture hook can read frames from the same video element.

### Pattern 2: Canvas Frame Capture (Safari-Compatible)

**What:** Draw a video frame to an offscreen canvas, convert to Blob, wrap in FormData, POST to POS server.

**When to use:** For capturing portrait snapshot during conversation.

**Example:**
```typescript
// Source: MDN Taking still photos with getUserMedia()
async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      0.92, // High quality JPEG
    );
  });
}
```

### Pattern 3: Portrait Upload to POS Server

**What:** POST the captured frame as multipart/form-data to `/portrait/capture`.

**Example:**
```typescript
// Source: POS server print_server.py /portrait/capture endpoint
async function uploadPortrait(
  posServerUrl: string,
  imageBlob: Blob,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'portrait.jpg');
  formData.append('skip_selection', 'true'); // Single image, no AI selection needed
  formData.append('mode', 'bayer'); // Match config.yaml portrait.dither_mode

  const url = `${posServerUrl.replace(/\/+$/, '')}/portrait/capture`;

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type -- browser sets multipart boundary automatically
    signal: AbortSignal.timeout(180_000), // Style transfer can take up to 3 minutes
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Portrait upload failed ${res.status}: ${text}`);
  }
}
```

### Pattern 4: Print Coordination (Definition First, Then Portrait)

**What:** The current flow already enqueues a print job via `persistPrintJob` when `DEFINITION_RECEIVED` fires. Portrait printing needs to happen after or alongside. The POS server's `/portrait/capture` endpoint handles its own printing (it calls `print_portrait` which sends directly to the printer, not through the print_queue). So the coordination is: tablet enqueues definition print job (via Supabase print_queue) -> bridge prints definition card -> tablet POSTs portrait to POS server -> POS server prints portrait directly.

**When to use:** Always. The portrait printing is independent of the Supabase print_queue -- it goes directly to the POS server.

**Timing:** Capture the portrait frame during conversation (any time a face is detected). Upload after definition is saved but while the user sees the definition/printing screens. This gives the style transfer pipeline time to process (~30-180 seconds).

### Pattern 5: System Prompt Citation Improvement

**What:** Improve the text_term system prompt so the agent makes specific text citations.

**Implementation approach:**
1. Add line numbers to injected text (split by sentences/paragraphs, prefix with `[1]`, `[2]`, etc.)
2. Strengthen the QUOTE move with explicit instruction: "When you quote, cite by line number: 'In line [3], the author writes...' "
3. Add a new section: "TEXT ENGAGEMENT RULES: You must reference at least 2 specific lines from the text during the conversation. Do not paraphrase -- quote directly."
4. Add example quotes from the actual text to show the model what good citations look like.

### Anti-Patterns to Avoid
- **Multiple getUserMedia() calls on iOS:** iOS Safari mutes the previous stream. NEVER call getUserMedia a second time.
- **Setting Content-Type for FormData:** The browser must set the multipart boundary automatically. Manually setting Content-Type will break the upload.
- **Blocking the UI during portrait upload:** The style transfer takes 30-180 seconds. Upload must be fire-and-forget from the tablet's perspective.
- **Requesting getUserMedia with exact constraints:** Use `{ ideal: X }` not `{ exact: X }` -- exact constraints will fail if the device cannot match exactly.
- **Capturing portrait too early (during sleep/welcome):** Camera may not have a clear face yet. Capture during the `conversation` screen when the visitor is actively engaged and facing the tablet.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image dithering for thermal print | Custom dithering in JS | POS server's `portrait_pipeline.py` | Already implements bayer, floyd, halftone dithering with proper blur and contrast |
| Face detection for crop | JS face landmark detection | POS server's `detect_face_landmarks()` | Already uses MediaPipe FaceMesh on the server side for zoom crops |
| Style transfer | Custom image processing | POS server's n8n webhook pipeline | Already configured with Gemini 2.5 Flash Image via n8n |
| Photo selection from multiple shots | Custom comparison logic | POS server's `select_best_photo()` | Already uses OpenRouter vision model |

**Key insight:** The POS server already has the entire portrait pipeline implemented. The tablet's only job is: (1) capture a high-quality frame, (2) POST it. Everything else (style transfer, dithering, face-landmark zoom crops, printing at multiple zoom levels) is handled server-side.

## Common Pitfalls

### Pitfall 1: iOS Safari Stream Muting
**What goes wrong:** Calling getUserMedia() a second time mutes the first stream's tracks. Face detection stops working.
**Why it happens:** iOS Safari enforces single-stream-per-device. Second call auto-mutes the first.
**How to avoid:** Use a single getUserMedia() call. Share the stream (or its video element) between face detection and portrait capture. Use `stream.clone()` if needed.
**Warning signs:** Face detection suddenly stops working after portrait capture is added.

### Pitfall 2: Black Image from Canvas on iOS
**What goes wrong:** `canvas.drawImage(video, ...)` produces a solid black image.
**Why it happens:** Known iOS bug where GPU rendering can cause black frames. Also happens if video has not started playing or readyState < HAVE_CURRENT_DATA.
**How to avoid:** Ensure `video.readyState >= 2` before drawing. Use `video.videoWidth > 0` as additional check. Consider a small delay or retry if first capture is blank.
**Warning signs:** Portrait shows up as solid black on the printed card.

### Pitfall 3: Portrait Upload Timeout
**What goes wrong:** The n8n style transfer pipeline takes 30-180 seconds. If the tablet waits synchronously, it blocks the UI.
**Why it happens:** Gemini 2.5 Flash Image generation is slow.
**How to avoid:** Fire-and-forget from the tablet. The POS server handles the entire pipeline and prints directly. The tablet should not wait for a response (or use a long timeout with no UI blocking).
**Warning signs:** User staring at a frozen "printing" screen for minutes.

### Pitfall 4: Camera Resolution Not Available
**What goes wrong:** Requesting 1280x960 on a device that only supports lower resolution.
**Why it happens:** Not all iPad cameras provide that resolution via getUserMedia.
**How to avoid:** Use `{ ideal: 1280 }` not `{ exact: 1280 }`. The browser will pick the closest available resolution. Even 640x480 is usable for a thermal portrait (576px paper width).
**Warning signs:** getUserMedia rejects the constraint.

### Pitfall 5: System Prompt Too Long
**What goes wrong:** Adding too many citation instructions bloats the prompt beyond the context window or dilutes other instructions.
**Why it happens:** The text_term prompt is already ~180 lines. Adding more risks instruction following degradation.
**How to avoid:** Keep citation improvements concise. Replace existing vague instructions with specific ones rather than adding new sections. The QUOTE move already exists -- strengthen it rather than adding a new move.
**Warning signs:** Agent ignores other instructions (like one-question-per-turn) after prompt changes.

## Code Examples

### Complete usePortraitCapture Hook Shape

```typescript
// Source: project conventions (hooks/use{Name}.ts pattern)
import { useCallback, useRef } from 'react';

interface UsePortraitCaptureOptions {
  /** The same video element used by face detection */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** POS server base URL */
  posServerUrl: string;
}

interface UsePortraitCaptureReturn {
  /** Capture a frame and upload it. Fire-and-forget. */
  captureAndUpload: () => Promise<void>;
  /** Whether a capture/upload is in progress */
  isCapturing: boolean;
  /** Last error, or null */
  error: string | null;
}

export function usePortraitCapture(opts: UsePortraitCaptureOptions): UsePortraitCaptureReturn {
  // Implementation:
  // 1. Check video.readyState >= 2 && video.videoWidth > 0
  // 2. Create offscreen canvas at video.videoWidth x video.videoHeight
  // 3. ctx.drawImage(video, 0, 0)
  // 4. canvas.toBlob(cb, 'image/jpeg', 0.92)
  // 5. FormData.append('file', blob, 'portrait.jpg')
  // 6. FormData.append('skip_selection', 'true')
  // 7. fetch(posServerUrl + '/portrait/capture', { method: 'POST', body: formData })
  // 8. Log result, do not throw (fire-and-forget)
}
```

### Camera Resolution Upgrade in useFaceDetection

```typescript
// Source: existing useFaceDetection.ts, line 90-95
// Change from:
video: {
  facingMode: 'user',
  width: { ideal: 320 },
  height: { ideal: 240 },
}
// To:
video: {
  facingMode: 'user',
  width: { ideal: 1280 },
  height: { ideal: 960 },
}
```

### CameraDetector Exposing Video Ref for Portrait Capture

```typescript
// Source: project pattern (CameraDetector.tsx)
// Option A: Pass videoRef from parent
interface CameraDetectorProps {
  onWake: () => void;
  onSleep: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>; // NEW: shared ref
}
```

### Text Injection with Line Numbers

```typescript
// Source: prompt engineering best practice for citation grounding
function addLineNumbers(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map((p, i) => `[${i + 1}] ${p.trim()}`)
    .join('\n\n');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ImageCapture API (takePhoto) | Canvas drawImage + toBlob | Safari never supported ImageCapture | Must use canvas approach for iOS compatibility |
| Multiple getUserMedia() calls | Single stream, shared or cloned | iOS constraint since early Safari WebRTC | One stream for all camera consumers |
| Vague "reference the text" prompts | Numbered-line injection + explicit citation instructions | LLM citation research 2024-2025 | Dramatically improves citation specificity |

**Deprecated/outdated:**
- ImageCapture API: Not available on Safari/iOS as of Safari 26.4 (March 2026). Do not attempt to use it.
- HTMLMediaElement.captureStream(): Also not supported on Safari. Irrelevant for still capture anyway.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 |
| Config file | apps/tablet/vite.config.ts (Vitest uses Vite config) |
| Quick run command | `pnpm --filter @meinungeheuer/tablet exec vitest run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R7-a | captureFrame returns Blob from video element | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts -x` | Wave 0 |
| R7-b | uploadPortrait sends FormData to POS server | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts -x` | Wave 0 |
| R7-c | Portrait capture skips if video not ready | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts -x` | Wave 0 |
| R7-d | CameraDetector shares videoRef for portrait | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/components/CameraDetector.test.ts -x` | Wave 0 |
| R8-a | text_term prompt includes line-numbered text | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Exists (extend) |
| R8-b | text_term prompt contains citation instructions | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @meinungeheuer/tablet exec vitest run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/tablet/src/hooks/usePortraitCapture.test.ts` -- covers R7-a, R7-b, R7-c
- [ ] Extend `apps/tablet/src/lib/systemPrompt.test.ts` -- covers R8-a, R8-b (file exists, needs new tests)

## Open Questions

1. **iPad Camera Resolution via getUserMedia**
   - What we know: iPad front cameras typically support up to 1920x1080 via getUserMedia, but the actual resolution depends on the device model and iOS version.
   - What's unclear: Whether upgrading from 320x240 to 1280x960 will cause any noticeable performance impact on the specific target iPad (face detection runs at 2fps).
   - Recommendation: Use `{ ideal: 1280 }` and measure. If performance degrades, cap at 640x480 which is still sufficient for 576px-wide thermal prints.

2. **POS Server URL from Tablet**
   - What we know: The tablet currently has no POS server URL configured. The printer-bridge connects to POS via `POS_SERVER_URL` env var, but the tablet has no direct connection to the POS server.
   - What's unclear: Whether to add a `VITE_POS_SERVER_URL` env var to the tablet, or route portrait uploads through the printer bridge, or through Supabase storage.
   - Recommendation: Add `VITE_POS_SERVER_URL` to the tablet env. The tablet and POS server run on the same local network during installation. This is the simplest path -- direct POST from tablet to POS server, matching how the printer-bridge already works.

3. **Portrait Capture Timing**
   - What we know: The portrait should be captured during conversation when the visitor is facing the tablet. The style transfer takes 30-180 seconds.
   - What's unclear: Whether to capture once early in the conversation or take multiple shots and let the POS server's AI select the best one.
   - Recommendation: Capture a single good frame during the conversation screen (after a few seconds of stable face detection). The POS server supports multiple files but single-shot with `skip_selection=true` is simpler and avoids unnecessary API costs. A single high-quality JPEG capture is sufficient.

4. **Print Order Coordination**
   - What we know: Definition prints via Supabase print_queue -> bridge -> POS `/print/dictionary`. Portrait prints via direct POST to POS `/portrait/capture`.
   - What's unclear: How to ensure definition card prints before portrait. The two paths are independent.
   - Recommendation: Fire portrait upload AFTER `persistPrintJob` call succeeds. The print_queue flow is fast (bridge picks up within seconds), while portrait style transfer takes 30+ seconds. Natural timing ensures definition prints first.

## Sources

### Primary (HIGH confidence)
- POS server source code (`apps/pos-server/print_server.py`, `portrait_pipeline.py`) -- verified `/portrait/capture` endpoint accepts multipart files, supports `skip_selection` and `mode` params
- Existing codebase (`useFaceDetection.ts`, `CameraDetector.tsx`, `App.tsx`, `persist.ts`) -- verified current camera stream setup, state machine flow, print job persistence
- MDN HTMLCanvasElement.toBlob() -- verified browser support

### Secondary (MEDIUM confidence)
- [caniuse.com/imagecapture](https://caniuse.com/imagecapture) -- ImageCapture NOT supported in Safari/iOS Safari (verified as of Safari 26.4)
- [MDN Taking still photos with getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos) -- Canvas drawImage approach is the standard
- [webrtcHacks: 5 ways to save an image from webcam](https://webrtchacks.com/still-image-from-webcam-stream-approaches/) -- Canvas toBlob is universally supported
- [Getting Started With getUserMedia in 2026](https://blog.addpipe.com/getusermedia-getting-started/) -- iOS stream muting behavior confirmed
- [Exploring LLM Citation Generation In 2025](https://medium.com/@prestonblckbrn/exploring-llm-citation-generation-in-2025-4ac7c8980794) -- Citation grounding techniques

### Tertiary (LOW confidence)
- [Apple Developer Forums iOS 16 black image issue](https://developer.apple.com/forums/thread/708348) -- Canvas drawImage can produce black frames on iOS; may be fixed in recent versions but worth defensive coding

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all browser-native APIs, well-documented, verified compatibility
- Architecture: HIGH - POS server endpoint already exists and is tested; camera sharing pattern is well-established for iOS
- Pitfalls: HIGH - iOS Safari constraints are well-documented; black frame issue confirmed by Apple forums
- System prompt: MEDIUM - prompt engineering is inherently empirical; citation improvement patterns are based on general LLM research

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, browser APIs change slowly)
