# Phase 2 Research: Core Component and Hooks

**Researched:** 2026-03-07
**Scope:** COMP-01 through COMP-08
**Input:** Existing `TextReader.tsx` (600 lines), `useTextToSpeechWithTimestamps.ts` (555 lines), Phase 1 package scaffold

---

## Source Code Analysis

### What exists in the tablet app (to extract from)

**`apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts`** -- monolithic hook that combines:
1. ElevenLabs API fetching (lines 170-223) -- stays in tablet / moves to Phase 3 adapter
2. Base64-to-Blob audio decoding (lines 229-243) -- stays in tablet / adapter concern
3. Cache lookup via Supabase (lines 400-451) -- stays in tablet / adapter concern
4. `updateActiveWord()` rAF loop with binary search (lines 272-309) -- **EXTRACT as `useAudioSync`**
5. Animation frame start/stop (lines 311-321) -- **EXTRACT as `useAudioSync`**
6. Play/pause controls (lines 338-363) -- **EXTRACT into `useKaraokeReader`**
7. Volume control (lines 326-333) -- **EXTRACT into `useKaraokeReader`**
8. Status state management (lines 254-258) -- **EXTRACT into `useKaraokeReader`**
9. Audio element lifecycle (lines 466-505) -- **EXTRACT into `useKaraokeReader`**

Key signatures to preserve:
```ts
// Current return shape (must be preserved in new API)
{
  status: TtsStatus;
  words: WordTimestamp[];
  activeWordIndex: number;
  play: () => void;
  pause: () => void;
  error: string | null;
  volume: number;
  setVolume: (v: number) => void;
}
```

**`apps/tablet/src/components/TextReader.tsx`** -- component that combines:
1. Markdown parsing via inline functions (lines 36-139) -- already extracted to Phase 1 `parseMarkdownText`
2. Direct DOM class toggling via `useEffect` on `activeWordIndex` (lines 165-222) -- **EXTRACT into `useAudioSync` or component**
3. Manual scroll cooldown handler (lines 227-238) -- **EXTRACT into `useAutoScroll`**
4. Comfort-zone auto-scroll logic (lines 200-217) -- **EXTRACT into `useAutoScroll`**
5. Word ref map (`Map<number, HTMLSpanElement>`) management (lines 156, 244-250) -- **EXTRACT into component**
6. Tap-to-pause handler (lines 255-261) -- **EXTRACT into component**
7. Status-based UI rendering (lines 266-520) -- **EXTRACT into component** (generalized, no Tailwind)
8. Sub-components: `LoadingDots`, `VolumeSlider`, `ActionButton` (lines 528-599) -- **EXTRACT as internal sub-components**
9. Inline `<style>` tag (lines 477-519) -- **REPLACE with CSS custom properties in Phase 3**

### What exists in the package already (from Phase 1)

- `src/types.ts`: `WordTimestamp`, `TtsStatus`, `AlignmentData`, `ParsedWord`, `ParsedLine`, `ParsedParagraph`, `LineType`
- `src/utils/`: `buildWordTimestamps`, `splitTextIntoChunks`, `computeCacheKey`, `stripMarkdownForTTS`, `parseMarkdownText`
- `src/hooks/index.ts`: empty placeholder (`export {}`)
- `src/adapters/elevenlabs/index.ts`: empty placeholder (Phase 3)
- `src/styles.css`: placeholder comment (Phase 3)
- `tsconfig.json`: already has `"jsx": "react-jsx"` and `"lib": ["ES2022", "DOM"]`
- `tsup.config.ts`: already has `hooks/index` entry point, `external: ['react', 'react-dom']`

### Constants from existing code (to parameterize)

| Constant | Current Value | New Approach |
|----------|--------------|--------------|
| `WORD_CLASS_ACTIVE` | `'text-amber-300'` (Tailwind) | Data attribute: `data-kr-state="active"` |
| `WORD_CLASS_SPOKEN` | `'opacity-40'` (Tailwind) | Data attribute: `data-kr-state="spoken"` |
| `WORD_CLASS_UPCOMING` | `'opacity-90'` (Tailwind) | Data attribute: `data-kr-state="upcoming"` (default) |
| Comfort zone | `0.2` - `0.65` | Props with defaults |
| Scroll cooldown | `4000ms` (code) / `3000ms` (spec) | Prop with default `3000ms` (match COMP-04 spec) |
| Auto-continue delay | `2000ms` | Consumer handles via `onComplete` callback |

