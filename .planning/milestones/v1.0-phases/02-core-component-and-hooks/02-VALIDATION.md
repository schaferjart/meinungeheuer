---
phase: 2
slug: core-component-and-hooks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x + @testing-library/react + happy-dom |
| **Config file** | `packages/karaoke-reader/vitest.config.ts` |
| **Quick run command** | `pnpm --filter karaoke-reader test` |
| **Full suite command** | `pnpm --filter karaoke-reader test && pnpm --filter karaoke-reader run check-exports` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

| Metric | Target |
|--------|--------|
| **Automated test coverage** | Every COMP-* requirement has at least one test |
| **Build verification** | `pnpm build` + `pnpm typecheck` + `check-exports` pass after each plan |
| **Wave 0 check** | Build + exports verified before any hook/component code |

---

## Per-Task Verification Map

| Requirement | Verification Type | Command / Method |
|-------------|-------------------|------------------|
| **COMP-01** | Integration test | Render `<KaraokeReader>` with text+timestamps+audioSrc, assert word `<span>` elements render with `data-kr-index` attributes and `data-kr-state` toggles during mock playback |
| **COMP-02** | Unit + Integration test | Unit: binary search returns correct index for given `currentTime`. Integration: rAF loop fires, `data-kr-state="active"` set on correct word span via direct DOM manipulation |
| **COMP-03** | Integration test | Walk through each status transition (idle->loading->ready->playing->paused->done, any->error) by dispatching audio events (`canplaythrough`, `ended`, `error`) on mock audio element |
| **COMP-04** | Integration test | Mock `getBoundingClientRect` to place active word outside comfort zone, assert `scrollBy` called. Fire manual scroll event, assert auto-scroll suppressed for 3000ms cooldown |
| **COMP-05** | Integration test | `fireEvent.click` on text area toggles play/pause. `fireEvent.keyDown` with Space/Enter toggles play/pause |
| **COMP-06** | Integration test | Render volume slider, change value, assert `audio.volume` updated |
| **COMP-07** | Integration test | Dispatch `ended` event on audio, assert `onComplete` callback fired exactly once |
| **COMP-08** | Integration test | Assert loading state renders loading indicator. Assert error state renders error fallback. Mock `play()` rejection, assert status stays `ready` (autoplay-blocked) |

---

## Wave 0 Requirements

Wave 0 must pass before any hook or component implementation begins.

| Check | Command | Expected |
|-------|---------|----------|
| Package builds | `pnpm --filter karaoke-reader build` | Exit 0, `dist/` contains `hooks/index.js` |
| Types compile | `pnpm --filter karaoke-reader exec tsc --noEmit` | Exit 0 |
| Exports valid | `pnpm --filter karaoke-reader run check-exports` | publint + attw pass |
| Test deps installed | `pnpm --filter karaoke-reader test` | Vitest runs (existing util tests pass) |

---

## Manual-Only Verifications

These cannot be automated in this phase and are deferred to Phase 4 (VAL-01):

| Verification | Method | Deferred To |
|--------------|--------|-------------|
| Zero behavior regression in tablet app | Wire tablet to consume `karaoke-reader` package, side-by-side manual comparison | Phase 4 VAL-01 |
| 60fps performance (no jank) | React DevTools Profiler during playback — zero component re-renders in rAF loop | Phase 4 VAL-01 |
| Visual scroll comfort zone accuracy | Manual observation: active word stays in 20%-65% viewport band during continuous playback | Phase 4 VAL-01 |

---

## Validation Sign-Off

| Gate | Status | Date |
|------|--------|------|
| Wave 0 passes | Pending | — |
| All COMP-* tests pass | Pending | — |
| Build + typecheck + check-exports green | Pending | — |
| Phase complete | Pending | — |

---

*Validation strategy defined: 2026-03-07*
