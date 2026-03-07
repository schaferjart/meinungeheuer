# Feature Research: Karaoke Text Reader Component

## Research Question

What features do karaoke/text-highlighting/audio-synced-reader components typically have? What separates table stakes from differentiators? What should the MVP include?

---

## Competitive Landscape

### Direct Competitors

**react-speech-highlight** (v5.5.7)
- Paid (one-time purchase via Ko-fi). Not open-source. Demo repo only.
- Word + sentence-level highlighting synced to audio.
- Supports: audio files, Web Speech Synthesis API, TTS APIs (ElevenLabs, Google Cloud, Amazon Polly, OpenAI).
- Client-side spoken-word detection (no server timestamps required).
- SSR support, OpenAI Realtime API integration, 3D avatar sync via state.
- Streaming TTS support (highlight while text still generating).
- Vanilla JS + React.
- **Key gap our package fills:** react-speech-highlight is closed-source and paid. There is no open-source React library that does high-quality word-level highlight synced to pre-computed timestamps.

**react-text-to-speech** (MIT, active)
- Uses Web Speech API (SpeechSynthesis) as the engine.
- `useSpeech` hook and `<Speech>` component.
- Word highlighting via `onBoundary` event.
- Play, pause, stop controls.
- **Limitations:** Web Speech API `onBoundary` is unreliable across browsers (Firefox charIndex bugs, Chrome drops events after accented characters). Voice quality is browser-dependent and generally poor. No support for external TTS providers.

**react-blabla** (MIT, small)
- React hook for Web Speech API TTS.
- Play, pause, stop + karaoke-style word highlighting.
- Same Web Speech API limitations as above.

**react-karaoke-lyric** (v0.2.0, last updated 9 years ago)
- Displays karaoke lyric progress via React.
- Takes timed lyric data, renders fill-style highlighting (partial word fill).
- Music-oriented (lyrics, not prose).
- Effectively abandoned.

**transcript-tracer-js** (vanilla JS)
- Syncs audio/video with text on an HTML page using WebVTT timestamps.
- Word, phrase, or block highlighting levels.
- Click-on-word to seek audio to that timestamp.
- CSS-only styling (no React, no component library).
- `alignmentFuzziness` parameter for imperfect transcript matching.
- `timeOffset` for timing adjustments.
- Not a React component; requires manual DOM wiring.

**react-karaoke** (small, niche)
- Accessible audio player with scrolling transcript.
- Not word-level highlighting; block/paragraph level.

### Non-React / Platform Solutions

**Kindle Immersive Reading (Whispersync for Voice)**
- Simultaneous audiobook + ebook display.
- Word-by-word or sentence highlighting synced to narrator audio.
- Auto-scroll follows narration.
- Speed adjustment (0.5x-3x).
- Customizable fonts, sizes, backgrounds.
- Requires both ebook + audiobook versions of same title.
- Uses proprietary alignment data.

**Apple Books (EPUB3 Media Overlays)**
- SMIL-based sync between audio and text.
- Word-level, sentence-level, or no highlighting (content-creator choice).
- Word-by-word preferred for children's books.
- Built on open standard (EPUB3 Media Overlays / SMIL subset).
- Limited to Apple ecosystem.

**Speechify**
- Word-by-word highlighting synced to TTS voice.
- Customizable speed (0.5x to 3x+).
- Reader mode (strips page clutter).
- Adjustable text size, background color.
- Multi-platform (web, iOS, Android, Chrome extension).
- Premium AI voices (ElevenLabs-quality).
- Import any content (PDF, web page, book).

**W3C SyncMediaLite**
- W3C spec for synchronized text+media playback.
- Uses WebVTT + HTMLMediaElement TextTrackCues.
- Fires events when timestamps are reached.
- Standards-based but requires manual implementation.

### Adjacent Patterns

**Teleprompter apps** (Speakflow, Teleprompter.com)
- Voice-controlled scroll speed (microphone detects speaking pace).
- Comfort zone positioning (active line in center-lower third).
- Clean line breaks, large text, high contrast.
- No word-level highlighting, but strong auto-scroll UX.

**Amazon Polly highlight integration**
- Returns SSML marks with timestamps.
- Official AWS blog post shows DOM highlighting implementation.
- Provider-specific; not reusable across TTS engines.

---

## Feature Taxonomy

