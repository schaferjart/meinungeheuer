# Project Research Summary

**Project:** Karaoke Text Reader (npm package extraction from MeinUngeheuer)
**Domain:** React component library / audio-synced text rendering
**Researched:** 2026-03-07
**Confidence:** HIGH

## Executive Summary

The karaoke text reader extraction is a well-scoped library project: take four proven files (~1,300 lines) from the MeinUngeheuer art installation and reshape them into a publishable npm package. Research confirms a clear market gap -- no open-source React library accepts generic word-level timestamps and renders 60fps-smooth highlighting without React re-render jank. The paid competitor (react-speech-highlight) validates demand; the free alternatives (react-text-to-speech, react-blabla) all rely on the unreliable Web Speech API. This package occupies the middle ground: open-source, provider-agnostic, performant.

The recommended approach is a bottom-up extraction in four phases: (1) scaffold the package with types and pure utilities, (2) extract the React hooks and core component, (3) build the ElevenLabs adapter and CSS theming system, (4) validate, document, and wire back into MeinUngeheuer as a consumer. The stack is deliberately conservative -- tsup for bundling, Vitest for testing, Biome for linting, plain CSS with custom properties for styling. Every technology is either already in use in the monorepo or is the obvious modern default for greenfield React libraries.

The primary risks are concentrated in two areas: npm publishing mechanics (exports map, peer dependencies, tree-shaking, TypeScript declarations) and the browser audio pipeline (autoplay policy, chunk boundary timing, mobile session conflicts). Both are well-understood domains with established solutions. The pitfalls research catalogued 25 specific failure modes with mitigations, organized by phase. None require novel solutions -- they require discipline in applying known patterns correctly.

## Key Findings

### Recommended Stack

The stack prioritizes stability and zero-config consumer experience. See [STACK.md](STACK.md) for full details.

**Core technologies:**
- **TypeScript 5.8 + tsup 8.5**: Language and bundler -- tsup handles ESM+CJS dual output and `.d.ts` generation with zero config. tsdown (Rolldown-based successor) is promising but still 0.x; easy migration path later.
- **React 18/19 as peer dependency**: Declare `"react": "^18.0.0 || ^19.0.0"`. The package uses only basic hooks (useState, useRef, useCallback, useEffect, useMemo) -- no APIs exclusive to 19.
- **Plain CSS with custom properties**: No framework dependency. Ship a single CSS file with `--kr-*` variables. Consumers override variables; no Tailwind, no CSS-in-JS, no build plugin required.
- **Biome 2.x**: Replaces ESLint + Prettier with a single Rust binary, 10-25x faster. Greenfield means no migration cost.
- **Vitest 3.x + happy-dom**: Match monorepo's existing test runner. happy-dom is 3-10x faster than jsdom and covers our DOM needs (classList toggling, scrolling).
- **publint + @arethetypeswrong/cli**: Validate package.json exports and TypeScript type resolution before every publish. Catches the subtle mistakes that break consumers.

### Expected Features

Research surveyed 6 direct competitors, 4 platform solutions, and adjacent patterns (teleprompters, W3C specs). See [FEATURES.md](FEATURES.md) for the full taxonomy.

**Must have (table stakes):**
- Word-by-word highlighting synced to audio via timestamps
- Play / pause lifecycle with status states (idle, loading, ready, playing, paused, done, error)
- Auto-scroll keeping active word in a comfort zone (20%-65% viewport)
- Keyboard support (Space/Enter to toggle playback)
- Volume control
- CSS customization via custom properties
- onComplete callback
- Graceful error handling (network failure, autoplay blocked)

**Should have (differentiators):**
- Generic timestamp interface (`WordTimestamp[]`) -- provider-agnostic, not locked to any TTS service
- 60fps DOM-based sync (direct class toggling, no React re-renders in hot path)
- Sentence-boundary text chunking for arbitrarily long texts
- Comfort-zone auto-scroll with manual-scroll cooldown (teleprompter-grade UX)
- Binary search for active word (O(log n), matters for 1000+ word texts)
- Optional ElevenLabs adapter as separate subpath export
- Pluggable cache interface

