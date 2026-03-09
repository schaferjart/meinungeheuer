---
phase: 02-pwa-fullscreen-face-detection
plan: 01
subsystem: ui
tags: [pwa, standalone, fullscreen, manifest, kiosk, ipad, face-detection, audio-unlock]

# Dependency graph
requires:
  - phase: 01-conversation-fix-sdk-migration
    provides: "Working ElevenLabs SDK and conversation loop"
provides:
  - "isStandaloneMode() detection for PWA vs browser context"
  - "Conditional requestFullscreen() (no-op in standalone mode)"
  - "Corrected manifest.json with display:standalone"
  - "viewport-fit=cover for iOS status bar blending"
  - "audioUnlock utility for iOS audio autoplay after first tap"
affects: [04-portrait-end-to-end, face-detection, kiosk-deployment]

# Tech tracking
tech-stack:
  added: [jsdom]
  patterns: [standalone-detection, conditional-fullscreen, audio-unlock-on-gesture]

key-files:
  created:
    - apps/tablet/src/lib/fullscreen.test.ts
    - apps/tablet/src/lib/audioUnlock.ts
  modified:
    - apps/tablet/src/lib/fullscreen.ts
    - apps/tablet/public/manifest.json
    - apps/tablet/index.html
    - apps/tablet/src/index.css
    - apps/tablet/src/components/screens/SleepScreen.tsx
    - apps/tablet/src/components/screens/WelcomeScreen.tsx

key-decisions:
  - "PWA standalone mode detection via navigator.standalone + matchMedia, not Fullscreen API"
  - "viewport-fit=cover with 100dvh for iOS safe area handling"
  - "Audio unlock on first user gesture enables autonomous audio for subsequent visitor cycles"

patterns-established:
  - "Standalone detection: use isStandaloneMode() before calling browser-specific APIs"
  - "iOS audio unlock: resume AudioContext + silent buffer on user gesture"

requirements-completed: [R3, R4]

# Metrics
duration: ~45min
completed: 2026-03-09
---

# Phase 2 Plan 01: PWA Standalone + Kiosk Verification Summary

**PWA standalone detection with conditional fullscreen, viewport-fit=cover for iOS status bar, and audio unlock utility for autonomous kiosk operation**

## Performance

- **Duration:** ~45 min (across multiple sessions)
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09T01:30:00Z
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 10

## Accomplishments
- `isStandaloneMode()` detects PWA standalone mode via `navigator.standalone` (iOS) and `matchMedia` (cross-platform)
- `requestFullscreen()` becomes a no-op in standalone mode, preventing errors in PWA context
- `manifest.json` corrected: `display: "standalone"` (was "fullscreen" which iOS silently ignores), removed `orientation` field
- `viewport-fit=cover` added to index.html for iOS status bar blending, `100dvh` for proper dynamic viewport height
- Audio unlock utility enables iOS audio autoplay after first user gesture per page load
- WelcomeScreen shows "touch the screen" hint only when audio needs initial unlock

## Task Commits

Each task was committed atomically:

1. **Task 1: Standalone detection + manifest fix (TDD)**
   - `9a0c35c` (test) — Add failing tests for standalone detection and conditional fullscreen
   - `103e521` (feat) — Implement standalone detection + fix manifest for PWA kiosk mode
   - `8e537eb` (fix) — Add viewport-fit=cover for iOS PWA status bar blending
   - `5f70c50` (feat) — Audio unlock on first tap for autonomous kiosk cycle

2. **Task 2: iPad kiosk verification (checkpoint)** — Partially tested, deferred with known issues documented below.

## Files Created/Modified
- `apps/tablet/src/lib/fullscreen.test.ts` — Unit tests for isStandaloneMode() and conditional requestFullscreen()
- `apps/tablet/src/lib/fullscreen.ts` — Added isStandaloneMode() export, conditional fullscreen logic
- `apps/tablet/public/manifest.json` — display: standalone, removed orientation field
- `apps/tablet/index.html` — viewport-fit=cover meta tag
- `apps/tablet/src/index.css` — 100dvh for dynamic viewport height
- `apps/tablet/src/lib/audioUnlock.ts` — iOS audio unlock utility (AudioContext resume + silent buffer)
- `apps/tablet/src/components/screens/SleepScreen.tsx` — Calls audioUnlock on tap
- `apps/tablet/src/components/screens/WelcomeScreen.tsx` — Audio unlock + conditional "touch the screen" hint

## Decisions Made
- Used `navigator.standalone` (iOS proprietary) as primary check, `matchMedia('(display-mode: standalone)')` as cross-platform fallback
- Added `viewport-fit=cover` to handle iOS safe areas (status bar) rather than hiding the status bar (impossible without Guided Access)
- Used `100dvh` instead of `100vh` for proper dynamic viewport height on iOS (accounts for browser chrome changes)
- Created audio unlock as a separate utility module (`audioUnlock.ts`) for reuse across screens

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] viewport-fit=cover for iOS status bar**
- **Found during:** Task 2 (iPad testing)
- **Issue:** iOS PWA showed black status bar area not blending with app background
- **Fix:** Added `viewport-fit=cover` to HTML meta viewport, switched to `100dvh` in CSS
- **Files modified:** `apps/tablet/index.html`, `apps/tablet/src/index.css`
- **Committed in:** `8e537eb`

**2. [Rule 2 - Missing Critical] iOS audio unlock for kiosk autonomy**
- **Found during:** Task 2 (iPad testing)
- **Issue:** iOS blocks audio autoplay until user gesture. After page load, first visitor's TTS would not play without a tap. Subsequent visitors would also be blocked since iOS resets the audio policy on each navigation cycle.
- **Fix:** Created `audioUnlock.ts` that resumes AudioContext + plays silent buffer on first user gesture. Called from SleepScreen and WelcomeScreen. Once unlocked, remains unlocked for page lifetime.
- **Files modified:** `apps/tablet/src/lib/audioUnlock.ts`, `apps/tablet/src/components/screens/SleepScreen.tsx`, `apps/tablet/src/components/screens/WelcomeScreen.tsx`
- **Committed in:** `5f70c50`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes essential for real-world kiosk operation on iOS. No scope creep.

## Known Issues (from iPad Testing)

These were identified during Task 2 (checkpoint:human-verify) and are accepted/deferred:

1. **iOS status bar always visible** — Platform limitation. Requires Guided Access mode to fully hide. App blends with `viewport-fit=cover` but the bar remains.
2. **Audio autoplay needs first tap** — Audio unlock is implemented but requires one initial user gesture per page load. This is an iOS platform constraint that cannot be bypassed.
3. **"X" button from iOS camera indicator** — iOS shows a small camera usage indicator when the camera is active. This is OS-level behavior, not controllable by the app.
4. **Printing not working** — Expected. Phase 3 (printer integration) has not been built yet.

## Issues Encountered
- iPad testing was partial; full kiosk verification deferred to later. Core PWA standalone behavior and face detection confirmed working.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 code changes complete. PWA standalone mode and face detection are functional.
- Phase 3 (Printer Integration) can proceed independently.
- Phase 4 (Portrait + End-to-End) depends on Phase 3 completion.
- Full kiosk lockdown (Guided Access) is a deployment concern, not a code concern.

## Self-Check: PASSED

All 8 claimed files exist on disk. All 4 commit hashes verified in git log.

---
*Phase: 02-pwa-fullscreen-face-detection*
*Completed: 2026-03-09*