### Table Stakes (users expect these; absence is a dealbreaker)

| Feature | Why it's expected | Present in codebase? |
|---------|-------------------|---------------------|
| **Word-by-word highlighting** | Core value proposition. Every competitor does this. | Yes |
| **Play / Pause** | Basic playback control. | Yes |
| **Audio-text sync via timestamps** | The fundamental mechanism. Without it, it's not a karaoke reader. | Yes (requestAnimationFrame loop) |
| **Auto-scroll to active word** | Long text exceeds viewport; user must not lose their place. | Yes (comfort zone 20%-65%) |
| **Status states** | Consumer needs to know: loading, ready, playing, paused, done, error. | Yes (6 states) |
| **Completion callback** | Consumer needs to know when reading finishes. | Yes (onComplete) |
| **Graceful error handling** | Network failure, audio blocked, missing data -- must degrade, not crash. | Yes (error state + fallback UI) |
| **Keyboard support** | Space/Enter to pause/resume. Accessibility baseline. | Yes |
| **Volume control** | Users expect to adjust volume. | Yes (slider) |
| **CSS customization** | Consumer must be able to restyle. CSS custom properties or className overrides. | Partial (inline styles + Tailwind classes, not CSS vars) |

### Differentiators (competitive advantage; what sets this package apart)

| Feature | Why it differentiates | Present in codebase? | Effort |
|---------|----------------------|---------------------|--------|
| **Generic timestamp interface** | No competitor cleanly separates "timestamp data" from "TTS provider." react-speech-highlight is closest but paid. Our package takes `WordTimestamp[] + AudioSource` and renders -- provider-agnostic. | No (coupled to ElevenLabs) | Medium |
| **60fps DOM-based sync (no React re-renders)** | Direct DOM class manipulation via refs, not setState per frame. Competitors using React state for highlighting get jank on long texts. This is a proven perf technique. | Yes | Zero (preserve) |
| **Sentence-boundary text chunking** | Handles arbitrarily long texts by splitting at sentence boundaries. No competitor advertises this for long-form content. | Yes (splitTextIntoChunks) | Low (extract) |
| **Markdown-aware rendering** | Renders headers, strikethrough, lists while stripping markup from TTS text. No competitor handles markdown. | Yes | Low (extract) |
| **Comfort-zone auto-scroll** | Not just "scroll to word" but a defined comfort band (20%-65% viewport) with manual-scroll cooldown to prevent scroll-fighting. Teleprompter-grade UX. | Yes | Zero (preserve) |
| **Manual scroll respect** | If user scrolls manually, auto-scroll backs off for 4 seconds. Prevents the infuriating "fighting the user" problem. | Yes | Zero (preserve) |
| **Optional ElevenLabs adapter** | Built-in fetcher for ElevenLabs TTS-with-timestamps API (character-to-word conversion). Drop-in for the most popular premium TTS. | Partially (embedded in hook) | Medium (extract) |
| **Pluggable cache interface** | SHA-256 keyed cache layer with generic interface. Ships Supabase adapter as example. Prevents redundant TTS API calls. | Partially (Supabase-coupled) | Medium |
| **Self-contained CSS (no framework dependency)** | Ships with good-looking defaults (Georgia serif, dark bg, amber highlight) via CSS custom properties. Works without Tailwind, styled-components, or any framework. | No (uses Tailwind classes) | Medium |
| **Binary search for active word** | O(log n) lookup of active word from currentTime. Competitors use linear scan. Matters for 1000+ word texts. | Yes | Zero (preserve) |

### Nice-to-Have (valuable but not MVP)