**Defer (v2+):**
- Click-to-seek (tap word to jump audio)
- Playback speed control (0.5x-2x)
- Streaming TTS support
- WebVTT/SRT timestamp import
- Sentence-level highlighting
- RTL text support

### Architecture Approach

The package is structured as three concentric layers: pure utilities (zero React), headless hooks (React hooks, no DOM/styles), and styled components (opinionated defaults via CSS custom properties). The ElevenLabs adapter sits outside these layers as an optional subpath export. See [ARCHITECTURE.md](ARCHITECTURE.md) for full component boundaries and data flow diagrams.

**Major components:**
1. **Pure utilities** (`buildWordTimestamps`, `splitTextIntoChunks`, `markdown`, `computeCacheKey`) -- extracted from existing 555-line hook, fully tested, no React dependency
2. **Headless hooks** (`useKaraokeSync`, `useAudioPlayback`, `useAutoScroll`, `useWordHighlight`) -- decomposed from the current monolithic hook, each with single responsibility
3. **Styled component** (`<KaraokeReader>`) -- composes all hooks, renders word spans with ref callbacks, applies CSS custom properties
4. **ElevenLabs adapter** (`createElevenLabsProvider`, `useElevenLabsTTS`) -- optional, separate subpath export, calls REST API directly via fetch (no SDK dependency)
5. **Cache layer** (`CacheAdapter` interface + `memoryCache` + `localStorageCache` built-ins) -- pluggable, fire-and-forget semantics

### Critical Pitfalls

25 pitfalls catalogued across 7 categories. See [PITFALLS.md](PITFALLS.md) for the complete list with mitigations. The top 5 by impact:

1. **Incorrect exports map / missing TypeScript declarations** -- Validate with `publint` and `arethetypeswrong` before every publish. Define `"types"` first in every exports condition. Mirror in `"main"` and `"module"` for backward compatibility.
2. **Bundling React into the package** -- List as `peerDependencies`, never `dependencies`. Mark as `external` in tsup config. Verify built output does not resolve React to an absolute path.
3. **Tailwind classes leaking into published package** -- Convert all 30+ Tailwind utilities to plain CSS with `kr-` prefixed class names. Ship via inline `<style>` block (self-contained) plus importable `.css` file.
4. **Animation loop never stops (memory leak)** -- Add `mountedRef` guard, check status before rescheduling `requestAnimationFrame`. Current code reschedules unconditionally.
5. **Browser autoplay policy blocks audio silently** -- Move `setStatus('playing')` into `audio.play().then()`. Export `autoplayBlocked` state. Document that `autoPlay: true` requires prior user gesture.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Package Foundation
**Rationale:** Everything else depends on a correct package scaffold. The exports map, peer dependencies, and TypeScript declaration setup must be right from day one -- fixing these retroactively is painful and risks breaking early consumers. This phase has zero creative ambiguity; it is pure mechanical correctness.
**Delivers:** Working package scaffold (package.json, tsconfig, tsup config, Biome config, Vitest config), all pure utility functions extracted with tests, core type definitions (`WordTimestamp`, `TTSProvider`, `CacheAdapter`, `TtsStatus`).
**Addresses:** Generic timestamp interface (FEATURES), text chunking utility (FEATURES), word timestamp builder (FEATURES).
**Avoids:** Incorrect exports map (Pitfall 3.1), bundling React (3.2), missing TypeScript declarations (3.3), phantom dependencies (4.1), broken import paths (4.2), environment variable references (4.3).

