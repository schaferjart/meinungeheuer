---
phase: 02-core-component-and-hooks
plan: 04
subsystem: hooks
tags: [react, audio, state-machine, karaoke, orchestrator]

requires:
  - phase: 02-core-component-and-hooks
    provides: useAudioSync hook (Plan 02), useAutoScroll hook (Plan 03)
provides:
  - useKaraokeReader orchestrator hook composing audio lifecycle + status state machine + useAudioSync
  - Full hooks barrel export (useAudioSync, useAutoScroll, useKaraokeReader) from hooks/index.ts and root index.ts
affects: [02-05-KaraokeReader-component, phase-3-adapters]

tech-stack:
  added: []
  patterns:
    - "Orchestrator hook pattern: compose lower-level hooks behind a single API surface"
    - "Status state machine via useState + ref-backed guards for async play() promise handling"
    - "Autoplay-blocked detection: NotAllowedError stays in ready, not error"

key-files:
  created:
    - packages/karaoke-reader/src/hooks/useKaraokeReader.ts
    - packages/karaoke-reader/src/hooks/useKaraokeReader.test.ts
  modified:
    - packages/karaoke-reader/src/hooks/index.ts
    - packages/karaoke-reader/src/index.ts

key-decisions:
  - "Status state machine uses useState + statusRef for async play() promise callbacks to read latest status"
  - "Volume is eagerly clamped 0-1 in setVolume to prevent invalid audio.volume assignment"

patterns-established:
  - "Orchestrator hook composing lower-level hooks: useKaraokeReader wraps useAudioSync"
  - "Ref-backed callback pattern: onComplete/onStatusChange/onError stored in refs for stable effect closures"

requirements-completed: [COMP-03, COMP-05, COMP-06, COMP-07, COMP-08]

duration: 3min
completed: 2026-03-07
---

# Phase 2 Plan 04: useKaraokeReader Hook Summary

**Orchestrator hook composing useAudioSync with status state machine (idle->loading->ready->playing->paused->done|error), volume control, play/pause/toggle, autoplay-blocked detection, and lifecycle callbacks**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T16:12:08Z
- **Completed:** 2026-03-07T16:15:57Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Implemented useKaraokeReader orchestrator hook with full status state machine
- Exported all hooks (useAudioSync, useAutoScroll, useKaraokeReader) from barrel and root index
- 13 integration tests covering all status transitions, autoplay-blocked detection, callbacks, volume, toggle, cleanup

## Task Commits

Each task was committed atomically:

1. **Task 04-01: Implement useKaraokeReader hook** - `ef500f6` (feat)
2. **Task 04-02: Export from hooks barrel and root index** - `89a8a7a` (feat)
3. **Task 04-03: Write integration tests** - `679172e` (test)

## Files Created/Modified
- `packages/karaoke-reader/src/hooks/useKaraokeReader.ts` - Orchestrator hook with status state machine, audio lifecycle, volume, play/pause/toggle
- `packages/karaoke-reader/src/hooks/useKaraokeReader.test.ts` - 13 integration tests using renderHook + MockAudio
- `packages/karaoke-reader/src/hooks/index.ts` - Barrel export for all hooks
- `packages/karaoke-reader/src/index.ts` - Root re-export of hooks and their types

## Decisions Made
- Status state machine uses `useState` + `statusRef` so async `play()` promise callbacks can read the latest status without stale closures
- Volume is eagerly clamped to 0-1 range in `setVolume` to prevent invalid `audio.volume` assignment
- Removed unused `useMemo`/`audioElement` variable discovered during TypeScript check (Rule 1 - Bug auto-fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused variable and import**
- **Found during:** Task 04-01 (useKaraokeReader implementation)
- **Issue:** Initial implementation had an unused `audioElement` useMemo that was superseded by the effect-based approach
- **Fix:** Removed the unused `useMemo` call and `useMemo` import
- **Files modified:** packages/karaoke-reader/src/hooks/useKaraokeReader.ts
- **Verification:** `pnpm --filter karaoke-reader exec tsc --noEmit` passes
- **Committed in:** ef500f6 (Task 04-01 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal — straightforward dead-code removal during initial implementation.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three hooks (useAudioSync, useAutoScroll, useKaraokeReader) are complete and exported
- Ready for Plan 05: KaraokeReader component that composes these hooks with DOM rendering
- useKaraokeReader provides the full headless API surface for the component to consume

---
*Phase: 02-core-component-and-hooks*
*Completed: 2026-03-07*
