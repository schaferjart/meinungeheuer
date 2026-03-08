---
phase: 2
slug: core-component-and-hooks
status: passed
verified_by: claude-sonnet-4-6
verified_at: 2026-03-07
requirements_covered: [COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, COMP-07, COMP-08]
commands_run:
  - pnpm --filter karaoke-reader test -- --run
  - pnpm --filter karaoke-reader build
  - pnpm --filter karaoke-reader run check-exports
---

# Phase 2 Verification: Core Component and Hooks

**Goal:** Extract the KaraokeReader component and its hooks -- 60fps word highlighting, auto-scroll, playback controls, and status state machine -- into the package with working DOM-based sync.

---

## Command Results

### 1. `pnpm --filter karaoke-reader test -- --run`

```
 RUN  v3.2.4

 ✓ src/utils/buildWordTimestamps.test.ts (13 tests) 21ms
 ✓ src/utils/computeCacheKey.test.ts (5 tests) 12ms
 ✓ src/utils/markdown.test.ts (17 tests) 33ms
 ✓ src/hooks/useAudioSync.test.ts (13 tests) 194ms
 ✓ src/hooks/useAutoScroll.test.ts (8 tests) 214ms
 ✓ src/hooks/useKaraokeReader.test.ts (13 tests) 230ms
 ✓ src/components/KaraokeReader.test.tsx (11 tests) 459ms
 ✓ src/utils/splitTextIntoChunks.test.ts (6 tests) 8ms

 Test Files  8 passed (8)
      Tests  86 passed (86)
   Duration  5.29s
```

Result: PASS (86/86 tests, 8 test files)

### 2. `pnpm --filter karaoke-reader build`

```
CJS ⚡️ Build success in 308ms
ESM ⚡️ Build success in 309ms
DTS ⚡️ Build success in 3303ms
```

Result: PASS (ESM + CJS + .d.ts all emitted, zero errors)

### 3. `pnpm --filter karaoke-reader run check-exports`

```
Running publint v0.3.18... All good!
No problems found 🌟

"karaoke-reader"      node10: 🟢  node16 CJS: 🟢  node16 ESM: 🟢  bundler: 🟢
"karaoke-reader/utils" node10: 🟢  node16 CJS: 🟢  node16 ESM: 🟢  bundler: 🟢
"karaoke-reader/hooks" node10: 🟢  node16 CJS: 🟢  node16 ESM: 🟢  bundler: 🟢
"karaoke-reader/elevenlabs" node10: 🟢 node16 CJS: 🟢 node16 ESM: 🟢 bundler: 🟢
```

Result: PASS (publint + attw all green for all subpath exports)

---

## Requirement Traceability

All 8 Phase 2 requirements are cross-referenced from the plan frontmatter against REQUIREMENTS.md and verified against the actual codebase.

### COMP-01 — `<KaraokeReader>` renders word-by-word highlighting

**Source:** REQUIREMENTS.md COMP-01, Plan 05 (requirements: COMP-01)

**Implementation:**
- File: `packages/karaoke-reader/src/components/KaraokeReader.tsx`
- Accepts `text: string`, `timestamps: WordTimestamp[]`, `audioSrc?: string | HTMLAudioElement`
- Parses text via `parseMarkdownText()` into paragraphs/lines/words
- Each word rendered as `<span data-kr-index={globalIndex} data-kr-state="upcoming" ref={...}>`
- Word span ref map: `Map<number, HTMLSpanElement>` populated by ref callbacks for O(1) DOM access

**Tests:** `src/components/KaraokeReader.test.tsx`
- Test 1: "renders word spans with data-kr-index attributes (COMP-01)" -- asserts 3 spans with correct `data-kr-index` values and word text content

**Status: SATISFIED**

---

### COMP-02 — 60fps sync loop via rAF with binary search, direct DOM toggling, no React re-renders

**Source:** REQUIREMENTS.md COMP-02, Plan 02 (requirements: COMP-02), Plan 05 (requirements: COMP-02)

**Implementation:**
- File: `packages/karaoke-reader/src/hooks/useAudioSync.ts`
- `findActiveWordIndex(timestamps, t)` -- exported pure function, binary search over sorted `WordTimestamp[]`; returns -1 before first word, last-passed word in gaps, correct bracket match within words
- `useAudioSync({ audio, timestamps, enabled })` -- rAF loop running only when `enabled=true` and `audio` is non-null; reads `audio.currentTime` each frame; calls `setActiveWordIndex` only when index changes (avoids unnecessary re-renders)
- File: `packages/karaoke-reader/src/components/KaraokeReader.tsx`
- DOM sync `useEffect` on `activeWordIndex`: directly sets `data-kr-state="spoken"` on previous span and `data-kr-state="active"` on current span via `setAttribute` -- no React re-renders during the rAF loop