---

## Component Architecture

### KaraokeReader Props Interface

```ts
interface KaraokeReaderProps {
  /** The markdown text to display and highlight */
  text: string;
  /** Word-level timestamps, pre-computed (e.g., via buildWordTimestamps) */
  timestamps: WordTimestamp[];
  /** Audio source: URL string, Blob URL, or HTMLAudioElement */
  audioSrc: string | HTMLAudioElement;
  /** Auto-play when ready (default: false) */
  autoPlay?: boolean;
  /** Called when audio playback finishes */
  onComplete?: () => void;
  /** Called on status change */
  onStatusChange?: (status: TtsStatus) => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Initial volume 0-1 (default: 1) */
  initialVolume?: number;
  /** Hide built-in controls (default: false) */
  hideControls?: boolean;
  /** Comfort zone top boundary as fraction 0-1 (default: 0.20) */
  scrollComfortTop?: number;
  /** Comfort zone bottom boundary as fraction 0-1 (default: 0.65) */
  scrollComfortBottom?: number;
  /** Manual scroll cooldown in ms (default: 3000) */
  scrollCooldown?: number;
  /** CSS class name for the root container */
  className?: string;
  /** Inline styles for the root container */
  style?: React.CSSProperties;
}
```

The key design decision: `audioSrc` accepts either a URL string (component creates `Audio` internally) or a pre-built `HTMLAudioElement` (consumer has full control). This keeps the component generic -- ElevenLabs adapter (Phase 3) handles fetching and provides a URL.

### Status State Machine

```
idle ──── (audioSrc provided) ───→ loading
loading ── (canplaythrough) ─────→ ready
ready ──── (play / autoPlay) ────→ playing
playing ── (pause / tap) ────────→ paused
paused ─── (play / tap) ─────────→ playing
playing ── (ended) ──────────────→ done
any ─────── (error) ─────────────→ error
```

States map to COMP-03. The `loading` state is entered when the `<audio>` element is loading (`canplaythrough` has not fired). If `audioSrc` is a string, the component creates an `Audio` element and waits for `canplaythrough`. If `audioSrc` is an `HTMLAudioElement` already ready, it can skip to `ready`.

### Internal Architecture (component internals)

```
<KaraokeReader>
  ├── useKaraokeReader(props)          // orchestrates everything
  │   ├── useAudioSync(audio, timestamps)  // rAF + binary search → activeWordIndex
  │   └── useAutoScroll(containerRef, activeWordIndex, config)  // comfort-zone scroll
  ├── <div.kr-root>                    // root container
  │   ├── <div.kr-scroll-container>    // scrollable text area, onClick=tap-to-pause
  │   │   ├── <div.kr-content>         // max-width wrapper
  │   │   │   └── paragraphs → lines → word <span>s with data-kr-state attributes
  │   ├── <div.kr-controls>            // built-in controls (hideable)
  │   │   ├── <VolumeSlider>
  │   │   └── status-dependent buttons
```

### Word Rendering and DOM Manipulation

Each word renders as:
```html
<span data-kr-index="42" data-kr-state="upcoming">word</span>
```

The `data-kr-state` attribute cycles through: `upcoming` -> `active` -> `spoken`.

DOM manipulation strategy (preserving the proven 60fps pattern from TextReader.tsx):
- `useAudioSync` outputs `activeWordIndex` via a **ref** (not state) to avoid React re-renders
- A `useEffect` with `requestAnimationFrame` reads the ref and directly toggles `data-kr-state` on DOM spans
- Word spans are tracked via a `Map<number, HTMLSpanElement>` ref, populated by ref callbacks during render
- `prevActiveRef` pattern tracks previous active word for efficient class removal

Critical insight: the existing code uses `setActiveWordIndex` (React state) inside the rAF loop, which triggers re-renders. The package should instead use a ref for the rAF loop's output and a separate `useEffect` that reads the ref to do DOM manipulation -- or better, do DOM manipulation directly inside the rAF callback (skip React entirely for the hot path).

---

## Hook Design

### `useAudioSync`

