---
phase: 04-portrait-end-to-end-polish
plan: 01
subsystem: ui
tags: [canvas-api, camera, formdata, portrait-capture, react-hooks, ios-safari]

# Dependency graph
requires:
  - phase: 03-printer-integration
    provides: POS server with /portrait/capture endpoint
provides:
  - usePortraitCapture hook (captureFrame, uploadPortrait, captureAndUpload)
  - Shared videoRef architecture between face detection and portrait capture
  - Camera resolution upgraded to 1280x960
  - Portrait capture wired into App.tsx conversation flow
affects: [04-02, portrait-printing, pos-server-integration]

# Tech tracking
tech-stack:
  added: [@testing-library/react (dev)]
  patterns: [shared-videoRef, callback-ref-bridge, fire-and-forget-upload, deferred-blob-upload]

key-files:
  created:
    - apps/tablet/src/hooks/usePortraitCapture.ts
    - apps/tablet/src/hooks/usePortraitCapture.test.ts
  modified:
    - apps/tablet/src/App.tsx
    - apps/tablet/src/components/CameraDetector.tsx
    - apps/tablet/src/hooks/useFaceDetection.ts
    - apps/tablet/.env.example

key-decisions:
  - "Shared videoRef lifted to App.tsx to avoid second getUserMedia call (iOS Safari stream-muting)"
  - "Portrait captured 5s into conversation screen for best face framing"
  - "Upload deferred to handleDefinitionReceived for natural print ordering (definition first, portrait second)"
  - "Callback ref in CameraDetector to bridge React 18 RefObject<T | null> typing with JSX ref prop"

patterns-established:
  - "SharedVideoRef: Single camera stream shared via ref between face detection and portrait capture"
  - "DeferredBlobUpload: Capture frame early, store in ref, upload later when timing is right"
  - "FireAndForget: Portrait upload never blocks UI (POS pipeline takes 30-180s)"

requirements-completed: [R7]

# Metrics
duration: 39min
completed: 2026-03-09
---

# Phase 04 Plan 01: Portrait Capture Pipeline Summary

**Canvas-based portrait frame capture from shared camera stream with fire-and-forget FormData POST to POS server /portrait/capture endpoint**

## Performance

- **Duration:** 39 min
- **Started:** 2026-03-09T10:27:22Z
- **Completed:** 2026-03-09T11:06:22Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- usePortraitCapture hook with captureFrame (Canvas drawImage + toBlob), uploadPortrait (FormData POST), and captureAndUpload
- 10 unit tests covering blob capture, black frame rejection (<1KB), FormData POST structure, skip-when-no-URL, isCapturing state, lastError on failure
- Camera resolution upgraded from 320x240 to 1280x960 ideal (MediaPipe internally downscales, negligible CPU impact)
- CameraDetector refactored to accept external videoRef (avoids second getUserMedia on iOS)
- Portrait captured 5s into conversation, uploaded after definition received (natural print ordering)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create usePortraitCapture hook + upgrade camera architecture** - `e520766` (feat)
2. **Task 2: Wire portrait capture into App.tsx flow** - `98a04f7` (feat)

## Files Created/Modified
- `apps/tablet/src/hooks/usePortraitCapture.ts` - Hook: captureFrame, uploadPortrait, captureAndUpload
- `apps/tablet/src/hooks/usePortraitCapture.test.ts` - 10 unit tests for portrait capture hook
- `apps/tablet/src/App.tsx` - Shared videoRef, portrait capture wiring, deferred upload in handleDefinitionReceived
- `apps/tablet/src/components/CameraDetector.tsx` - Accepts external videoRef prop, callback ref for React 18 typing
- `apps/tablet/src/hooks/useFaceDetection.ts` - Camera resolution upgraded to 1280x960, resolution logging
- `apps/tablet/.env.example` - Added VITE_POS_SERVER_URL
- `apps/tablet/package.json` - @testing-library/react added as dev dependency

## Decisions Made
- **Shared videoRef architecture:** Lifted videoRef from CameraDetector to App.tsx so both face detection and portrait capture read from the same camera stream. iOS Safari mutes the first stream if getUserMedia is called again (WebKit bug #179363).
- **Callback ref bridge:** React 18 @types/react doesn't accept `RefObject<T | null>` on intrinsic element `ref` props. Used a callback ref in CameraDetector that writes to the shared RefObject.
- **5-second capture delay:** Portrait frame captured after 5s on conversation screen -- visitor is facing tablet, face is engaged. Blob stored in ref for deferred upload.
- **Fire-and-forget upload:** Portrait upload dispatched in handleDefinitionReceived after persistPrintJob. POS server pipeline runs 30-180s synchronously, so definition card naturally prints first. Upload never awaited in a way that could block UI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] React 18 RefObject typing incompatibility**
- **Found during:** Task 2 (Wire portrait capture into App.tsx)
- **Issue:** `RefObject<HTMLVideoElement | null>` not assignable to JSX `ref` prop's `LegacyRef<HTMLVideoElement>` in React 18 types
- **Fix:** Added callback ref in CameraDetector that bridges the typing by casting to MutableRefObject
- **Files modified:** apps/tablet/src/components/CameraDetector.tsx
- **Verification:** `pnpm typecheck` passes cleanly
- **Committed in:** 98a04f7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for React 18 type compatibility. No scope creep.

## Issues Encountered
- Vitest in this project version does not support the `-x` flag (bail-on-first-failure); used default run mode instead
- happy-dom does not preserve File name from FormData.append third argument; adjusted test assertion to check Blob instance instead of filename

## User Setup Required
None - VITE_POS_SERVER_URL defaults to empty (portrait capture disabled). Set it when POS server is available.

## Next Phase Readiness
- Portrait capture pipeline complete, ready for end-to-end testing with POS server
- Plan 04-02 (system prompt citation improvements) can proceed independently
- Full verification requires POS server running on the local network

## Self-Check: PASSED

All 7 files verified present. Both task commits (e520766, 98a04f7) verified in git log.

---
*Phase: 04-portrait-end-to-end-polish*
*Completed: 2026-03-09*
