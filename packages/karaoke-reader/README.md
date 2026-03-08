# karaoke-reader

Word-by-word karaoke text highlighting synced to audio playback. A React component and hooks library for rendering text with real-time word highlighting, auto-scrolling, and playback controls.

## Install

```bash
npm install karaoke-reader
```

## Quick Start (Generic Mode)

Provide your own timestamps and audio URL:

```tsx
import { KaraokeReader } from 'karaoke-reader';
import 'karaoke-reader/styles.css';

function App() {
  const text = 'Hello world, this is karaoke text.';
  const timestamps = [
    { word: 'Hello', startTime: 0.0, endTime: 0.4, index: 0 },
    { word: 'world,', startTime: 0.4, endTime: 0.8, index: 1 },
    { word: 'this', startTime: 0.9, endTime: 1.1, index: 2 },
    { word: 'is', startTime: 1.1, endTime: 1.3, index: 3 },
    { word: 'karaoke', startTime: 1.3, endTime: 1.8, index: 4 },
    { word: 'text.', startTime: 1.8, endTime: 2.2, index: 5 },
  ];

  return (
    <KaraokeReader
      text={text}
      timestamps={timestamps}
      audioSrc="/audio/hello-world.mp3"
      autoPlay
    />
  );
}
```

## ElevenLabs Mode

Use the built-in ElevenLabs TTS adapter to fetch audio and word-level timestamps automatically:

```tsx
import { KaraokeReader } from 'karaoke-reader';
import { useElevenLabsTTS } from 'karaoke-reader/elevenlabs';
import 'karaoke-reader/styles.css';

function App() {
  const text = 'The quick brown fox jumps over the lazy dog.';

  const { status, result, error } = useElevenLabsTTS({
    apiKey: 'your-elevenlabs-api-key',
    voiceId: 'your-voice-id',
    text,
  });

  if (status === 'loading') return <div>Generating speech...</div>;
  if (status === 'error') return <div>Error: {error?.message}</div>;
  if (!result) return null;

  return (
    <KaraokeReader
      text={text}
      timestamps={result.timestamps}
      audioSrc={result.audioUrl}
      autoPlay
      onComplete={() => console.log('Playback finished')}
    />
  );
}
```

## Features

- **60fps word highlighting** -- rAF-driven sync with binary search, zero React re-renders during playback
- **Auto-scroll** -- keeps active word within a configurable comfort zone (20%-65% viewport)
- **Play/pause controls** -- click/tap text or press Space/Enter to toggle
- **Volume control** -- built-in slider with programmatic API
- **Markdown support** -- headers, strikethrough, list items rendered with highlighting
- **Caching** -- pluggable cache adapters (memory, localStorage, or custom)
- **ElevenLabs adapter** -- optional TTS integration with automatic text chunking
- **CSS custom properties** -- 21 `--kr-*` variables for zero-config theming
- **React 18 + 19** -- compatible with both major versions
- **Tree-shakeable** -- ElevenLabs adapter fully isolated via subpath exports

## API Reference

### `<KaraokeReader>` Component

The main component for rendering karaoke-highlighted text.

```tsx
import { KaraokeReader } from 'karaoke-reader';
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | *required* | Markdown text to render with karaoke highlighting. |
| `timestamps` | `WordTimestamp[]` | *required* | Sorted word-level timestamps (by `startTime`). |
| `audioSrc` | `string \| HTMLAudioElement` | `undefined` | Audio source -- a URL string or an existing `HTMLAudioElement`. |
| `autoPlay` | `boolean` | `false` | Whether to attempt auto-play when audio is ready. |
| `onComplete` | `() => void` | `undefined` | Fires exactly once when playback finishes. |
| `onStatusChange` | `(status: TtsStatus) => void` | `undefined` | Fires on every status transition. |
| `onError` | `(error: Error) => void` | `undefined` | Fires when an error occurs. |
| `initialVolume` | `number` | `1` | Initial volume (0.0 -- 1.0). |
| `hideControls` | `boolean` | `false` | Hide built-in playback controls. |
| `scrollComfortTop` | `number` | `0.20` | Top boundary of comfort zone as fraction 0-1. |
| `scrollComfortBottom` | `number` | `0.65` | Bottom boundary of comfort zone as fraction 0-1. |
| `scrollCooldown` | `number` | `3000` | Cooldown in ms after manual scroll before auto-scroll resumes. |
| `className` | `string` | `undefined` | Additional CSS class name(s) for the root element. |
| `style` | `CSSProperties` | `undefined` | Inline styles for the root element. |

### Hooks

#### `useKaraokeReader`

Orchestrator hook composing audio lifecycle, playback controls, and word sync.

```tsx
import { useKaraokeReader } from 'karaoke-reader/hooks';