**Purpose:** Synchronize an `activeWordIndex` ref to an `HTMLAudioElement`'s `currentTime` at 60fps using binary search over sorted `WordTimestamp[]`.

```ts
interface UseAudioSyncParams {
  audio: HTMLAudioElement | null;
  timestamps: WordTimestamp[];
  enabled: boolean; // only run rAF when playing
}

interface UseAudioSyncReturn {
  /** Current active word index (ref for perf, no re-renders) */
  activeIndexRef: React.MutableRefObject<number>;
  /** Subscribe to index changes (for DOM manipulation) */
  onIndexChange: (callback: (index: number, prevIndex: number) => void) => void;
}
```

Implementation details:
- Binary search identical to existing `updateActiveWord()` (lines 283-300 of useTextToSpeechWithTimestamps.ts)
- rAF loop starts when `enabled=true`, stops when `enabled=false`
- Calls registered `onIndexChange` callbacks when index changes -- this is how the component connects DOM manipulation without React re-renders
- Cleanup: cancels rAF on unmount or when `enabled` becomes false

Alternative (simpler): instead of a callback subscription, just return the `activeIndexRef` and let the component run its own `useEffect` to read it. But this requires a state setter to trigger the effect. The existing code already does this (`setActiveWordIndex` in rAF). Trade-off: simplicity vs. re-render avoidance.

**Recommended approach:** Keep `setActiveWordIndex` state for now (matches existing proven pattern), but move DOM manipulation into a `useEffect` that uses direct DOM manipulation (already the pattern in TextReader.tsx). The re-render from `setActiveWordIndex` is cheap because the `useEffect` does DOM work, not JSX diffing. The word spans don't change in the React tree.

### `useAutoScroll`

**Purpose:** Auto-scroll a container to keep the active word in a comfort zone, with manual-scroll cooldown.

```ts
interface UseAutoScrollParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeWordIndex: number;
  wordElementsRef: React.RefObject<Map<number, HTMLSpanElement>>;
  comfortTop?: number;    // default 0.20
  comfortBottom?: number; // default 0.65
  cooldownMs?: number;    // default 3000
  enabled?: boolean;      // default true
}
```

Implementation details:
- Runs inside a `useEffect` that fires on `activeWordIndex` change
- Reads active word span position via `getBoundingClientRect()` relative to container
- If word is outside comfort zone (top 20% or below 65%), scrolls container to bring word to 35% mark
- Manual scroll detection: attaches `onscroll` listener to container, records `Date.now()` on scroll
- After manual scroll, suppresses auto-scroll for `cooldownMs` (default 3000ms per COMP-04)
- Cooldown reset timer clears the manual-scroll flag after cooldown expires
- Cleanup: removes scroll listener, clears timeout

### `useKaraokeReader` (combined orchestrator)

**Purpose:** Combine `useAudioSync` + `useAutoScroll` + audio lifecycle + status state machine into one hook. This is what the `<KaraokeReader>` component uses internally, but consumers can also import it for headless usage.

```ts
interface UseKaraokeReaderParams {
  timestamps: WordTimestamp[];
  audioSrc: string | HTMLAudioElement;
  autoPlay?: boolean;
  initialVolume?: number;
  onComplete?: () => void;
  onStatusChange?: (status: TtsStatus) => void;
  onError?: (error: string) => void;
}

interface UseKaraokeReaderReturn {
  status: TtsStatus;
  activeWordIndex: number;
  play: () => void;
  pause: () => void;
  volume: number;
  setVolume: (v: number) => void;
  error: string | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}
```

Implementation details:
- Creates or wraps `HTMLAudioElement` from `audioSrc`
- Manages status state machine (idle -> loading -> ready -> playing -> paused -> done | error)
- Listens to audio events: `canplaythrough` -> ready, `ended` -> done, `error` -> error
- Handles autoplay with autoplay-blocked detection (COMP-08): if `play()` promise rejects, stay in `ready`
- Volume control: syncs `volume` state to `audio.volume`
- Cleanup: pauses audio, revokes blob URLs (only if component created them), cancels rAF

---

## Testing Strategy

### Test Environment