| Feature | Why it's useful | Present in codebase? | Effort |
|---------|----------------|---------------------|--------|
| **Click-to-seek (tap word to jump)** | transcript-tracer-js has this. Powerful for reviewing/re-reading. | No | Medium |
| **Playback speed control** | Speechify, Kindle, every reading app offers 0.5x-3x. Audio `playbackRate` + timestamp adjustment. | No | Medium |
| **Progress indicator** | Visual progress bar showing how far through the text (% or scrubber). | No | Low |
| **Sentence-level highlighting** | Highlight the full sentence in addition to/instead of word. react-speech-highlight supports both. | No | Medium |
| **RTL text support** | Arabic, Hebrew readers. Layout direction + scroll direction. | No | Medium |
| **Streaming TTS support** | Highlight words as TTS audio streams in (before full audio is available). react-speech-highlight advertises this. | No | High |
| **WebVTT/SRT timestamp import** | Accept standard subtitle formats as timestamp source. | No | Low |
| **Headless mode (hook only, no UI)** | Expose only `useKaraokeReader` hook; consumer builds their own UI. | Partially (hook exists but UI is integrated) | Medium |
| **Multi-voice / multi-speaker** | Different highlight colors per speaker. Useful for dialogue. | No | High |
| **Preload / prefetch** | Start loading TTS while previous screen is visible. | No | Low |
| **Reduced motion support** | Respect `prefers-reduced-motion` for transitions/scrolling. | No | Low |
| **i18n for built-in UI strings** | "Paused", "Continue", "Skip" in consumer's language. | Yes (DE/EN hardcoded) | Low |

### Anti-Features (commonly requested but problematic)

| Feature | Why it's requested | Why it's problematic |
|---------|-------------------|---------------------|
| **Web Speech API as primary engine** | Free, no API key needed, built into browsers. | `onBoundary` charIndex is broken in Firefox (bug 1441503). Chrome drops events after accented characters. Voice quality varies wildly across platforms. Timing accuracy insufficient for smooth word highlighting. Every library that relies on it (react-text-to-speech, react-blabla) produces a mediocre experience. |
| **Built-in TTS for all providers** | "Just pass text, component handles TTS." | Couples the component to specific APIs. Requires API keys in client bundle. Each provider has different timestamp formats, rate limits, pricing. Better: generic interface + optional adapters. |
| **SSR / Server-side rendering** | SEO, initial paint. | This is an audio+animation component. There is nothing meaningful to render server-side. The text can be rendered, but highlighting/audio is browser-only. Pretending to support SSR adds complexity for zero value. |
| **Video sync** | "Can it sync to video instead of audio?" | Different problem domain. Video has its own timing mechanisms (WebVTT, TextTrack). Supporting video alongside audio doubles the sync surface area for a niche use case. |
| **Automatic timestamp generation** | "I just have text, generate timestamps for me." | This requires a TTS API call (which costs money and needs API keys). The component should not make API calls by default. Adapters (like the ElevenLabs one) are the right abstraction for this. |
| **Full accessibility for screen readers** | "Add ARIA live regions for every word." | Screen readers ARE text-to-speech. Having a screen reader announce words that are already being spoken by TTS audio creates cacophony. The correct a11y approach: provide a plain-text fallback, ensure keyboard controls work, let screen reader users read the text natively. |
| **Mobile native (React Native)** | "Works in React Native too?" | Completely different audio/DOM/scroll APIs. Would require a parallel implementation, not a shared one. Web-only is the correct scope. |

---

## Feature Dependencies

```
                    +-----------------------+
                    | Generic Timestamp     |
                    | Interface             |
                    | (WordTimestamp[])      |
                    +----------+------------+
                               |
              +----------------+----------------+
              |                                 |
   +----------v-----------+          +----------v-----------+
   | ElevenLabs Adapter   |          | WebVTT/SRT Import    |
   | (optional)           |          | (nice-to-have)       |
   +-----------+----------+          +----------------------+
               |
   +-----------v----------+
   | Cache Interface       |
   | (optional)            |
   +----------+------------+
              |
   +----------v-----------+
   | Supabase Adapter     |
   | (example impl)       |
   +----------------------+

   +------------------------+       +------------------------+
   | Core Renderer          |       | Headless Hook          |
   | (TextReader component) | <---> | (useKaraokeReader)     |
   +----------+-------------+       +------------------------+
              |
   +----------v-----------+
   | Self-contained CSS    |
   | (CSS custom props)    |
   +----------------------+
              |
   +----------v-----------+       +------------------------+
   | Auto-scroll Engine    |       | Click-to-seek          |
   | (comfort zone)        |       | (nice-to-have)         |
   +----------------------+       +------------------------+
              |
   +----------v-----------+
   | Playback Speed        |
   | (nice-to-have)        |
   +----------------------+
```

Key dependency chain:
1. Generic timestamp interface must exist before any adapter.
2. Self-contained CSS must be done before the component is npm-publishable (currently needs Tailwind).
3. Core renderer and headless hook are separable but should share the sync engine.
4. Click-to-seek and playback speed both depend on the core renderer being stable.

