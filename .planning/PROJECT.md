# Karaoke Text Reader

## What This Is

A standalone React component (`karaoke-reader` on npm) that renders text with word-by-word karaoke highlighting synced to audio playback. Extracted from MeinUngeheuer's text display system and published as a reusable package. Consumer provides text + word-level timestamps + audio — the component handles rendering, highlighting, scrolling, and playback controls. Optional ElevenLabs TTS adapter included as a tree-shakeable subpath export.

## Core Value

Buttery-smooth word highlighting that stays perfectly synced to audio, with zero jank on scroll or transition — the reading experience must feel effortless.

## Requirements

### Validated

- ✓ Word-by-word highlight synced to audio.currentTime via requestAnimationFrame — v1.0
- ✓ Character-to-word timestamp conversion (ElevenLabs alignment data) — v1.0
- ✓ Text chunking for long inputs (sentence-boundary splitting, ~200 words/chunk) — v1.0
- ✓ Auto-scroll that keeps active word in comfort zone (20%-65% viewport) — v1.0
- ✓ Tap/click to pause/resume, keyboard support (Space/Enter) — v1.0
- ✓ Status state machine: idle → loading → ready → playing → paused → done | error — v1.0
- ✓ Markdown support (headers, strikethrough stripped from TTS, rendered visually) — v1.0
- ✓ Styled default: Georgia serif, dark background, amber highlight, smooth opacity transitions — v1.0
- ✓ TTS cache layer (SHA-256 keyed, prevents re-fetching identical queries) — v1.0
- ✓ Volume slider control — v1.0
- ✓ Generic timestamp interface — accept WordTimestamp[] + audio from any source — v1.0
- ✓ Optional ElevenLabs adapter as tree-shakeable subpath export — v1.0
- ✓ Optional cache adapter with pluggable interface (memory, localStorage, Supabase) — v1.0
- ✓ npm-publishable package with ESM+CJS dual format, TypeScript declarations, subpath exports — v1.0
- ✓ Self-contained CSS with 21 `--kr-*` custom properties, no Tailwind dependency — v1.0
- ✓ README with generic mode + ElevenLabs mode examples — v1.0

### Active

- [ ] Click-to-seek — tap a word to jump audio to that timestamp (INT-01)
- [ ] Playback speed control 0.5x-2x with timestamp adjustment (INT-02)
- [ ] WebVTT/SRT timestamp import utility (FMT-01)
- [ ] Sentence-level highlighting mode (FMT-02)
- [ ] Reduced motion support — respect prefers-reduced-motion (A11Y-01)
- [ ] Headless mode — export hooks only, consumer controls rendering (ADV-01)

### Out of Scope

- Custom TTS providers beyond ElevenLabs — generic interface is enough, adapters are consumer's job
- Server-side rendering — this is an audio+animation component, browser-only is fine
- Mobile native — React (web) only
- Video sync — audio only
- Web Speech API engine — `onBoundary` is broken in Firefox, unreliable in Chrome
- RTL text support — deferred, needs separate layout engine
- Streaming TTS support — deferred, requires fundamentally different timing model
- i18n for UI strings — deferred, minimal built-in UI

## Context

Published as `karaoke-reader` v0.1.0 on npm. 3,911 lines of TypeScript/TSX/CSS across the package. 138 passing tests (111 in package, 27 in tablet consumer). MeinUngeheuer tablet app is the first production consumer via workspace dependency.

Package structure:
- `karaoke-reader` — core component, types, utilities
- `karaoke-reader/hooks` — useAudioSync, useAutoScroll, useKaraokeReader
- `karaoke-reader/utils` — buildWordTimestamps, splitTextIntoChunks, computeCacheKey, markdown
- `karaoke-reader/elevenlabs` — optional ElevenLabs TTS adapter (tree-shakeable)
- `karaoke-reader/styles.css` — self-contained CSS theming

## Constraints

- **React 18/19**: Peer dependency, never bundled
- **Browser-only**: Web Audio API, Blob URLs, crypto.subtle for SHA-256
- **Zero runtime dependencies**: Only React as peer dep
- **No Tailwind dependency**: Self-contained CSS with custom properties
- **Bundle size**: Keep lean — tsup with tree-shaking and code splitting

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Generic timestamps as primary interface | Decouples from ElevenLabs, any TTS provider works | ✓ Good — clean separation |
| ElevenLabs as optional adapter, not core | Most reusable — consumers choose their TTS | ✓ Good — tree-shakes cleanly |
| Styled default with CSS custom properties | Ships looking good, but overridable without fighting a framework | ✓ Good — 21 properties, zero-config theming |
| npm package (not monorepo-only) | Maximum reuse — anyone can install it | ✓ Good — v0.1.0 published |
| Keep DOM manipulation for highlighting | React re-renders would cause jank at 60fps sync | ✓ Good — data-kr-state attrs, no re-renders |
| tsup with ESM+CJS dual format | Maximum compatibility across module systems | ✓ Good — publint + attw all green |
| happy-dom + MockAudio for tests | happy-dom's Audio is incomplete; custom MockAudio extends EventTarget | ✓ Good — reliable, fast tests |
| Fire-and-forget cache semantics | Cache errors must never block playback | ✓ Good — .catch() swallows all cache rejections |
| prepublishOnly quality gate | Prevent publishing broken packages | ✓ Good — build + test + check-exports |

---
*Last updated: 2026-03-08 after v1.0 milestone*