const { status, activeWordIndex, play, pause, toggle, volume, setVolume, error, audioRef } =
  useKaraokeReader({ timestamps, audioSrc, autoPlay, initialVolume, onComplete, onStatusChange, onError });
```

#### `useAudioSync`

Low-level hook that synchronizes an `activeWordIndex` to an `HTMLAudioElement.currentTime` at 60fps using `requestAnimationFrame` and binary search.

```tsx
import { useAudioSync } from 'karaoke-reader/hooks';

const { activeWordIndex } = useAudioSync({ audio, timestamps, enabled });
```

#### `useAutoScroll`

Auto-scrolls a container to keep the active word within a comfort zone. Suppresses auto-scroll during manual scrolling with a configurable cooldown.

```tsx
import { useAutoScroll } from 'karaoke-reader/hooks';

useAutoScroll({ containerRef, activeWordIndex, wordElementsRef, comfortTop, comfortBottom, cooldownMs, enabled });
```

### Utilities

```tsx
import {
  buildWordTimestamps,
  splitTextIntoChunks,
  computeCacheKey,
  stripMarkdownForTTS,
  parseMarkdownText,
  parseContentToWords,
} from 'karaoke-reader/utils';
```

| Function | Description |
|----------|-------------|
| `buildWordTimestamps(text, alignment, timeOffset?)` | Convert character-level alignment data into word-level `WordTimestamp[]`. |
| `splitTextIntoChunks(text, maxWordsPerChunk?)` | Split long text into chunks at sentence boundaries for API limits. |
| `computeCacheKey(text, voiceId)` | Compute a SHA-256 cache key from text + voice ID. Returns `Promise<string>`. |
| `stripMarkdownForTTS(text)` | Strip markdown syntax (`#`, `~~`) to produce clean text for TTS input. |
| `parseMarkdownText(text)` | Parse markdown text into structured `ParsedParagraph[]` for rendering. |
| `parseContentToWords(content)` | Parse a content string into `ParsedWord[]` with inline strikethrough flags. |

### ElevenLabs Adapter

```tsx
import { fetchElevenLabsTTS, useElevenLabsTTS } from 'karaoke-reader/elevenlabs';
```

#### `fetchElevenLabsTTS(options)`

Fetch TTS audio with word-level timestamps from the ElevenLabs API. Handles text chunking, caching, and abort signals. Returns `{ audioUrl: string, timestamps: WordTimestamp[] }`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | *required* | ElevenLabs API key. |
| `voiceId` | `string` | *required* | Voice ID to use. |
| `text` | `string` | *required* | Text to synthesize. |
| `modelId` | `string` | `'eleven_multilingual_v2'` | TTS model ID. |
| `outputFormat` | `string` | `'mp3_44100_128'` | Audio output format. |
| `voiceSettings` | `object` | `undefined` | Voice settings (stability, similarity_boost, style, use_speaker_boost). |
| `maxWordsPerChunk` | `number` | `200` | Max words per API request chunk. |
| `cache` | `CacheAdapter` | `undefined` | Cache adapter for storing/retrieving results. |
| `signal` | `AbortSignal` | `undefined` | Abort signal for cancellation. |

#### `useElevenLabsTTS(options | null)`

React hook wrapping `fetchElevenLabsTTS`. Pass `null` to stay idle. Handles abort on cleanup and revokes blob URLs from previous results.

Returns `{ status: 'idle' | 'loading' | 'ready' | 'error', result: ElevenLabsTTSResult | null, error: Error | null }`.

### Cache Adapters

```tsx
import { createMemoryCache, createLocalStorageCache } from 'karaoke-reader';
```

| Factory | Description |
|---------|-------------|
| `createMemoryCache()` | In-memory cache backed by a `Map`. Isolated per call. |
| `createLocalStorageCache(prefix?)` | `localStorage`-backed cache. Default prefix: `'kr-tts-'`. |

