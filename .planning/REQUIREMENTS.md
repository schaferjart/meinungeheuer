# Requirements: Karaoke Text Reader

**Defined:** 2026-03-07
**Core Value:** Buttery-smooth word highlighting that stays perfectly synced to audio, with zero jank

## v1 Requirements

### Package Structure

- [x] **PKG-01**: Package scaffolded with tsup, TypeScript strict mode, ESM+CJS dual output
- [x] **PKG-02**: Correct package.json exports map with subpath exports (root, /hooks, /utils, /elevenlabs, /styles.css) validated by publint + attw
- [x] **PKG-03**: React 18/19 declared as peerDependency, never bundled
- [x] **PKG-04**: Zero runtime dependencies beyond React peer dep
- [x] **PKG-05**: TypeScript declarations generated and correctly resolved for all exports

### Core Types & Utilities

- [x] **UTIL-01**: `WordTimestamp` interface exported (word, startTime, endTime, index)
- [x] **UTIL-02**: `buildWordTimestamps(text, alignment, timeOffset)` pure function converts character-level to word-level timestamps
- [x] **UTIL-03**: `splitTextIntoChunks(text, maxWords)` splits long text at sentence boundaries
- [x] **UTIL-04**: `computeCacheKey(text, voiceId)` SHA-256 cache key generation
- [x] **UTIL-05**: Markdown strip/parse utilities (strip for TTS, parse for rendering with strikethrough support)

### Core Component

- [x] **COMP-01**: `<KaraokeReader>` component accepts text + WordTimestamp[] + audio source and renders word-by-word highlighting
- [x] **COMP-02**: 60fps sync loop via requestAnimationFrame with binary search for active word — direct DOM class toggling, no React re-renders
- [x] **COMP-03**: Status state machine: idle → loading → ready → playing → paused → done | error
- [x] **COMP-04**: Auto-scroll keeps active word in comfort zone (20%-65% viewport band) with manual-scroll cooldown
- [x] **COMP-05**: Play/pause via tap/click on text area, Space/Enter keyboard support
- [x] **COMP-06**: Volume slider control
- [x] **COMP-07**: onComplete callback fires when audio finishes
- [x] **COMP-08**: Graceful error handling — loading state, error state with fallback UI, autoplay-blocked detection

### Styling

- [ ] **CSS-01**: Self-contained CSS with no Tailwind dependency — all styles via plain CSS with `--kr-*` custom properties
- [ ] **CSS-02**: Styled default ships looking good (Georgia serif, dark background, amber highlight, smooth transitions)
- [ ] **CSS-03**: All visual properties overridable via CSS custom properties (colors, fonts, sizes, transitions)

### ElevenLabs Adapter

- [ ] **ELEV-01**: Optional ElevenLabs adapter as separate subpath export (`karaoke-reader/elevenlabs`)
- [ ] **ELEV-02**: Fetches TTS audio with character-level timestamps, converts to WordTimestamp[] via buildWordTimestamps
- [ ] **ELEV-03**: Text chunking for long inputs (stays within ElevenLabs API limits)

### Cache Layer

- [x] **CACHE-01**: Generic `CacheAdapter` interface (get/set) exported
- [x] **CACHE-02**: Built-in in-memory and localStorage cache adapters
- [x] **CACHE-03**: Fire-and-forget semantics — cache errors never throw or block playback

### Documentation

- [ ] **DOC-01**: README with usage examples: generic mode (timestamps + audio URL) and ElevenLabs mode
- [ ] **DOC-02**: Published to npm, installable via `npm install karaoke-reader`

### Validation

- [ ] **VAL-01**: MeinUngeheuer tablet app wired to consume the extracted package with zero behavior regression
- [ ] **VAL-02**: Core logic has unit tests (timestamp conversion, text chunking, cache key)
- [ ] **VAL-03**: Hook and component have integration tests (DOM class toggling, status transitions)

## v2 Requirements

### Interactivity

- **INT-01**: Click-to-seek — tap a word to jump audio to that timestamp
- **INT-02**: Playback speed control (0.5x to 2x) with timestamp adjustment

### Format Support

- **FMT-01**: WebVTT/SRT timestamp import utility
- **FMT-02**: Sentence-level highlighting mode (in addition to word-level)

### Accessibility & i18n

- **A11Y-01**: Reduced motion support (respect prefers-reduced-motion)
- **I18N-01**: i18n for built-in UI strings ("Paused", "Continue", "Skip")
- **FMT-03**: RTL text support

### Advanced

- **ADV-01**: Headless mode — export hooks only, consumer controls all rendering
- **ADV-02**: Streaming TTS support (highlight as audio streams in)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web Speech API engine | `onBoundary` is broken in Firefox, unreliable in Chrome. Every library using it produces mediocre results. |
| Server-side rendering | Audio+animation component — nothing meaningful to render server-side |
| React Native | Completely different audio/DOM/scroll APIs — would be a separate package |
| Video sync | Different problem domain with its own timing mechanisms (WebVTT, TextTrack) |
| Built-in TTS for all providers | Couples component to specific APIs. Generic interface + optional adapters is the right abstraction |
| Automatic timestamp generation | Requires API calls with costs/keys. Adapters handle this, not the core component |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01 | Phase 1 | Complete |
| PKG-02 | Phase 1 | Complete |
| PKG-03 | Phase 1 | Complete |
| PKG-04 | Phase 1 | Complete |
| PKG-05 | Phase 1 | Complete |
| UTIL-01 | Phase 1 | Complete |
| UTIL-02 | Phase 1 | Complete |
| UTIL-03 | Phase 1 | Complete |
| UTIL-04 | Phase 1 | Complete |
| UTIL-05 | Phase 1 | Complete |
| COMP-01 | Phase 2 | Complete |
| COMP-02 | Phase 2 | Complete |
| COMP-03 | Phase 2 | Complete |
| COMP-04 | Phase 2 | Complete |
| COMP-05 | Phase 2 | Complete |
| COMP-06 | Phase 2 | Complete |
| COMP-07 | Phase 2 | Complete |
| COMP-08 | Phase 2 | Complete |
| CSS-01 | Phase 3 | Pending |
| CSS-02 | Phase 3 | Pending |
| CSS-03 | Phase 3 | Pending |
| ELEV-01 | Phase 3 | Pending |
| ELEV-02 | Phase 3 | Pending |
| ELEV-03 | Phase 3 | Pending |
| CACHE-01 | Phase 3 | Complete |
| CACHE-02 | Phase 3 | Complete |
| CACHE-03 | Phase 3 | Complete |
| DOC-01 | Phase 4 | Pending |
| DOC-02 | Phase 4 | Pending |
| VAL-01 | Phase 4 | Pending |
| VAL-02 | Phase 4 | Pending |
| VAL-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after initial definition*
