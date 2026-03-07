# Pitfalls: Extracting a Karaoke Text Reader as an npm Package

**Scope:** Critical mistakes and known failure modes for extracting the MeinUngeheuer TTS-synced karaoke highlighting system into a standalone React npm package.

**Sources:** Codebase analysis of `useTextToSpeechWithTimestamps.ts` (555 lines), `TextReader.tsx` (600 lines), `ttsCache.ts` (78 lines), `TextDisplayScreen.tsx` (73 lines), plus common patterns from React component library publishing.

---

## 1. Audio Sync Components

### 1.1 Timing Drift Between Audio and Highlight Position

**What goes wrong:** The `requestAnimationFrame` loop reads `audio.currentTime`, but `currentTime` updates at the browser's discretion (not every frame). On heavily-loaded devices or background tabs, `currentTime` can jump forward in chunks, causing the highlight to "teleport" across several words instead of stepping smoothly.

**Why it happens:** `HTMLAudioElement.currentTime` is updated by the browser's audio thread, which runs asynchronously from the rendering thread. When the main thread is busy (GC pauses, layout thrash, long React reconciliation), `requestAnimationFrame` callbacks fire late. By the time the callback runs, `currentTime` has advanced past multiple word boundaries.

**How to avoid:**
- The existing binary search in `updateActiveWord` already handles jumps correctly (it finds the right word regardless of how far time advanced). Preserve this pattern; do not replace it with sequential index incrementing.
- Add a "catch-up" loop in the highlight effect that marks all words between `prevActiveRef` and `activeWordIndex` as spoken. The current code already does this (lines 179-189 of `TextReader.tsx`). Ensure this survives the extraction.
- Consider debouncing `setActiveWordIndex` with a threshold: only update state if the index actually changed, to avoid React reconciliation overhead when `currentTime` is between word boundaries.

**Warning signs:** Words appear to "skip" during highlighting. Users report the highlight "jumping ahead" on slower devices. Performance profiling shows React reconciliation occupying >4ms per frame.

**Phase:** Phase 2 (core hook extraction). Must be validated in the test harness with simulated clock skew.

---

### 1.2 Browser Autoplay Policy Blocks Audio Silently

**What goes wrong:** Modern browsers (Chrome, Safari, Firefox) block `audio.play()` if the call is not inside a user-gesture handler. The promise rejects, but the component optimistically sets `status = 'playing'` before the promise resolves. The highlight loop starts but the audio never plays, creating a frozen UI with no sound.

**Why it happens:** The current code (line 496-505 of `useTextToSpeechWithTimestamps.ts`) calls `setStatus('playing')` synchronously and then calls `audio.play()` which returns a promise. The catch handler sets status back to `'ready'`, but there is a brief window where `status === 'playing'` with no actual playback.

**How to avoid:**
- Move `setStatus('playing')` into the `.then()` callback of `audio.play()`. Only transition to 'playing' on confirmed playback.
- Export a clear `autoplayBlocked` state or an `onAutoplayBlocked` callback so consumers can show a "Tap to start" prompt.
- Document that `autoPlay: true` requires a prior user gesture. The consumer is responsible for ensuring the component mounts inside a click/tap handler chain.
- Test on iOS Safari, which is the strictest enforcer and requires a user gesture even for `AudioContext`.

**Warning signs:** Audio works on desktop Chrome but fails silently on mobile Safari. Status oscillates between 'playing' and 'ready'. No error shown to user.

**Phase:** Phase 2. Autoplay handling must be part of the hook's API contract.

---

### 1.3 Mobile Audio Session Conflicts

**What goes wrong:** On iOS, only one audio session can be active. If the consumer's app has background music, a video element, or another audio component, the karaoke audio may steal the session or be silenced by the other source. On Android, audio focus changes can pause the `HTMLAudioElement` without the component knowing.

**Why it happens:** Mobile operating systems manage audio focus at the OS level. `HTMLAudioElement` does not fire a 'pause' event when the OS interrupts playback (e.g., phone call, notification sound). The component's state stays 'playing' while the audio is actually paused.

**How to avoid:**
- Listen for the `pause` event on the audio element and sync component state accordingly. The current code does not do this.
- Listen for the `visibilitychange` event on `document` and pause the animation loop when the page is hidden.
- Document this limitation: the component assumes it owns the audio session.

**Warning signs:** Audio stops mid-playback on mobile but the highlight keeps advancing. Status stays 'playing' after an interruption.

**Phase:** Phase 3 (polish). Not a blocker for initial release, but must be documented.

---

### 1.4 Chunk Boundary Timing Gaps

**What goes wrong:** When text is split into chunks (the `splitTextIntoChunks` function), each chunk is fetched from the TTS API separately. The audio segments are concatenated as raw MP3 bytes. MP3 frames have inherent padding (encoder delay/padding), so the concatenated audio has tiny gaps or overlaps at chunk boundaries. The timestamp `timeOffset` calculation assumes perfect boundaries, but the actual audio has silence artifacts.