### Phase 2: Core Hooks and Component
**Rationale:** The hooks and component are the product. They depend on the utilities and types from Phase 1 but are independent of the ElevenLabs adapter and CSS theming (they can use inline styles or minimal CSS during development). This is the highest-risk phase because the rAF sync loop, DOM manipulation, and audio lifecycle management contain the most subtle bugs.
**Delivers:** `useKaraokeSync`, `useAudioPlayback`, `useAutoScroll`, `useWordHighlight` hooks. `<KaraokeReader>` component with basic styling. Cache adapter interface with `memoryCache` and `localStorageCache` implementations.
**Addresses:** 60fps DOM-based sync (FEATURES), play/pause lifecycle (FEATURES), auto-scroll with comfort zone (FEATURES), keyboard support (FEATURES), volume control (FEATURES), error handling (FEATURES).
**Avoids:** Animation loop memory leak (6.1), autoplay policy (1.2), ref map cleanup (2.2), Blob URL leaks (2.4), stale closure (6.2), race condition on text change (7.3).

### Phase 3: ElevenLabs Adapter and CSS Theming
**Rationale:** The adapter and theming are independent of each other but both depend on the stable core from Phase 2. The ElevenLabs adapter is the primary "drop-in" value proposition -- without it, consumers must build their own TTS pipeline. CSS theming is what makes the package usable without Tailwind. These can be developed in parallel.
**Delivers:** `createElevenLabsProvider()` + `useElevenLabsTTS()` hook. Self-contained CSS file with `--kr-*` custom properties. Theme prop on `<KaraokeReader>`. Markdown-aware rendering mode.
**Addresses:** Optional ElevenLabs adapter (FEATURES), self-contained CSS (FEATURES), markdown support (FEATURES).
**Avoids:** Tailwind class leaking (5.1), CSS specificity wars (5.2), dark/light theme assumptions (5.3), CSS bundling issues (3.5), chunk boundary timing gaps (1.4).

### Phase 4: Validation, Documentation, and Consumer Wiring
**Rationale:** The package is functionally complete after Phase 3. This phase validates it works outside the monorepo, documents it for external consumers, and wires it back into MeinUngeheuer as the first real consumer. This is the gate before npm publish.
**Delivers:** Integration tests (full pipeline: text -> ElevenLabs -> KaraokeReader). Bundle analysis (tree-shaking verification). README with usage examples for generic, ElevenLabs, and headless modes. MeinUngeheuer tablet app refactored to import from the package. CI pipeline (typecheck, test, publint, attw, size-limit). First npm publish.
**Addresses:** Documentation (FEATURES), npm-publishable structure (FEATURES).
**Avoids:** Tree-shaking failures (3.4), React version compatibility (4.4), timing drift on low-end devices (1.1), publishing stale builds (7.4).

### Phase Ordering Rationale

- **Phase 1 before everything:** The exports map, peer dependencies, and TypeScript setup are load-bearing infrastructure. Getting them wrong means every subsequent phase builds on a broken foundation. Research shows these are the #1 cause of npm package bugs (Pitfalls 3.1-3.4, 4.1-4.3).
- **Phase 2 before Phase 3:** The hooks are the core product. The ElevenLabs adapter and CSS theming are layers on top. Building the adapter first would mean testing it against an unstable core, wasting time on integration bugs that vanish once the core stabilizes.
- **Phase 3 parallelizable:** The ElevenLabs adapter and CSS theming have no dependency on each other. They both depend on Phase 2's stable hooks. If resources allow, they can be developed simultaneously.
- **Phase 4 last:** Validation and documentation are meaningless until the code is feature-complete. Wiring into MeinUngeheuer is the ultimate integration test -- if the tablet app works identically with the extracted package, the extraction succeeded.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** The rAF sync loop and DOM manipulation architecture require careful implementation. The current code works but has a known issue (animation loop reschedules unconditionally). The extraction must fix this while preserving the 60fps performance characteristic. Worth spiking with a minimal test harness before committing to the full component.
- **Phase 3 (CSS):** Converting 30+ Tailwind utilities to plain CSS with correct specificity and theming is the most labor-intensive task. Research identified CSS Layers (`@layer`) as a potential solution for specificity conflicts, but adoption is still emerging. Test in at least 3 consumer CSS environments (bare HTML, Bootstrap, Tailwind v3 app).