**Tests:**
- `src/hooks/useAudioSync.test.ts` -- 7 unit tests for `findActiveWordIndex` (empty, before first, within word, gap, after last, single word, exact boundaries); 6 integration tests for hook (initial -1, empty timestamps, currentTime tracking, enable/disable, rAF cleanup on unmount, re-enable resumption)
- `src/components/KaraokeReader.test.tsx` -- Tests 2-3: asserts `data-kr-state="active"` on current word and `data-kr-state="spoken"` on previous word after advancing fake timer by 16ms

**Status: SATISFIED**

---

### COMP-03 — Status state machine: idle → loading → ready → playing → paused → done | error

**Source:** REQUIREMENTS.md COMP-03, Plan 04 (requirements: COMP-03)

**Implementation:**
- File: `packages/karaoke-reader/src/hooks/useKaraokeReader.ts`
- `useState<TtsStatus>('idle')` with `transitionTo(next)` helper that skips same-state transitions
- Transitions: `idle` (no audioSrc) → `loading` (audioSrc provided, effect fires) → `ready` (canplaythrough event) → `playing` (play() resolves) → `paused` (pause() called) → `done` (ended event)
- `error` reachable from any state via audio error event, or play() rejection (non-NotAllowedError)
- `onStatusChange` callback fires on every status change via dedicated `useEffect`
- `statusRef` keeps async play() promise callbacks reading latest status to avoid stale closures

**Tests:** `src/hooks/useKaraokeReader.test.ts`
- Test 1: idle when no audioSrc
- Test 2: idle → loading → ready (canplaythrough)
- Test 3: ready → playing (play())
- Test 4: playing → paused (pause())
- Test 5: playing → done (ended event)
- Test 6: loading → error (error event)
- Test 9: onStatusChange fires on each transition

**Status: SATISFIED**

---

### COMP-04 — Auto-scroll keeps active word in comfort zone (20%-65%) with 3s manual-scroll cooldown

**Source:** REQUIREMENTS.md COMP-04, Plan 03 (requirements: COMP-04)

**Implementation:**
- File: `packages/karaoke-reader/src/hooks/useAutoScroll.ts`
- Parameters: `containerRef`, `activeWordIndex`, `wordElementsRef`, `comfortTop=0.20`, `comfortBottom=0.65`, `cooldownMs=3000`, `enabled=true`
- Auto-scroll logic: `getBoundingClientRect()` on word and container; computes relative position; if outside [comfortTop, comfortBottom], calls `scrollBy` to bring word to 35% mark
- Manual scroll detection: attaches scroll listener to container; records `Date.now()` in `lastManualScrollRef`; schedules cooldown timer to reset to 0 after `cooldownMs`
- Suppression: if `lastManualScrollRef.current > 0` and `now - lastManualScrollRef.current < cooldownMs`, skips auto-scroll
- Integrated into `KaraokeReader` component with `enabled: status === 'playing'` so scroll only fires during active playback

**Tests:** `src/hooks/useAutoScroll.test.ts`
- Test: triggers scroll when word below 65% -- expects correct `scrollBy` call with top=210
- Test: no scroll when word inside comfort zone (40%)
- Test: suppresses scroll during cooldown after manual scroll event
- Test: resumes after `vi.advanceTimersByTime(3000)` cooldown expires
- Test: does nothing when `enabled=false`
- Test: graceful handling of missing word element (no crash)
- Test: triggers scroll when word above 20% -- expects negative top scrollBy

**Status: SATISFIED**

---

### COMP-05 — Play/pause via tap/click on text area, Space/Enter keyboard support

**Source:** REQUIREMENTS.md COMP-05, Plan 04 (requirements: COMP-05), Plan 05 (requirements: COMP-05)

**Implementation:**
- File: `packages/karaoke-reader/src/components/KaraokeReader.tsx`
- `handleContainerClick` on `.kr-scroll-container` calls `toggle()`
- `handleKeyDown` on root div (`tabIndex={0}`, `role="application"`) calls `toggle()` for `key === ' '` or `key === 'Enter'`
- `toggle()` in `useKaraokeReader`: plays if status is `paused` or `ready`, pauses if status is `playing`

**Tests:** `src/components/KaraokeReader.test.tsx`
- Test 4: `fireEvent.click` on `.kr-scroll-container` triggers play then pause
- Test 5: `fireEvent.keyDown` with `key: ' '` triggers play then pause
- Test 6: `fireEvent.keyDown` with `key: 'Enter'` triggers play
- `useKaraokeReader.test.ts` Test 12: `toggle()` cycles ready→playing→paused→playing