**Why it happens:** MP3 encoding adds silence at the start and end of each encoded segment (encoder priming samples). When you concatenate two MP3 files at the byte level, the decoder sees these padding frames as real audio, creating ~20-50ms gaps of silence at each boundary.

**How to avoid:**
- Use a gapless audio format (WAV, OGG) if the TTS provider supports it. ElevenLabs supports `pcm_*` output formats which concatenate cleanly.
- Alternatively, accept the gap and adjust `timeOffset` to account for the measured gap duration per chunk. This is fragile.
- For the generic interface (non-ElevenLabs), document that consumers providing pre-segmented audio must account for encoding artifacts.
- The ElevenLabs adapter should handle this internally.

**Warning signs:** Words near chunk boundaries appear to highlight too early or too late. A brief flash of "no active word" occurs at chunk joins.

**Phase:** Phase 2 (ElevenLabs adapter). The generic interface sidesteps this because the consumer provides a single audio source with pre-computed timestamps.

---

## 2. DOM Manipulation in React

### 2.1 Direct DOM Class Toggling vs React State

**What goes wrong:** The `TextReader` component uses direct DOM manipulation (`classList.add/remove`) via refs to toggle highlighting classes, deliberately bypassing React's state/render cycle. If this pattern is not clearly documented and isolated, future contributors or consumers may refactor it to use React state, causing catastrophic performance degradation (re-rendering 500+ word spans at 60fps).

**Why it happens:** React's reconciliation algorithm is O(n) for the component tree. With 500+ word spans and 60fps updates, each frame would diff/reconcile the entire word list. Direct DOM manipulation is O(1) per frame (touch only the active and previous word spans).

**How to avoid:**
- Encapsulate the DOM manipulation inside the component. Do NOT expose `wordSpansRef` or `activeWordIndex` as a prop that triggers re-renders.
- The current architecture is correct: `activeWordIndex` is React state (triggering a render), but the actual class manipulation happens in a `useEffect` that reads refs. This is the right boundary. Changing the state 60 times per second is the concern -- but the binary search in `updateActiveWord` only calls `setActiveWordIndex` when the index actually changes, so re-renders happen at word boundaries (maybe 2-5 times per second), not every frame. This is acceptable.
- Add a comment block (and JSDoc) explaining WHY direct DOM manipulation is used. Make it impossible to miss.
- Consider moving the rAF loop and DOM manipulation into a single `useEffect` that does not depend on React state at all, reading `audio.currentTime` and manipulating DOM directly. This would eliminate even the 2-5 re-renders per second.

**Warning signs:** CPU profiler shows React reconciliation as the top cost during playback. Word highlighting visibly stutters.

**Phase:** Phase 2. Architecture decision that must be locked in before writing the component.

---

### 2.2 Ref Map Cleanup on Re-render / Text Change

**What goes wrong:** The `wordSpansRef` is a `Map<number, HTMLSpanElement>` populated via ref callbacks. When the `text` prop changes, React unmounts the old word spans and mounts new ones. The ref callbacks fire with `null` for old spans (deletions) and with elements for new spans (insertions). If the text changes while audio is playing, the old refs are cleaned up but the animation loop may still reference stale indices.

**Why it happens:** React ref callbacks fire during the commit phase, which is asynchronous relative to the effect cleanup. The animation loop running via `requestAnimationFrame` may read `wordSpansRef` between the moment React starts unmounting old spans and finishes mounting new ones.

**How to avoid:**
- When `text` changes, stop the animation loop before React unmounts the old spans. The current `useTextToSpeechWithTimestamps` hook already does this (the effect cleanup at line 517 pauses audio and stops the loop). Verify this ordering is preserved.
- Clear the entire `wordSpansRef` map when `text` changes, before the new spans mount. Add an effect in the component: `useEffect(() => { wordSpansRef.current.clear(); }, [text])`.
- In the ref callback, always check `status !== 'idle'` before manipulating spans.

**Warning signs:** Console errors about accessing properties of null elements. Stale highlight on wrong words after text changes.

**Phase:** Phase 2. Must be covered by a test that changes `text` mid-playback.

---

### 2.3 SSR Compatibility (Server-Side Rendering)

**What goes wrong:** If a consumer uses Next.js or another SSR framework, the component fails during server rendering because it references `window`, `Audio`, `document`, `requestAnimationFrame`, `crypto.subtle`, `URL.createObjectURL`, and `Blob` -- none of which exist in Node.js.

**Why it happens:** The component is fundamentally browser-only (audio playback, DOM manipulation, Web Crypto API). These APIs have no server-side equivalent.

**How to avoid:**
- The PROJECT.md already marks SSR as out of scope. Enforce this technically:
  - Add `"browser"` field to `package.json` pointing to the entry point. Leave `"main"` pointing to a stub that throws a clear error: `"This package requires a browser environment"`.
  - Alternatively, gate all browser API usage behind `typeof window !== 'undefined'` checks and render a static placeholder during SSR.
  - Export a `<KaraokeTextReader>` component that checks `useEffect` (client-only) before initializing audio.