Phases with standard patterns (skip deep research):
- **Phase 1:** Package scaffolding is fully documented by tsup, publint, and arethetypeswrong. The Stack research provides exact versions and configurations. No ambiguity.
- **Phase 4:** Validation and documentation follow established npm library patterns. CI setup is standard GitHub Actions. No novel work required.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All tools verified against latest npm versions and official docs. tsup 8.5, Vitest 3.x, Biome 2.x, TypeScript 5.8 are all current stable releases. |
| Features | HIGH | Surveyed 6 direct competitors and 4 platform solutions. Market gap is clear and validated by react-speech-highlight's paid model. MVP feature set directly maps to existing working code. |
| Architecture | HIGH | Three-layer pattern (utils/hooks/components) is the React Aria / Radix UI standard. Adapter pattern for TTS providers is textbook. Data flow diagrams map 1:1 to existing code. |
| Pitfalls | HIGH | 25 pitfalls catalogued from codebase analysis + React library publishing best practices. Every pitfall includes a concrete mitigation. No speculative risks -- all are based on known failure modes. |

**Overall confidence:** HIGH

The project has unusually high confidence because: (1) the core code already works in production, (2) the extraction is a refactoring task, not a greenfield build, (3) the target domain (React component libraries) has well-documented patterns and tooling, and (4) the market gap is validated by existing competitors.

### Gaps to Address

- **Audio format for chunk concatenation:** The current code concatenates MP3 chunks at the byte level, which introduces timing gaps due to MP3 encoder padding. Research suggests using PCM output from ElevenLabs for gapless concatenation, but this has not been validated. Test during Phase 3 (ElevenLabs adapter) with actual API calls.
- **CSS Layers browser support:** `@layer` is supported in all modern browsers but may cause issues in older consumer build tools that strip or transform CSS at-rules. Validate during Phase 3 by testing the published CSS in Webpack 4/5 and Vite consumers.
- **React 19 ref behavior:** React 19 changes `ref` handling (no more `forwardRef`). The current code uses `useRef` internally but may need to expose refs to consumers. Validate during Phase 4 by testing against React 19.x.
- **CJK word boundary detection:** The `buildWordTimestamps` function splits on whitespace, which fails for Chinese/Japanese/Korean text. This is documented as a known limitation, not a gap to solve before v1, but `Intl.Segmenter` should be evaluated as a future solution.
- **Bundle size budget:** Stack research targets <5KB gzipped for core, <8KB with ElevenLabs adapter. These budgets are estimates based on the current code size. Validate with `size-limit` during Phase 4 and adjust if needed.

## Sources

### Primary (HIGH confidence)
- [tsup documentation](https://tsup.egoist.dev/) -- bundler config, DTS generation, CSS handling
- [publint](https://publint.dev/rules) -- package.json validation rules
- [arethetypeswrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io) -- TypeScript type resolution checks
- [React versions page](https://react.dev/versions) -- React 18/19 compatibility
- [ElevenLabs TTS with timestamps API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) -- alignment data format

### Secondary (MEDIUM confidence)
- [react-speech-highlight demo](https://github.com/albirrkarim/react-speech-highlight-demo) -- competitor analysis, feature benchmarking
- [Martin Fowler: Headless Component pattern](https://martinfowler.com/articles/headless-component.html) -- architecture pattern validation
- [React Aria Hooks](https://react-spectrum.adobe.com/react-aria/hooks.html) -- headless hook + styled component dual-layer pattern reference
- [Biome v2 migration guide](https://biomejs.dev/guides/migrate-eslint-prettier/) -- linter/formatter setup
- [Building npm packages with ESM and CJS (2024)](https://dev.to/snyk/building-an-npm-package-compatible-with-esm-and-cjs-in-2024-88m) -- exports map patterns

### Tertiary (LOW confidence)
- [tsdown](https://tsdown.dev/) -- future bundler migration path (0.x, API unstable)
- [Firefox onBoundary charIndex bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1441503) -- Web Speech API limitation (validates our decision to avoid it)
- [W3C SyncMediaLite](https://w3c.github.io/sync-media-pub/sync-media-lite) -- standards-based sync approach (informational, not used directly)

---
*Research completed: 2026-03-07*
*Ready for roadmap: yes*