Both implement the `CacheAdapter` interface:

```ts
interface CacheAdapter {
  get(key: string): Promise<TTSCacheValue | null>;
  set(key: string, value: TTSCacheValue): Promise<void>;
}
```

Cache errors (quota exceeded, corrupted data) never throw or block playback.

## Styling

Import the default stylesheet:

```tsx
import 'karaoke-reader/styles.css';
```

All visual properties are overridable via `--kr-*` CSS custom properties set on a parent element.

### CSS Custom Properties

| Variable | Default | Description |
|----------|---------|-------------|
| `--kr-bg` | `#000000` | Background color. |
| `--kr-color` | `#ffffff` | Text color. |
| `--kr-font-family` | `Georgia, 'Times New Roman', serif` | Font family. |
| `--kr-font-size` | `clamp(1.2rem, 3vw, 1.8rem)` | Font size. |
| `--kr-line-height` | `1.8` | Line height. |
| `--kr-letter-spacing` | `0.02em` | Letter spacing. |
| `--kr-padding` | `clamp(2rem, 6vw, 4rem) clamp(2rem, 8vw, 6rem)` | Container padding. |
| `--kr-max-width` | `700px` | Maximum content width. |
| `--kr-highlight-color` | `#fcd34d` | Active word highlight color. |
| `--kr-spoken-opacity` | `0.4` | Opacity of already-spoken words. |
| `--kr-upcoming-opacity` | `0.9` | Opacity of upcoming words. |
| `--kr-active-opacity` | `1` | Opacity of the active word. |
| `--kr-transition-color` | `color 0.2s ease` | Color transition. |
| `--kr-transition-opacity` | `opacity 0.4s ease` | Opacity transition. |
| `--kr-header-font-size` | `clamp(0.9rem, 2vw, 1.1rem)` | Header font size. |
| `--kr-header-opacity` | `0.5` | Header opacity. |
| `--kr-controls-opacity` | `0.15` | Controls resting opacity. |
| `--kr-controls-hover-opacity` | `0.5` | Controls hover opacity. |
| `--kr-slider-track-color` | `rgba(255, 255, 255, 0.2)` | Volume slider track color. |
| `--kr-slider-thumb-color` | `rgba(255, 255, 255, 0.4)` | Volume slider thumb color. |
| `--kr-error-color` | `#ef4444` | Error message color. |

### Theming Example

Light theme override:

```css
.my-reader {
  --kr-bg: #ffffff;
  --kr-color: #1a1a1a;
  --kr-highlight-color: #f59e0b;
  --kr-spoken-opacity: 0.3;
  --kr-slider-track-color: rgba(0, 0, 0, 0.15);
  --kr-slider-thumb-color: rgba(0, 0, 0, 0.4);
  --kr-error-color: #dc2626;
}
```

```tsx
<KaraokeReader className="my-reader" text={text} timestamps={timestamps} audioSrc={url} />
```

## Subpath Exports

| Import Path | Provides |
|-------------|----------|
| `karaoke-reader` | Types, utilities, cache factories, hooks, `KaraokeReader` component |
| `karaoke-reader/hooks` | `useAudioSync`, `useAutoScroll`, `useKaraokeReader` |
| `karaoke-reader/utils` | `buildWordTimestamps`, `splitTextIntoChunks`, `computeCacheKey`, markdown utilities |
| `karaoke-reader/elevenlabs` | `fetchElevenLabsTTS`, `useElevenLabsTTS` |
| `karaoke-reader/styles.css` | Self-contained CSS with `--kr-*` custom properties |

## TypeScript

All exports include full TypeScript declarations. The package is written in strict TypeScript with no `any` types.

Peer dependency: React 18 or 19.

Key types:

```ts
import type {
  WordTimestamp,
  AlignmentData,
  TtsStatus,
  CacheAdapter,
  TTSCacheValue,
  ParsedWord,
  ParsedLine,
  ParsedParagraph,
} from 'karaoke-reader';

import type {
  KaraokeReaderProps,
} from 'karaoke-reader';

import type {
  UseKaraokeReaderParams,
  UseKaraokeReaderReturn,
  UseAudioSyncParams,
  UseAudioSyncReturn,
  UseAutoScrollParams,
} from 'karaoke-reader/hooks';
```

## License

MIT