- Add `"sideEffects": false` to `package.json` to help bundlers tree-shake unused code paths.
- Document: "This component is browser-only. Wrap in `dynamic(() => import(...), { ssr: false })` for Next.js."

**Warning signs:** Build errors in Next.js projects referencing `window is not defined`. Hydration mismatches between server and client renders.

**Phase:** Phase 1 (package structure). The exports map must handle this from day one.

---

### 2.4 Memory Leaks from Blob URLs

**What goes wrong:** `URL.createObjectURL(blob)` creates an in-memory reference that persists until `URL.revokeObjectURL()` is called. If the component unmounts without revoking (e.g., due to an error boundary catching an exception, or React concurrent mode discarding a render), the Blob stays in memory indefinitely.

**Why it happens:** `URL.revokeObjectURL` is called in the effect cleanup (line 538-539 of `useTextToSpeechWithTimestamps.ts`), but error boundaries and concurrent mode can prevent cleanup functions from running.

**How to avoid:**
- Use a `FinalizationRegistry` as a safety net: register each Blob URL and revoke it when the associated object is garbage collected.
- Alternatively, maintain a module-level `Set<string>` of active Blob URLs and expose a `cleanup()` function for consumers to call in edge cases.
- The current dual-cleanup pattern (in the fetch effect AND in the unmount effect) is good. Keep both.
- Test by mounting/unmounting the component rapidly (100 times) and monitoring memory via DevTools.

**Warning signs:** Memory usage climbs steadily the longer the app runs. DevTools Blob URL count increases monotonically.

**Phase:** Phase 2 (hook extraction). Must be tested with rapid mount/unmount cycles.

---

## 3. npm Package Publishing

### 3.1 Incorrect `exports` Map Breaks Consumer Imports

**What goes wrong:** The `exports` field in `package.json` is the authoritative source for what consumers can import. If it only specifies `"."` but the package has sub-path exports (e.g., `karaoke-text-reader/elevenlabs`), imports fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Conversely, if `"main"` and `"exports"` disagree, older bundlers use `"main"` while newer ones use `"exports"`, causing different consumers to get different entry points.

**Why it happens:** The Node.js module resolution algorithm prioritizes `"exports"` over `"main"` since Node 12.7+. But older tools (Jest without ESM support, Webpack 4, older TypeScript versions) still read `"main"`. The two fields must be consistent.