**Status: SATISFIED**

---

### COMP-06 — Volume slider control

**Source:** REQUIREMENTS.md COMP-06, Plan 04 (requirements: COMP-06), Plan 05 (requirements: COMP-06)

**Implementation:**
- File: `packages/karaoke-reader/src/hooks/useKaraokeReader.ts`
- `setVolume(v)`: clamps to [0,1], updates React state and `audioRef.current.volume` synchronously
- File: `packages/karaoke-reader/src/components/KaraokeReader.tsx`
- `<input type="range" className="kr-volume-slider" min={0} max={1} step={0.01}>` rendered in `.kr-controls` (hidden when `hideControls=true`)
- `handleVolumeChange` calls `setVolume(Number(e.target.value))`

**Tests:**
- `useKaraokeReader.test.ts` Test 11: `setVolume(0.5)` sets `result.current.volume` to 0.5 and `mockAudio.volume` to 0.5
- `KaraokeReader.test.tsx` Test 7: `fireEvent.change` on `.kr-volume-slider` sets `mock.volume` to 0.5

**Status: SATISFIED**

---

### COMP-07 — onComplete callback fires exactly once when audio finishes

**Source:** REQUIREMENTS.md COMP-07, Plan 04 (requirements: COMP-07)

**Implementation:**
- File: `packages/karaoke-reader/src/hooks/useKaraokeReader.ts`
- `handleEnded` event handler calls `transitionTo('done')` then `onCompleteRef.current?.()`
- Callback stored in `onCompleteRef` (ref pattern ensures stable closure, always reads latest callback)
- Fires exactly once because the `ended` event fires exactly once per playback completion

**Tests:** `useKaraokeReader.test.ts`
- Test 8: "fires onComplete exactly once when playback ends (COMP-07)" -- `vi.fn()` passed as `onComplete`, `simulateEnded()` dispatched, asserts `toHaveBeenCalledTimes(1)`

**Status: SATISFIED**

---

### COMP-08 — Graceful error handling: loading state, error state with fallback UI, autoplay-blocked detection

**Source:** REQUIREMENTS.md COMP-08, Plan 04 (requirements: COMP-08), Plan 05 (requirements: COMP-08)

**Implementation:**
- File: `packages/karaoke-reader/src/hooks/useKaraokeReader.ts`
- Autoplay-blocked detection: when `play()` promise rejects with `DOMException` where `name === 'NotAllowedError'`, silently stays in `ready` state (does NOT set error state)
- Audio error event: transitions to `error`, sets `error` state, fires `onError` callback
- File: `packages/karaoke-reader/src/components/KaraokeReader.tsx`
- Loading state: early return renders `<div class="kr-root kr-loading" data-kr-status="loading">` with `<div class="kr-loading-indicator" role="status" aria-label="Loading audio">Loading...</div>`
- Error state: early return renders `<div class="kr-root kr-error" data-kr-status="error">` with `<div class="kr-error-fallback" role="alert">{error?.message}</div>`

**Tests:**
- `useKaraokeReader.test.ts` Test 7: play() mocked to reject with `DOMException('Autoplay blocked', 'NotAllowedError')` -- asserts status stays `ready` and `error` is null
- `KaraokeReader.test.tsx` Test 8: loading state asserts `data-kr-status="loading"`, class `kr-loading`, and presence of `.kr-loading-indicator` with `role="status"`
- `KaraokeReader.test.tsx` Test 9: after `simulateError()`, asserts `data-kr-status="error"`, class `kr-error`, and `.kr-error-fallback` with `role="alert"` containing error text

**Status: SATISFIED**

---

## Phase Success Criteria Audit

From ROADMAP.md Phase 2 success criteria:

1. **`<KaraokeReader text={text} timestamps={timestamps} audioSrc={url} />` renders text and highlights words in sync with audio playback at 60fps -- verified by no React re-renders during the rAF sync loop**
   - rAF loop in `useAudioSync` directly reads `audio.currentTime` and only calls `setActiveWordIndex` when index changes
   - DOM sync `useEffect` in `KaraokeReader` uses direct `setAttribute` on span elements -- no React re-renders during the word highlight update path
   - Note: Full React DevTools Profiler verification is a Phase 4 manual check (VAL-01); automated tests confirm the direct DOM manipulation pattern is in place
   - Status: SATISFIED (automated) / DEFERRED (profiler manual check to Phase 4)