- **Vitest** with **happy-dom** environment (already configured in Phase 1)
- Need to add `@testing-library/react` and `@testing-library/user-event` as devDependencies
- Need to add `react` and `react-dom` as devDependencies (for testing only -- they're peerDeps)

### What to Test

**Unit tests (pure logic):**
1. Binary search correctness -- given timestamps and a currentTime, returns correct index
2. Gap handling -- currentTime between two word timestamps returns previous word
3. Edge cases -- empty timestamps, single word, currentTime before first word, after last word

**Hook integration tests (`useAudioSync`):**
4. Returns -1 initially when no audio is playing
5. Updates activeWordIndex when audio.currentTime advances (mock rAF)
6. Stops updating when enabled=false

**Hook integration tests (`useAutoScroll`):**
7. Triggers scroll when word is outside comfort zone (mock getBoundingClientRect)
8. Suppresses scroll during cooldown after manual scroll event
9. Resumes auto-scroll after cooldown expires

**Hook integration tests (`useKaraokeReader`):**
10. Status transitions: idle -> loading -> ready (on canplaythrough event)
11. Status transitions: ready -> playing (on play()), playing -> paused (on pause())
12. Status transitions: playing -> done (on ended event)
13. Status transitions: any -> error (on error event)
14. Autoplay-blocked detection: play() rejects -> stays in ready
15. Volume control: setVolume updates audio.volume
16. onComplete callback fires on `done` status

**Component integration tests (`<KaraokeReader>`):**
17. Renders word spans with data-kr-index attributes
18. Sets data-kr-state="active" on current word during playback (mock audio timing)
19. Sets data-kr-state="spoken" on words before active word
20. Tap/click toggles pause/play
21. Space/Enter key toggles pause/play (COMP-05)
22. Volume slider changes volume (COMP-06)
23. Loading state shows loading indicator
24. Error state shows error fallback

### Mocking Strategy

- **`HTMLAudioElement`**: Create a mock class with controllable `currentTime`, `duration`, `play()`, `pause()`, and event dispatching (`canplaythrough`, `ended`, `error`). happy-dom may not have full Audio support.
- **`requestAnimationFrame`**: Use `vi.useFakeTimers()` + manual rAF flushing via `vi.advanceTimersByTime(16)`.
- **`getBoundingClientRect`**: Mock on span/container elements for scroll tests.
- **`Element.scrollBy`**: Mock on container div for scroll verification.

### Test File Locations

```
src/hooks/useAudioSync.ts          → src/hooks/useAudioSync.test.ts
src/hooks/useAutoScroll.ts         → src/hooks/useAutoScroll.test.ts
src/hooks/useKaraokeReader.ts      → src/hooks/useKaraokeReader.test.ts
src/components/KaraokeReader.tsx   → src/components/KaraokeReader.test.tsx
```

---

## Build Integration

### tsup config changes needed

The existing `tsup.config.ts` already has `'hooks/index': 'src/hooks/index.ts'` as an entry point and `external: ['react', 'react-dom']`. No changes needed to tsup config.

However, we need a **new entry point for the component**. Options:

**Option A: Export component from root `index.ts`** -- simplest. Consumer does `import { KaraokeReader } from 'karaoke-reader'`. Root already exists as entry point.

**Option B: Separate `/component` subpath** -- more granular, but adds complexity. Not needed yet.

**Recommendation:** Option A. Export the component and hooks from the root `index.ts`, and also re-export hooks from `hooks/index.ts` for consumers who only want hooks.

### Package.json changes needed

Add dev dependencies for testing React components:
```json
{
  "devDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0"
  }
}
```

### Vitest config changes

Need to set test environment to `happy-dom` (or `jsdom`) for component tests. Check if there is a `vitest.config.ts`:

Currently the package likely uses the workspace vitest config. Need to ensure DOM environment is available. Add to `vitest.config.ts` or package-level config:
```ts
environment: 'happy-dom'
```

And add `happy-dom` as a devDependency.

### Export map updates

`src/index.ts` needs to re-export:
```ts
// existing exports stay
export { KaraokeReader } from './components/KaraokeReader.js';
export type { KaraokeReaderProps } from './components/KaraokeReader.js';
export { useKaraokeReader } from './hooks/useKaraokeReader.js';
export { useAudioSync } from './hooks/useAudioSync.js';
export { useAutoScroll } from './hooks/useAutoScroll.js';
```

`src/hooks/index.ts` needs:
```ts
export { useKaraokeReader } from './useKaraokeReader.js';
export { useAudioSync } from './useAudioSync.js';
export { useAutoScroll } from './useAutoScroll.js';
```

### tsconfig.json

Already has `"jsx": "react-jsx"` -- no changes needed. But need to verify `tsconfig.json` `exclude` does not exclude `.tsx` test files (it excludes `**/*.test.ts` but not `**/*.test.tsx`). This is fine because `noEmit: true` means the exclude only affects `tsc --noEmit` type-checking, and we want to exclude tests from type-checking. But we should update the exclude to also cover `.test.tsx`:

```json
"exclude": ["**/*.test.ts", "**/*.test.tsx"]
```

---

## Risk Assessment

### High Risk

1. **HTMLAudioElement mocking in happy-dom**: happy-dom's Audio implementation is incomplete. The rAF loop relies on `audio.currentTime` which may not advance in tests. **Mitigation:** Create a minimal `MockAudio` class that extends EventTarget with controllable `currentTime`, `play()`, `pause()`, and event firing. Do not rely on happy-dom's built-in Audio.

2. **rAF loop testing**: `requestAnimationFrame` behavior in happy-dom may not match browser. **Mitigation:** Use `vi.useFakeTimers()` and manually flush rAF callbacks. Test the binary search logic separately as a pure function.

### Medium Risk

3. **Direct DOM manipulation + React reconciliation conflict**: The component renders word spans via React but modifies their `data-kr-state` via direct DOM manipulation. If React re-renders the word spans (e.g., due to text prop change), the DOM manipulation state is lost. **Mitigation:** Word spans should be stable (keyed by `globalIndex`). The `useEffect` that does DOM manipulation should run after every render to re-apply state. On text change, reset everything (already handled by status going back to idle).

4. **Audio autoplay policy**: Browsers block autoplay without user gesture. The existing code handles this (catch play() rejection, stay in ready). **Mitigation:** Preserve this pattern. Document that consumers should use `autoPlay` only after user interaction.

5. **Scroll behavior in test environment**: `getBoundingClientRect()` returns zeros in happy-dom. **Mitigation:** Mock getBoundingClientRect on specific elements. Or test scroll logic as a pure function that takes rects as input.

### Low Risk

6. **Bundle size increase from React component**: Adding React component code to the root export means non-React consumers (who only want utils) get tree-shaken output via the `/utils` subpath. No issue.

7. **Multiple audio instances if audioSrc changes**: Need to properly clean up previous Audio element when audioSrc prop changes. **Mitigation:** useEffect cleanup function pauses and dereferences the old Audio.

---

## Validation Architecture

### Build Validation

1. `pnpm build` succeeds in `packages/karaoke-reader`
2. `pnpm typecheck` passes (no type errors)
3. `pnpm --filter karaoke-reader run check-exports` passes (publint + attw)
4. Verify `dist/hooks/index.js` contains actual hook exports (not empty)
5. Verify `dist/index.js` exports `KaraokeReader` component

### Test Validation

6. `pnpm --filter karaoke-reader test` passes all tests
7. Coverage: binary search logic, status transitions, DOM attribute toggling, scroll behavior, play/pause controls

### Manual/Integration Validation (deferred to Phase 4 VAL-01)

8. Wire tablet app to consume `karaoke-reader` package instead of inline code
9. Verify zero behavior regression in the tablet TextReader screen

### Validation Checklist per Requirement

| Req | Validation |
|-----|-----------|
| COMP-01 | Component renders words from text+timestamps, highlights sync to audio |
| COMP-02 | Test: rAF loop fires, binary search returns correct index, DOM data-kr-state updated |
| COMP-03 | Test: status transitions match state machine diagram |
| COMP-04 | Test: auto-scroll fires when word outside comfort zone; suppressed during cooldown |
| COMP-05 | Test: click/tap on text area toggles play/pause; Space/Enter key handlers |
| COMP-06 | Test: volume slider changes audio.volume |
| COMP-07 | Test: onComplete called when status becomes 'done' |
| COMP-08 | Test: loading state renders loading UI; error state renders error fallback; autoplay-blocked stays in 'ready' |

---

## RESEARCH COMPLETE