**How to avoid:**
- Define `"exports"` with explicit conditions: `"types"`, `"import"`, `"require"` (if CJS is supported), and `"default"`.
- Mirror in `"main"` (CJS) and `"module"` (ESM) for backward compatibility.
- For sub-path exports (e.g., the ElevenLabs adapter), add explicit entries: `"./elevenlabs": { "types": "...", "import": "..." }`.
- Test with `publint` (https://publint.dev) and `arethetypeswrong` (https://arethetypeswrong.github.io) before every publish.
- Use `"typesVersions"` as a fallback for TypeScript versions that don't support `"exports"`.

**Warning signs:** Consumer gets `Module not found` errors. TypeScript can't find types but runtime works (or vice versa). Different behavior between Vite and Webpack consumers.

**Phase:** Phase 1 (package structure). Must be validated before any code is written.

---

### 3.2 Bundling React into the Package

**What goes wrong:** If `react` and `react-dom` are listed as `dependencies` (not `peerDependencies`), the package ships its own copy of React. The consumer's app now has two React instances. Hooks throw "Invalid hook call" errors because the React instance inside the package differs from the one in the consumer's app.

**Why it happens:** npm/pnpm resolves `dependencies` independently per package. If the version ranges don't exactly match the consumer's installed React, the package manager installs a separate copy. Two React instances = two hook registries = hooks fail.

**How to avoid:**
- List `react` and `react-dom` as `peerDependencies` with a generous range: `">=18.0.0"`.
- Also list them as `devDependencies` for development/testing.
- Mark them as `external` in the bundler config (Rollup, tsup, Vite library mode). Verify the built output does NOT contain `import React from 'react'` resolved to an absolute path.
- Use `peerDependenciesMeta` to mark them as optional if the package can work without React DOM (it cannot in this case, but this is good practice for documentation).

**Warning signs:** Consumer gets "Invalid hook call" error. Bundle analyzer shows two copies of React. Package size is unexpectedly large (18KB+ for React alone).

**Phase:** Phase 1 (package structure). Non-negotiable.

---

### 3.3 TypeScript Declaration Files Missing or Incorrect

**What goes wrong:** The package builds and runs, but consumers see no TypeScript types. Or worse: the `.d.ts` files reference internal paths (`../../../node_modules/...`) that don't exist in the consumer's project.

**Why it happens:** Several causes:
1. `"types"` field in `package.json` points to the wrong file.
2. `declaration: true` is set but `declarationDir` doesn't match the `"types"` path.
3. The build tool (tsup, Rollup) strips or mangles declaration files.
4. Path aliases used in development (`@/...`) appear in `.d.ts` files but the consumer doesn't have the same aliases.

**How to avoid:**
- Use `tsup` with `dts: true` which generates bundled declaration files (single `.d.ts` per entry point, no internal paths).
- Do NOT use TypeScript path aliases in the package source. Use relative imports only.
- Verify declarations by running `tsc --noEmit` in a test consumer project that imports the package.
- Add `"types"` to every entry in the `"exports"` map: `{ "types": "./dist/index.d.ts", "import": "./dist/index.js" }`. The `"types"` condition must come FIRST.

**Warning signs:** Consumer sees `any` types for all imports. IDE shows no autocomplete. `tsc` reports "could not find declaration file for module."

**Phase:** Phase 1. Broken types make the package unusable for TypeScript consumers (which is the entire target audience).

---

### 3.4 Tree-Shaking Fails: Entire Package Imported

**What goes wrong:** Consumer imports only `<KaraokeTextReader>` but the entire package (including the ElevenLabs adapter, cache utilities, markdown parser) ends up in their bundle.

**Why it happens:**
1. Single entry point re-exports everything.
2. Side effects in module scope (e.g., `const TTS_BASE_URL = '...'` is fine, but `document.addEventListener(...)` at module level is a side effect).
3. `"sideEffects": false` not set in `package.json`.
4. CommonJS output (bundlers can't tree-shake CJS).

**How to avoid:**
- Set `"sideEffects": false` in `package.json`.
- Use ESM output format exclusively. CJS cannot be tree-shaken.
- Separate the ElevenLabs adapter into a sub-path export (`karaoke-text-reader/elevenlabs`) so it's only imported when explicitly requested.
- Avoid module-level side effects. The current `TTS_BASE_URL` constant is fine (it's a string literal). But ensure no module-level `fetch()`, `addEventListener()`, or `new Audio()` calls exist.
- Test tree-shaking by building a consumer app that imports only one export and checking the bundle size.

**Warning signs:** Consumer's bundle size increases by more than expected when adding the package. Bundle analyzer shows unused modules from the package.

**Phase:** Phase 1 (package structure) for `sideEffects`. Phase 4 for sub-path exports verification.

---

### 3.5 CSS Bundling: Consumers Must Manually Import Styles

**What goes wrong:** The package ships CSS (either as a separate `.css` file or injected via JS), but the consumer's styles don't load. The component renders unstyled text with no highlighting, no scroll behavior, and no controls.

**Why it happens:** CSS handling varies wildly across consumer setups:
- Vite: Handles `import './styles.css'` natively.
- Webpack: Requires `css-loader` + `style-loader` configuration.
- Next.js: Only allows CSS imports from `node_modules` in certain locations.
- Some consumers strip CSS from `node_modules` entirely.

**How to avoid:**
- Ship CSS as a separate file AND as JS-injected styles (via a `<style>` tag in the component).
- The current `TextReader.tsx` already uses inline `<style>` tags (lines 477-519) for component-specific styles. This pattern is self-contained and works everywhere. Expand it.
- For the base styles (word highlighting, scroll, layout), use CSS custom properties with sensible defaults that consumers can override.
- Do NOT depend on Tailwind classes in the shipped package. Convert all Tailwind utilities to plain CSS.
- Export the CSS file path in `package.json`: `"style": "./dist/styles.css"` for consumers who want to import it separately.

**Warning signs:** Component looks correct in the development sandbox but renders as unstyled text in a consumer's app. Consumer files a bug: "no highlighting visible."

**Phase:** Phase 3 (CSS extraction from Tailwind). Must be tested in a Vite consumer AND a Webpack consumer.

---

## 4. Extracting from a Monorepo

### 4.1 Phantom Dependencies from Monorepo Hoisting

**What goes wrong:** The package works inside the monorepo but fails when published because it relies on dependencies that are hoisted to the monorepo root (installed by a sibling workspace) but not declared in the package's own `package.json`.

**Why it happens:** pnpm workspaces hoist shared dependencies. The package's source can `import` something that a sibling workspace depends on (e.g., `@supabase/supabase-js` from the tablet workspace). Inside the monorepo, the import resolves because pnpm's `node_modules` structure makes it available. Outside the monorepo, it's missing.

**How to avoid:**
- Run `pnpm pack` in the package directory and `pnpm install ./package.tgz` in a fresh directory to test installation.
- Use `depcheck` or `knip` to scan for undeclared dependencies.
- The critical phantom dependencies for this extraction:
  - `@supabase/supabase-js` -- used in `ttsCache.ts`. Since the cache adapter is optional, Supabase must NOT be a dependency of the core package. Extract it as a separate adapter.
  - `crypto` (Web API) -- not an npm dependency, but must be documented as a browser requirement.
- Use `pnpm --filter karaoke-text-reader exec depcheck` in CI to catch drift.

**Warning signs:** Package installs fine but `import` fails at runtime with "Cannot find module." Works in the monorepo's `apps/tablet` but not in an external project.

**Phase:** Phase 1 (package structure). Must be validated with a `pnpm pack` + install test.

---

### 4.2 Breaking Internal Import Paths

**What goes wrong:** The source code uses relative imports that reference files outside the package boundary (`../../packages/shared/...`) or uses workspace aliases (`@meinungeheuer/shared`). These paths don't exist in the published package.

**Why it happens:** The current files import from:
- `'../hooks/useTextToSpeechWithTimestamps'` (TextReader.tsx) -- internal, fine if restructured.
- `'../lib/ttsCache'` (useTextToSpeechWithTimestamps.ts) -- Supabase-specific, must be extracted.
- `'./supabase'` (ttsCache.ts) -- monorepo-specific Supabase client.

When extracting, these paths must either be internalized or made into optional imports.

**How to avoid:**
- Map all imports in the four source files. Classify each as:
  - **Core** (must ship with the package): `useTextToSpeechWithTimestamps.ts` pure functions, `TextReader.tsx` component logic.
  - **Adapter** (optional, separate export): `ttsCache.ts` (Supabase cache), `fetchTtsWithTimestamps` (ElevenLabs API).
  - **Dead** (monorepo-specific, drop): `getSupabaseClient()`, `@meinungeheuer/shared`, `import.meta.env`.
- Use a dependency graph tool to verify no external references remain.
- The generic interface should accept `WordTimestamp[] + AudioBuffer/Blob/URL` -- no TTS provider dependency.

**Warning signs:** TypeScript build fails with "Cannot find module" for workspace references. Bundle includes dead code from the monorepo.

**Phase:** Phase 1. The import map must be resolved before any code is moved.

---

### 4.3 Environment Variable References

**What goes wrong:** The current `TextDisplayScreen.tsx` reads `import.meta.env['VITE_ELEVENLABS_VOICE_ID']` and `import.meta.env['VITE_ELEVENLABS_API_KEY']`. If these references leak into the extracted package, consumers using Webpack (which doesn't have `import.meta.env`) get build errors.

**Why it happens:** Vite transforms `import.meta.env` at build time. This is a Vite-specific feature. Other bundlers either don't support it or use different conventions (`process.env` for Webpack, `env()` for others).

**How to avoid:**
- The extracted component must NEVER reference `import.meta.env`. All configuration must come through props or hook parameters.
- Grep the final package source for `import.meta` and `process.env` before publishing. Neither should appear.
- The ElevenLabs adapter should accept `{ apiKey, voiceId }` as explicit parameters, not read them from environment.

**Warning signs:** Package works in Vite projects but breaks in Webpack/Next.js with "import.meta is not defined."

**Phase:** Phase 1 (extraction). These must be removed during the initial code migration.

---

### 4.4 Mismatched React Versions Between Monorepo and Consumer

**What goes wrong:** The package is developed and tested with React 18.3.1 (the monorepo version). A consumer uses React 19 (or 18.0.0). The package relies on behavior or APIs that changed between versions.

**Why it happens:** React 19 changes several things: `ref` as a prop (no `forwardRef` needed), new hook rules, use() hook, etc. If the package uses `forwardRef`, it works on 18 but is deprecated on 19. If it uses React 19 features, it breaks on 18.

**How to avoid:**
- Target the lowest supported React version (18.0.0) and test against the latest (19.x).
- Do NOT use `forwardRef` -- use the `ref` prop directly (works on both 18.3+ and 19).
- The current code uses basic hooks (`useState`, `useCallback`, `useEffect`, `useRef`, `useMemo`) which are stable across all React 18+ versions. Keep it that way.
- Set `peerDependencies` to `"react": ">=18.0.0"`.
- Add a CI matrix that tests against React 18.0, 18.3, and 19.0.

**Warning signs:** Works in development but consumer reports hook errors or deprecation warnings.

**Phase:** Phase 4 (testing). Must be verified before v1.0 publish.

---

## 5. CSS Strategy for Component Libraries

### 5.1 Tailwind Classes Leaking into Consumer Styles

**What goes wrong:** The package ships with Tailwind utility classes (e.g., `flex`, `justify-center`, `bg-black`, `text-white/50`). In the consumer's app, these classes either don't exist (no Tailwind installed) or conflict with the consumer's own Tailwind configuration (different breakpoints, different color palette, `!important` overrides).

**Why it happens:** The current `TextReader.tsx` uses 30+ Tailwind classes: `flex`, `flex-col`, `w-full`, `h-full`, `bg-black`, `flex-1`, `overflow-y-auto`, `max-w-[700px]`, `mx-auto`, `justify-center`, `pb-8`, `text-white/50`, `gap-2`, `items-center`, `w-2`, `h-2`, `rounded-full`, `bg-white/40`, `py-2`, `cursor-pointer`, `gap-6`, `pb-4`, `text-white/20`, `text-white`, `animate-fade-in`.

If shipped as-is, consumers without Tailwind see broken layout. Consumers with Tailwind v3 (not v4) may have different class behaviors.

**How to avoid:**
- Convert ALL Tailwind utilities to plain CSS. No Tailwind dependency in the published package.
- Use CSS custom properties for theming (colors, fonts, spacing).
- Prefix all CSS class names with a namespace: `ktr-` (karaoke-text-reader) to avoid collisions.
- Ship styles via: (a) a `<style>` block injected by the component, and (b) an importable `.css` file for consumers who prefer external stylesheets.
- The inline `<style>` approach already used in `TextReader.tsx` (lines 477-519) is the right pattern. Extend it to cover all visual styles.

**Warning signs:** Component works in the development sandbox (which has Tailwind) but renders as unstyled in a consumer's app. Consumer reports class name conflicts.

**Phase:** Phase 3 (CSS extraction). This is the single most labor-intensive part of the extraction.

---

### 5.2 CSS Specificity Wars with Consumer Styles

**What goes wrong:** The package's CSS rules are overridden by the consumer's global styles (e.g., consumer has `* { box-sizing: content-box; }` or `p { line-height: 1.2; }`). The component looks wrong because its layout assumptions are violated.

**Why it happens:** CSS specificity follows a strict hierarchy. Plain class selectors (`.ktr-word`) have the same specificity as consumer class selectors. If the consumer's CSS is loaded after the package's CSS, it wins. Global resets (`*`, `html`, `body`) apply everywhere.

**How to avoid:**
- Use a container with `all: initial` or `all: revert` to reset inherited styles (but be cautious -- this can be too aggressive).
- Apply critical layout properties explicitly on the container: `box-sizing: border-box`, `line-height: 1.8`, `font-family: Georgia`, etc. Do not rely on inherited values.
- Use CSS layers (`@layer karaoke-text-reader { ... }`) to give consumers control over specificity ordering. Consumers can place the package layer below their own.
- Avoid `!important` in the package's CSS. If a consumer needs to override, `!important` makes it impossible.
- Test the component inside a "hostile" CSS environment: Bootstrap, Tailwind v3, a CSS reset that sets everything to `initial`.

**Warning signs:** Component renders correctly in isolation but breaks inside a consumer's layout. Word spacing, line height, or font changes unexpectedly.

**Phase:** Phase 3 (CSS extraction). Must be validated in at least 3 different consumer CSS environments.

---

### 5.3 Dark/Light Theme Assumptions

**What goes wrong:** The component hardcodes `bg-black`, `color: #ffffff`, `text-amber-300` (highlight color). Consumers with a light theme get a black rectangle in the middle of their white page.

**Why it happens:** The MeinUngeheuer installation is always dark-themed (art installation, kiosk mode). The extracted component inherits this assumption.

**How to avoid:**
- Extract ALL color values into CSS custom properties with sensible defaults:
  ```css
  --ktr-bg: #000000;
  --ktr-text: #ffffff;
  --ktr-highlight: #fcd34d; /* amber-300 */
  --ktr-spoken: rgba(255, 255, 255, 0.4);
  --ktr-upcoming: rgba(255, 255, 255, 0.9);
  ```
- Ship a dark theme as default (it's the proven design), but make it trivially overridable.
- Document the CSS custom properties in the README with a light-theme example.
- Consider shipping two CSS files: `styles.css` (default/dark) and `styles-light.css`.

**Warning signs:** Consumer complains component is "invisible" (black text on black background in dark mode, or blindingly bright in a dark app).

**Phase:** Phase 3. Theming must be designed during CSS extraction.

---

## 6. requestAnimationFrame-Based Sync Loops

### 6.1 Animation Loop Never Stops (Memory Leak)

**What goes wrong:** The `requestAnimationFrame` callback reschedules itself unconditionally (line 308 of `useTextToSpeechWithTimestamps.ts`). If cleanup fails (React concurrent mode, error boundary, consumer doesn't unmount properly), the loop runs forever, holding references to the audio element, word array, and DOM elements.

**Why it happens:** The current code's `updateActiveWord` always calls `requestAnimationFrame(updateActiveWord)` at the end (line 308). It relies on `stopAnimationLoop()` being called during cleanup. But cleanup may not run in all cases:
- React concurrent mode may discard a render tree without running cleanup effects.
- Error boundaries catch errors during render but effects in the errored tree may not clean up.
- Hot module replacement (HMR) during development may leave orphaned loops.

**How to avoid:**
- Add a `mountedRef` flag. Check it at the top of `updateActiveWord`. If the component is unmounted, do NOT reschedule.
- Add a `status` check: only reschedule when `status === 'playing'`. The current code schedules unconditionally even when paused (which is wasteful but not a leak since `stopAnimationLoop` is called on pause).
- As a safety net, add `WeakRef` to the audio element. If the audio element is garbage collected, stop the loop.
- Add a `beforeunload` listener that cancels outstanding animation frames.

**Warning signs:** DevTools Performance tab shows `requestAnimationFrame` callbacks running after the component is unmounted. Memory profiler shows retained DOM nodes from unmounted component trees.

**Phase:** Phase 2 (hook extraction). Must be fixed during extraction -- the current code has this issue.

---

### 6.2 Stale Closure Over Words Array

**What goes wrong:** The `updateActiveWord` callback is created with `useCallback([], [])` (empty dependency array). It reads `wordsRef.current` to get the current words. If `wordsRef` is not updated before the callback fires, the callback binary-searches an empty or stale word array.

**Why it happens:** The current code correctly uses `wordsRef.current = words` (line 267) to keep the ref in sync with state. But this assignment happens during render, while the animation frame callback fires asynchronously. If React batches state updates, there's a brief window where `wordsRef.current` has stale data.

**How to avoid:**
- The current pattern (ref mirroring state) is correct and standard. The risk is low because the binary search gracefully handles the case where `cues.length === 0` (line 276: returns early and reschedules).
- Do NOT remove the ref-mirroring pattern and try to use state directly in the callback. That would create a dependency that forces `useCallback` to recreate, breaking the animation frame chain.
- Test the edge case: call `play()` before TTS fetch completes. The loop should gracefully no-op until words are populated.

**Warning signs:** Highlight jumps to the wrong word after text changes. Console errors about accessing index `-1` or beyond array bounds.

**Phase:** Phase 2. Verify the pattern survives extraction intact.

---

### 6.3 Performance on Low-End Devices

**What goes wrong:** The animation loop runs at the display's refresh rate (60fps on most devices, 120fps on iPad Pro). On each frame, it performs a binary search, a state update (when word changes), and direct DOM manipulation. On low-end devices (old iPad, budget Android tablet), this can cause frame drops, making the highlight appear jerky.

**Why it happens:** `requestAnimationFrame` is called at the display refresh rate. The binary search is O(log n) and fast. But `setActiveWordIndex` triggers a React reconciliation, and the `useEffect` that follows does DOM manipulation. If React's reconciliation takes >8ms (half a frame budget at 60fps), the next animation frame is delayed.

**How to avoid:**
- Minimize React involvement in the hot path. Consider moving `activeWordIndex` out of React state entirely and using only refs + direct DOM manipulation.
- Profile on the target device (the MeinUngeheuer installation uses a tablet). If the target is "any device," profile on a low-end Android phone.
- Add `will-change: opacity, color` to word spans so the browser can optimize compositing.
- Consider using CSS transitions (already present: `transition: 'color 0.2s ease, opacity 0.4s ease'` on each word span) and toggling CSS classes, rather than setting inline styles. This offloads animation to the compositor thread.

**Warning signs:** Profiling shows >16ms frame times during playback. Visible "jank" when scrolling while audio plays. Battery drain on mobile.

**Phase:** Phase 4 (performance testing). Not a blocker for initial release, but must be profiled.

---

### 6.4 Visibility API: Tab Backgrounded

**What goes wrong:** When the browser tab is backgrounded, `requestAnimationFrame` is throttled to ~1fps or paused entirely (browser-dependent). The audio continues playing (on most browsers). When the user returns to the tab, `currentTime` has advanced significantly, and the highlight "jumps" to the current position in a single frame.

**Why it happens:** Browsers throttle `requestAnimationFrame` in background tabs to save resources. This is correct behavior. But the audio element is NOT paused (most browsers allow background audio). The result: audio and highlight desync while backgrounded, then re-sync abruptly when the tab is foregrounded.

**How to avoid:**
- Listen for `document.visibilitychange` event.
- When the page becomes hidden: pause the audio (if desired) or accept the desync.
- When the page becomes visible: let the existing binary search re-sync naturally (it already handles jumps). The "catch-up" loop in the highlight effect (marking all skipped words as spoken) handles this correctly.
- Document the behavior: "If the tab is backgrounded during playback, the highlight will re-sync when the tab is foregrounded."

**Warning signs:** Users report that returning to the tab shows a "flash" of all intermediate words being marked as spoken simultaneously.

**Phase:** Phase 3 (polish). Not a correctness issue, but a UX concern.

---

## 7. Additional Pitfalls

### 7.1 Version Conflicts with Consumer's Audio Processing

**What goes wrong:** Consumer uses the Web Audio API (`AudioContext`, `GainNode`, etc.) for their own audio processing. The karaoke component uses a plain `HTMLAudioElement`. If the consumer tries to route the component's audio through their `AudioContext` (e.g., for volume ducking or effects), they cannot because the audio source is internal.

**Why it happens:** The component creates its own `new Audio()` element internally and manages playback. There is no way for the consumer to access the audio element or connect it to a `MediaElementSourceNode`.

**How to avoid:**
- Expose an optional `audioRef` prop or `onAudioCreated` callback that gives the consumer access to the `HTMLAudioElement` instance.
- Alternatively, accept an externally-provided `HTMLAudioElement` or `AudioContext` via props, so the consumer can manage the audio pipeline.
- For the generic interface, consider accepting a `{ play(), pause(), currentTime: number }` control object instead of managing audio internally.

**Warning signs:** Consumer files feature request: "How do I control the audio volume/routing externally?" Consumer cannot integrate with their existing audio system.

**Phase:** Phase 2. API design must account for external audio control.

---

### 7.2 Locale-Sensitive Word Boundary Detection

**What goes wrong:** The word splitting logic (`/\s/` for whitespace) works for Latin-script languages but fails for CJK (Chinese, Japanese, Korean) where words are not separated by spaces. The timestamp-to-word mapping breaks for these languages.

**Why it happens:** The `buildWordTimestamps` function splits on whitespace (line 78-86 of `useTextToSpeechWithTimestamps.ts`). Chinese text like "我们去公园" has no spaces -- it's treated as one "word." The TTS alignment data has character-level timing, but the word-level conversion collapses everything.

**How to avoid:**
- Document this as a limitation: "Designed for languages with whitespace-separated words."
- For future support, accept an optional `wordBoundaryDetector` function in the config that consumers can override for CJK languages (using `Intl.Segmenter` or similar).
- The generic `WordTimestamp[]` interface sidesteps this: if the consumer provides their own word timestamps, they handle segmentation.

**Warning signs:** Component renders entire paragraph as a single highlighted "word" for CJK text.

**Phase:** Phase 4 (documentation). Not a blocker, but must be documented as a known limitation.

---

### 7.3 Race Condition: Multiple Texts Loaded Simultaneously

**What goes wrong:** Consumer changes the `text` prop rapidly (e.g., user navigates between texts). Each text change triggers a new TTS fetch. If the first fetch completes after the second fetch starts, the first fetch's audio and timestamps overwrite the second's, leaving the component showing text B but playing audio A.

**Why it happens:** The current code uses a `cancelled` flag (line 393 of `useTextToSpeechWithTimestamps.ts`) in the effect closure. When the effect re-runs (text changes), the cleanup sets `cancelled = true` for the old closure. The old fetch checks `if (cancelled) return` before setting state. This is correct.

**How to avoid:**
- Preserve the `cancelled` flag pattern during extraction. This is the standard React pattern for async effects.
- Additionally, consider using `AbortController` to actually cancel the HTTP request, not just ignore its result. This saves bandwidth and reduces ElevenLabs API costs.
- Test by rapidly changing `text` 10 times and verifying only the final text's audio plays.

**Warning signs:** Audio plays for a previous text after switching. Words don't match the displayed text.

**Phase:** Phase 2 (hook extraction). The pattern is already correct; verify it survives.

---

### 7.4 Publishing: Forgetting to Build Before Publish

**What goes wrong:** Developer runs `npm publish` without building first. The `dist/` directory contains stale output from a previous build (or is empty). Consumers install the package and get outdated or broken code.

**Why it happens:** `npm publish` publishes whatever is in the directory. It does not run `build` automatically. The `"prepublishOnly"` script must be set up to enforce this.

**How to avoid:**
- Add `"prepublishOnly": "pnpm build && pnpm test"` to `package.json`.
- Add `"files"` field to `package.json` that only includes `dist/`, `README.md`, `LICENSE`, and `package.json`. This prevents publishing source files, test files, and config.
- Use `np` (https://github.com/sindresorhus/np) or `changeset` for publishing, which enforce build + test + clean git state.
- Add a CI pipeline that publishes on git tag, never manually.

**Warning signs:** Version bump in npm but no code changes visible. Consumer reports "I installed the latest version but the bug is still there."

**Phase:** Phase 1 (package structure). Must be configured from the start.

---

## Summary: Pitfall Priority by Phase

### Phase 1 — Package Structure (before writing code)
| ID | Pitfall | Severity |
|----|---------|----------|
| 3.1 | Incorrect exports map | Critical |
| 3.2 | Bundling React into package | Critical |
| 3.3 | Missing/incorrect TypeScript declarations | Critical |
| 4.1 | Phantom dependencies from monorepo | Critical |
| 4.2 | Breaking internal import paths | Critical |
| 4.3 | Environment variable references | High |
| 2.3 | SSR compatibility (stub for browser-only) | Medium |
| 3.4 | Tree-shaking failures | Medium |
| 7.4 | Forgetting to build before publish | Medium |

### Phase 2 — Core Hook & Component Extraction
| ID | Pitfall | Severity |
|----|---------|----------|
| 2.1 | Direct DOM manipulation architecture | Critical |
| 6.1 | Animation loop never stops | Critical |
| 1.2 | Browser autoplay policy | High |
| 2.2 | Ref map cleanup on text change | High |
| 2.4 | Blob URL memory leaks | High |
| 6.2 | Stale closure over words array | Medium |
| 7.1 | Consumer audio integration | Medium |
| 7.3 | Race condition on text change | Medium |
| 1.4 | Chunk boundary timing gaps | Medium |

### Phase 3 — CSS Extraction & Theming
| ID | Pitfall | Severity |
|----|---------|----------|
| 5.1 | Tailwind classes leaking | Critical |
| 5.2 | CSS specificity wars | High |
| 5.3 | Dark/light theme assumptions | High |
| 3.5 | CSS bundling / consumer imports | High |
| 1.3 | Mobile audio session conflicts | Medium |
| 6.4 | Visibility API / tab backgrounded | Low |

### Phase 4 — Testing & Polish
| ID | Pitfall | Severity |
|----|---------|----------|
| 1.1 | Timing drift | High |
| 4.4 | React version compatibility | High |
| 6.3 | Performance on low-end devices | Medium |
| 7.2 | CJK word boundary detection | Low |

---

**Document created:** 2026-03-07
**Source analysis:** 4 files, ~1,306 lines of production code
**Pitfalls catalogued:** 25