2. **Status transitions follow the state machine exactly: idle -> loading -> ready -> playing -> paused -> done, with error reachable from loading/playing -- verified by a test that walks through each transition**
   - All 6 transitions covered by dedicated tests in `useKaraokeReader.test.ts` (tests 1-6)
   - Status: SATISFIED

3. **Auto-scroll keeps the active word within the 20%-65% viewport comfort zone during continuous playback, and pauses scrolling for 3 seconds after manual scroll**
   - Verified by `useAutoScroll.test.ts` integration tests (8 tests)
   - Status: SATISFIED (automated) / DEFERRED (visual accuracy check to Phase 4)

4. **Space/Enter toggle play/pause, tap/click on text area toggles play/pause, volume slider adjusts audio volume -- all verified by integration tests**
   - Verified by `KaraokeReader.test.tsx` tests 4-7
   - Status: SATISFIED

5. **`onComplete` callback fires exactly once when audio playback reaches the end**
   - Verified by `useKaraokeReader.test.ts` test 8
   - Status: SATISFIED

---

## Files Produced by Phase 2

| File | Plan | Purpose |
|------|------|---------|
| `packages/karaoke-reader/src/hooks/useAudioSync.ts` | 02 | rAF loop + binary search; exports `findActiveWordIndex` and `useAudioSync` |
| `packages/karaoke-reader/src/hooks/useAudioSync.test.ts` | 02 | 13 tests (7 unit + 6 integration) |
| `packages/karaoke-reader/src/hooks/useAutoScroll.ts` | 03 | Comfort zone auto-scroll with manual-scroll cooldown |
| `packages/karaoke-reader/src/hooks/useAutoScroll.test.ts` | 03 | 8 integration tests |
| `packages/karaoke-reader/src/hooks/useKaraokeReader.ts` | 04 | Orchestrator hook: status state machine, audio lifecycle, volume, play/pause/toggle |
| `packages/karaoke-reader/src/hooks/useKaraokeReader.test.ts` | 04 | 13 integration tests |
| `packages/karaoke-reader/src/hooks/index.ts` | 04 | Barrel export for all three hooks + their types |
| `packages/karaoke-reader/src/components/KaraokeReader.tsx` | 05 | KaraokeReader component; DOM sync, auto-scroll, controls, loading/error states |
| `packages/karaoke-reader/src/components/KaraokeReader.test.tsx` | 05 | 11 integration tests |
| `packages/karaoke-reader/src/index.ts` | 04/05 | Root package exports (types, utils, hooks, component) |
| `packages/karaoke-reader/src/test-utils/mock-audio.ts` | 01 | MockAudio test helper with simulate* methods |
| `packages/karaoke-reader/src/test-utils/setup.ts` | 01 | jest-dom matcher setup for Vitest |

---

## Test Count Summary

| File | Tests | Phase 1 or 2 |
|------|-------|--------------|
| `useAudioSync.test.ts` | 13 | Phase 2 |
| `useAutoScroll.test.ts` | 8 | Phase 2 |
| `useKaraokeReader.test.ts` | 13 | Phase 2 |
| `KaraokeReader.test.tsx` | 11 | Phase 2 |
| `buildWordTimestamps.test.ts` | 13 | Phase 1 |
| `computeCacheKey.test.ts` | 5 | Phase 1 |
| `markdown.test.ts` | 17 | Phase 1 |
| `splitTextIntoChunks.test.ts` | 6 | Phase 1 |
| **Total** | **86** | |

Phase 2 added 45 new tests (tests 1-41 were Phase 1).

---

## Deferred Verifications

These were identified in `02-VALIDATION.md` as requiring manual verification in Phase 4:

| Verification | Deferred To | Reason |
|---|---|---|
| Zero React re-renders during rAF loop (React DevTools Profiler) | Phase 4 VAL-01 | Cannot be automated; requires browser DevTools |
| Visual accuracy of 20%-65% comfort zone during live playback | Phase 4 VAL-01 | Requires real browser + real scrolling |
| MeinUngeheuer tablet behavior identical after consuming package | Phase 4 VAL-01 | Requires wiring tablet to consume package |

---

## Gaps

None. All 8 COMP-* requirements are implemented, tested, and pass the automated quality gate.

---

## Conclusion

Phase 2 is **complete**. All 8 requirements (COMP-01 through COMP-08) are satisfied by working implementations with passing tests. The three quality gate commands all exit zero:

- `pnpm test -- --run`: 86/86 tests pass across 8 files
- `pnpm build`: ESM + CJS + .d.ts bundles built with zero errors
- `pnpm run check-exports`: publint + attw all green for all subpath exports

Phase 3 (Adapters and Styling) can proceed.

---
*Verified: 2026-03-07*
