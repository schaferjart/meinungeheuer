---
phase: 2
plan: 02
title: "useAudioSync hook — rAF loop with binary search"
status: complete
started: "2026-03-07"
completed: "2026-03-07"
---

# Plan 02 Summary: useAudioSync Hook

## What was built

### `useAudioSync` hook (`packages/karaoke-reader/src/hooks/useAudioSync.ts`)

Standalone React hook extracted from the tablet app's `useTextToSpeechWithTimestamps` that synchronizes an `activeWordIndex` to an `HTMLAudioElement`'s `currentTime` at ~60fps.

**Key components:**

1. **`findActiveWordIndex(timestamps, t)`** — Pure function implementing binary search over sorted `WordTimestamp[]`. Finds the word whose `[startTime, endTime)` bracket contains `t`. Returns `-1` if before first word; returns the last-passed word index when `t` falls in a gap between words.

2. **`useAudioSync({ audio, timestamps, enabled })`** — React hook that runs a `requestAnimationFrame` loop when `enabled=true` and `audio` is non-null. Reads `audio.currentTime` each frame, runs binary search, and updates `activeWordIndex` state only when the index changes (avoiding unnecessary re-renders).

### Test suite (`packages/karaoke-reader/src/hooks/useAudioSync.test.ts`)

13 tests covering:
- **Pure function (7 tests):** empty timestamps, before first word, within-word matching, gap handling, after last word, single word, exact boundaries
- **Hook integration (6 tests):** initial state with no audio, empty timestamps, currentTime tracking across words, enable/disable toggle, rAF cleanup on unmount, re-enable resumption

## Commits

1. `3a3788b` — feat(karaoke-reader): implement useAudioSync hook with rAF binary search
2. `16e9c0f` — feat(karaoke-reader): add useAudioSync unit and integration tests

## Verification

- `pnpm --filter karaoke-reader typecheck` — passes
- `pnpm --filter karaoke-reader test` — 62 tests pass (13 new + 49 existing)
- Barrel export (`src/hooks/index.ts`) intentionally NOT updated — deferred to Plan 04 (Wave 2)

## Design decisions

- Kept `setActiveWordIndex` (React state) pattern from existing code rather than ref-only approach. The re-render is cheap since word spans don't change in the React tree, and it keeps the API simple for consumers.
- Exported `findActiveWordIndex` as a named export for direct unit testing of the pure binary search logic.
- Used functional `setActiveWordIndex(prev => ...)` to avoid unnecessary state updates when the index hasn't changed.
