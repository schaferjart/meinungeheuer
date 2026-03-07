# Karaoke Text Reader

## What This Is

A standalone React component that renders text with word-by-word karaoke highlighting synced to audio playback. Extracted from MeinUngeheuer's proven text display system. Consumer provides text + word-level timestamps + audio — the component handles rendering, highlighting, scrolling, and playback controls.

Published as an npm package so any React project can drop in a polished TTS-synced reading experience.

## Core Value

Buttery-smooth word highlighting that stays perfectly synced to audio, with zero jank on scroll or transition — the reading experience must feel effortless.

## Requirements

### Validated

<!-- Already working in MeinUngeheuer — proven in production. -->

- [x] Word-by-word highlight synced to audio.currentTime via requestAnimationFrame
- [x] Character-to-word timestamp conversion (ElevenLabs alignment data)
- [x] Text chunking for long inputs (sentence-boundary splitting, ~200 words/chunk)
- [x] Auto-scroll that keeps active word in comfort zone (20%-65% viewport)
- [x] Tap/click to pause/resume, keyboard support (Space/Enter)
- [x] Status state machine: idle -> loading -> ready -> playing -> paused -> done | error
- [x] Markdown support (headers, strikethrough stripped from TTS, rendered visually)
- [x] Styled default: Georgia serif, dark background, amber highlight, smooth opacity transitions
- [x] TTS cache layer (SHA-256 keyed, prevents re-fetching identical queries)
- [x] Volume slider control

### Active

<!-- New work to make it reusable. -->

- [ ] Generic timestamp interface — accept `WordTimestamp[]` + audio from any source, not just ElevenLabs
- [ ] Optional ElevenLabs adapter — built-in fetcher for ElevenLabs TTS-with-timestamps API
- [ ] Optional cache adapter — pluggable cache (Supabase adapter ships as example, but interface is generic)
- [ ] npm-publishable package structure with proper exports, types, and peer dependencies
- [ ] CSS that works without Tailwind (self-contained styles, overridable via CSS custom properties)
- [ ] Documentation with usage examples (generic mode + ElevenLabs mode)

### Out of Scope

- Custom TTS providers beyond ElevenLabs — generic interface is enough, adapters are consumer's job
- Server-side rendering — this is an audio+animation component, browser-only is fine
- Mobile native — React (web) only
- Video sync — audio only
- Accessibility beyond keyboard controls — screen readers don't need karaoke highlighting

## Context

The component is battle-tested inside MeinUngeheuer, an art installation where visitors read text on a tablet with TTS-synced karaoke highlighting. The current implementation lives across 4 files (~1,300 lines):

- `useTextToSpeechWithTimestamps.ts` (555 lines) — TTS fetching, chunking, timestamp conversion, audio playback, sync loop
- `TextReader.tsx` (600 lines) — Visual component with highlighting, auto-scroll, controls, markdown parsing
- `ttsCache.ts` (78 lines) — Supabase-backed cache layer
- `TextDisplayScreen.tsx` (73 lines) — Thin wrapper passing config

The highlighting uses direct DOM manipulation (ref-based class toggling) to avoid React re-renders during playback — this is a deliberate performance choice that must be preserved.

## Constraints

- **React 18+**: Uses hooks, refs, requestAnimationFrame patterns
- **Browser-only**: Web Audio API, Blob URLs, crypto.subtle for SHA-256
- **No Tailwind dependency**: Extracted styles must be self-contained CSS
- **Peer dependency**: React 18+ only (don't bundle React)
- **Bundle size**: Keep lean — no heavy dependencies beyond React

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Generic timestamps as primary interface | Decouples from ElevenLabs, any TTS provider works | -- Pending |
| ElevenLabs as optional adapter, not core | Most reusable — consumers choose their TTS | -- Pending |
| Styled default with CSS custom properties | Ships looking good, but overridable without fighting a framework | -- Pending |
| npm package (not monorepo-only) | Maximum reuse — anyone can install it | -- Pending |
| Keep DOM manipulation for highlighting | React re-renders would cause jank at 60fps sync | -- Pending |

---
*Last updated: 2026-03-07 after initialization*
