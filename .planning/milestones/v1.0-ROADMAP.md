# Roadmap: Karaoke Text Reader

**Created:** 2026-03-07
**Phases:** 4
**Requirements covered:** 32/32

## Phase 1: Package Foundation

**Goal:** Scaffold a publishable npm package with correct exports, TypeScript declarations, and all pure utility functions extracted and tested.

**Requirements:** PKG-01, PKG-02, PKG-03, PKG-04, PKG-05, UTIL-01, UTIL-02, UTIL-03, UTIL-04, UTIL-05

### Success Criteria

1. `pnpm build` in the package directory produces ESM + CJS bundles and `.d.ts` declaration files with zero errors
2. `publint` and `@arethetypeswrong/cli` pass on the built package -- all subpath exports resolve correctly for both ESM and CJS consumers
3. `import { WordTimestamp, buildWordTimestamps, splitTextIntoChunks, computeCacheKey } from 'karaoke-reader'` works in a fresh TypeScript project with full type inference
4. Unit tests pass for `buildWordTimestamps` (character-to-word conversion), `splitTextIntoChunks` (sentence boundary splitting), `computeCacheKey` (SHA-256 hash), and markdown strip/parse utilities
5. React is listed as `peerDependency` and does NOT appear in the built bundle output

## Phase 2: Core Component and Hooks

**Goal:** Extract the KaraokeReader component and its hooks -- 60fps word highlighting, auto-scroll, playback controls, and status state machine -- into the package with working DOM-based sync.

**Requirements:** COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, COMP-07, COMP-08

### Success Criteria

1. `<KaraokeReader text={text} timestamps={timestamps} audioSrc={url} />` renders text and highlights words in sync with audio playback at 60fps -- verified by no React re-renders during the rAF sync loop (React DevTools Profiler shows zero component renders while playing)
2. Status transitions follow the state machine exactly: idle -> loading -> ready -> playing -> paused -> done, with error reachable from loading/playing -- verified by a test that walks through each transition
3. Auto-scroll keeps the active word within the 20%-65% viewport comfort zone during continuous playback, and pauses scrolling for 3 seconds after manual scroll
4. Space/Enter toggle play/pause, tap/click on text area toggles play/pause, volume slider adjusts audio volume -- all verified by integration tests
5. `onComplete` callback fires exactly once when audio playback reaches the end

## Phase 3: Adapters and Styling

**Goal:** Ship the optional ElevenLabs TTS adapter, the pluggable cache layer, and self-contained CSS theming with custom properties -- making the package usable without Tailwind and with a polished default look.

**Requirements:** CSS-01, CSS-02, CSS-03, ELEV-01, ELEV-02, ELEV-03, CACHE-01, CACHE-02, CACHE-03

### Success Criteria

1. `import 'karaoke-reader/styles.css'` applies the styled default (Georgia serif, dark background, amber highlight) with zero Tailwind dependency -- verified by rendering in a bare Vite project with no CSS framework
2. All visual properties (colors, fonts, sizes, transitions) change when CSS custom properties (`--kr-bg`, `--kr-highlight`, `--kr-font-family`, etc.) are set on a parent element
3. `import { useElevenLabsTTS } from 'karaoke-reader/elevenlabs'` fetches TTS audio with timestamps from ElevenLabs API and returns data compatible with `<KaraokeReader>` props -- verified by an integration test with a real API call
4. Cache adapters (`memoryCache`, `localStorageCache`) store and retrieve TTS results correctly, and cache errors (quota exceeded, corrupted data) never throw or block playback
5. The ElevenLabs adapter is fully tree-shakeable -- importing only the core `<KaraokeReader>` does not pull in any ElevenLabs-related code (verified by bundle analysis)

## Phase 4: Validation and Publication

**Goal:** Wire the extracted package back into MeinUngeheuer as its first consumer, document it for external users, and publish to npm.

**Requirements:** DOC-01, DOC-02, VAL-01, VAL-02, VAL-03

### Success Criteria

1. MeinUngeheuer tablet app imports `karaoke-reader` instead of local files, and the text display screen behaves identically to before the extraction -- verified by side-by-side manual testing (same text, same audio, same highlighting behavior)
2. README contains working code examples for both generic mode (bring-your-own timestamps + audio URL) and ElevenLabs mode (API key + text in, full karaoke out)
3. `npm install karaoke-reader` in a fresh project, copy-paste the README example, and it renders working karaoke highlighting -- verified by testing in a clean Vite + React 18 project and a clean Vite + React 19 project
4. All unit and integration tests pass in CI (`pnpm test`, `pnpm typecheck`, `publint`, `attw`)
5. Package is published to npm and the registry page shows correct type definitions, subpath exports, and peer dependency information

---
*Roadmap created: 2026-03-07*