---

## MVP Definition

The MVP is: **a consumer can `npm install`, pass `WordTimestamp[] + audio URL + text`, and get a working karaoke reader with zero additional dependencies.**

### MVP Features (must ship)

1. **Generic timestamp interface** -- `WordTimestamp[]` as the primary input. No provider lock-in.
2. **Core `<KaraokeReader>` component** -- Renders text with word-by-word highlighting synced to audio.
3. **60fps DOM-based sync loop** -- Preserved from current implementation. Binary search for active word.
4. **Play / pause / done lifecycle** -- Status callback or state exposure.
5. **Auto-scroll with comfort zone** -- 20%-65% band, manual scroll cooldown.
6. **Self-contained CSS with custom properties** -- Dark theme default. Override via `--karaoke-*` custom properties. No Tailwind dependency.
7. **Keyboard support** -- Space/Enter to toggle playback.
8. **Volume control** -- Exposed as prop/callback (UI optional).
9. **onComplete callback** -- Fires when audio ends.
10. **Error handling** -- Loading/error states, autoplay-blocked fallback.
11. **Text chunking utility** -- `splitTextIntoChunks()` exported for consumers building their own TTS pipeline.
12. **Word timestamp builder** -- `buildWordTimestamps()` exported for consumers converting character-level to word-level data.

### MVP Ships Without

- ElevenLabs adapter (post-MVP; useful but not core)
- Cache layer (post-MVP; consumer responsibility)
- Click-to-seek
- Playback speed
- Markdown support (post-MVP; the core handles plain text, markdown is an optional layer)
- Streaming TTS
- Headless mode (the hook IS the headless mode; component is the styled mode)
- i18n for UI strings

### Post-MVP Roadmap

**v0.2: Adapters**
- ElevenLabs TTS-with-timestamps adapter (fetch + convert + return `WordTimestamp[]` + audio)
- Generic cache interface + Supabase example adapter
- Markdown-aware rendering mode

**v0.3: Interactivity**
- Click-to-seek (tap word, audio jumps to that timestamp)
- Playback speed control (0.5x-2x via audio.playbackRate)
- Progress indicator

**v0.4: Polish**
- Headless hook (`useKaraokeReader`) fully separated from UI
- WebVTT/SRT import utility
- Reduced motion support
- Sentence-level highlighting option

---

## Key Insight: Market Gap

The market has two poles:
1. **Free/open-source libraries** that use Web Speech API -- unreliable timing, bad voice quality, broken cross-browser.
2. **react-speech-highlight** -- good quality, but closed-source and paid.

There is no open-source React library that:
- Accepts pre-computed word timestamps from any source.
- Renders 60fps smooth highlighting without React re-render jank.
- Handles long-form text with chunking and comfort-zone scrolling.
- Ships styled defaults that look good without a CSS framework.

This is the gap. The package does not need to be a TTS provider. It needs to be the best renderer for word-timestamped text, regardless of where the timestamps come from.

---

## Sources

- [react-speech-highlight demo + repo](https://github.com/albirrkarim/react-speech-highlight-demo)
- [react-text-to-speech](https://www.npmjs.com/package/react-text-to-speech)
- [react-karaoke-lyric](https://github.com/chentsulin/react-karaoke-lyric)
- [react-blabla](https://www.npmjs.com/package/react-blabla)
- [transcript-tracer-js](https://github.com/samuelbradshaw/transcript-tracer-js)
- [ElevenLabs TTS with timestamps API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
- [W3C SyncMediaLite](https://w3c.github.io/sync-media-pub/sync-media-lite)
- [Amazon Polly highlight integration](https://aws.amazon.com/blogs/machine-learning/highlight-text-as-its-being-spoken-using-amazon-polly/)
- [Firefox onBoundary charIndex bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1441503)
- [Kindle Immersive Reading](https://blog.the-ebook-reader.com/2016/04/02/how-to-use-amazons-whispersync-for-voice-and-immersion-reading-features/)
- [Speechify text reader](https://speechify.com/text-reader/)
- [Apple Books Media Overlays](https://help.apple.com/itc/booksassetguide/en.lproj/itcf373ff8f8.html)

---

*Researched: 2026-03-07*
*Sources: npm registry, GitHub repos, product documentation, W3C specs, browser bug trackers*
