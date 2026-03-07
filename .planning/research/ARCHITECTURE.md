# Architecture Research: Karaoke Text Reader Package

**Date:** 2026-03-07
**Scope:** Designing the extraction of MeinUngeheuer's TTS-synced karaoke highlighting system into a standalone, publishable npm package.

---

## 1. System Overview

The package converts text + word-level timestamps + audio into a synchronized highlighting experience. The consumer can bring their own audio and timestamps (generic mode) or use the built-in ElevenLabs adapter to generate both from text.

```
                          KARAOKE TEXT READER PACKAGE
 ============================================================================

 CONSUMER APPLICATION
 --------------------
                                                       +-------------------+
   Option A: Generic (BYO)                             |                   |
   ~~~~~~~~~~~~~~~~~~~~~~~~                            |   <KaraokeReader  |
   Consumer provides:                                  |     text={...}    |
     - WordTimestamp[]                                 |     words={...}   |
     - Audio (HTMLAudioElement | Blob | URL)           |     audio={...}   |
                          |                            |     onComplete    |
                          |                            |     theme={...}   |
                          v                            |   />              |
              +------------------------+               |                   |
              |   useKaraokeSync()     |               |   -- OR --        |
              |   (headless hook)      |<------------->|                   |
              +------------------------+               |   useKaraokeSync()|
                          |                            |   (headless)      |
                          |                            |                   |
   Option B: ElevenLabs Adapter                        +-------------------+
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   Consumer provides:
     - text (string)
     - ElevenLabs API key + voice ID
                          |
                          v
              +------------------------+
              |  useElevenLabsTTS()    |
              |  (adapter hook)        |
              +--+--+--+--------------+
                 |  |  |
   +-------------+  |  +-------------+
   |                |                 |
   v                v                 v
 TTS API       Timestamp          Cache
 Fetcher       Converter          Layer
              (char->word)     (pluggable)
```

### Three API Layers

```
 +===========================================================================+
 |                         EXPORT SURFACE                                     |
 |                                                                            |
 |   LAYER 1: Core Utilities (pure functions, zero React)                     |
 |   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                     |
 |   buildWordTimestamps()     splitTextIntoChunks()                          |
 |   stripMarkdownForTTS()     parseMarkdownText()                            |
 |   computeCacheKey()         base64ToAudioUrl()                             |
 |                                                                            |
 |   LAYER 2: Headless Hooks (React hooks, no DOM/styles)                     |
 |   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                     |
 |   useKaraokeSync()          useAudioPlayback()                             |
 |   useAutoScroll()           useWordHighlight()                             |
 |                                                                            |
 |   LAYER 3: Styled Components (React components, CSS)                       |
 |   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                      |
 |   <KaraokeReader />         <VolumeSlider />                               |
 |   <KaraokeControls />       <LoadingIndicator />                           |
 |                                                                            |
 |   ADAPTER: ElevenLabs (optional, separate subpath export)                  |
 |   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                  |
 |   useElevenLabsTTS()        createElevenLabsAdapter()                      |
 |                                                                            |
 +===========================================================================+
```

---

## 2. Component Boundaries

The current MeinUngeheuer code has two large files that each contain multiple concerns. The extraction should decompose them into units with a single responsibility.

### What Becomes a Pure Utility (no React)

| Function | Source | Rationale |
|----------|--------|-----------|
| `buildWordTimestamps()` | useTextToSpeechWithTimestamps.ts:62-127 | Pure: text + alignment -> WordTimestamp[]. No hooks, no state. |
| `splitTextIntoChunks()` | useTextToSpeechWithTimestamps.ts:133-164 | Pure: text -> string[]. Sentence-boundary splitting logic. |
| `stripMarkdownForTTS()` | TextReader.tsx:36-41 | Pure: text -> text. Removes markdown syntax before sending to TTS. |
| `parseMarkdownText()` | TextReader.tsx:91-139 | Pure: text -> ParsedParagraph[]. Markdown to renderable structure. |
| `computeCacheKey()` | ttsCache.ts:12-18 | Pure (async): text + voiceId -> SHA-256 hash string. |
| `base64PartsToAudioUrl()` | useTextToSpeechWithTimestamps.ts:229-243 | Pure: base64[] -> blob URL string. |

These functions have existing tests (`useTextToSpeechWithTimestamps.test.ts`) that transfer directly.

### What Becomes a Hook

| Hook | Responsibility | Inputs | Outputs |
|------|---------------|--------|---------|
| `useKaraokeSync` | Core sync loop: matches audio.currentTime to word index via requestAnimationFrame + binary search. | `{ words: WordTimestamp[], audio: HTMLAudioElement | null }` | `{ activeWordIndex, isPlaying, play, pause }` |
| `useAudioPlayback` | Audio lifecycle: create/destroy HTMLAudioElement, volume, play/pause state machine. | `{ src: string | Blob | null, autoPlay?, volume? }` | `{ audio, status, play, pause, volume, setVolume }` |
| `useAutoScroll` | Comfort-zone scrolling: watches activeWordIndex, scrolls container to keep active word in 20%-65% band. | `{ containerRef, activeWordIndex, wordRefs }` | (side effect only) |
| `useWordHighlight` | Direct DOM class toggling: sets active/spoken/upcoming classes on word spans. No re-renders. | `{ activeWordIndex, wordRefs }` | (side effect only) |
| `useElevenLabsTTS` | ElevenLabs-specific: fetches TTS with timestamps, handles chunking, optional caching. | `{ text, voiceId, apiKey, cache? }` | `{ words, audioSrc, status, error }` |

### What Becomes a Component

| Component | Responsibility |
|-----------|---------------|
| `<KaraokeReader>` | Full composed experience: renders parsed text with word spans, wires up all hooks, provides default styling via CSS custom properties. |
| `<KaraokeControls>` | Play/pause/skip buttons. Styled defaults, fully overridable. |
| `<VolumeSlider>` | Range input for volume. Self-contained CSS. |
| `<LoadingIndicator>` | Animated dots or spinner during TTS loading. |

### Decomposition from Current Files

```
 CURRENT (MeinUngeheuer)                  EXTRACTED (npm package)
 ========================                 ========================

 useTextToSpeechWithTimestamps.ts         src/utils/
 (555 lines, mixed concerns)               buildWordTimestamps.ts
   - buildWordTimestamps()         ->       splitTextIntoChunks.ts
   - splitTextIntoChunks()         ->       base64ToAudioUrl.ts
   - base64PartsToAudioUrl()       ->
   - fetchTtsWithTimestamps()      ->     src/adapters/elevenlabs/
   - useTextToSpeechWithTimestamps ->       fetchTtsWithTimestamps.ts
     - audio lifecycle             ->     src/hooks/
     - animation frame loop        ->       useAudioPlayback.ts
     - volume control              ->       useKaraokeSync.ts

 TextReader.tsx                           src/utils/
 (600 lines, mixed concerns)               markdown.ts (strip + parse)
   - stripMarkdownForTTS()         ->     src/hooks/
   - parseMarkdownText()           ->       useAutoScroll.ts
   - word highlighting logic       ->       useWordHighlight.ts
   - auto-scroll logic             ->     src/components/
   - UI + controls + rendering     ->       KaraokeReader.tsx
   - VolumeSlider                  ->       VolumeSlider.tsx
   - ActionButton                  ->       KaraokeControls.tsx
   - LoadingDots                   ->       LoadingIndicator.tsx

 ttsCache.ts                              src/cache/
 (78 lines, Supabase-specific)              types.ts (CacheAdapter interface)
   - computeCacheKey()             ->       memoryCache.ts (built-in default)
   - getCachedTts()                ->     src/adapters/elevenlabs/
   - storeTtsCache()               ->       supabaseCache.ts (example adapter)

 TextDisplayScreen.tsx             ->     (stays in consumer app --
 (73 lines, app-specific glue)            not part of package)
```

---

## 3. Adapter Pattern for TTS Providers

### The Interface

The package defines a generic `TTSProvider` interface. ElevenLabs ships as a built-in adapter; consumers can write their own for any TTS service.

```typescript
// src/types.ts

export interface WordTimestamp {
  word: string;
  startTime: number;   // seconds
  endTime: number;     // seconds
  index: number;       // sequential, 0-based
}

export interface TTSResult {
  /** Audio as a Blob, base64 string, or object URL */
  audio: Blob | string;
  /** Word-level timestamps, sorted by startTime */
  words: WordTimestamp[];
}

export interface TTSProvider {
  /**
   * Convert text to speech with word-level timing.
   * Implementations handle chunking, API calls, and timestamp conversion.
   */
  synthesize(text: string, options?: TTSProviderOptions): Promise<TTSResult>;
}

export interface TTSProviderOptions {
  /** Signal to abort in-flight requests */
  signal?: AbortSignal;
  /** Cache adapter for storing/retrieving results */
  cache?: CacheAdapter;
}
```

### ElevenLabs Adapter Implementation

```typescript
// src/adapters/elevenlabs/provider.ts

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string;             // default: 'eleven_multilingual_v2'
  voiceSettings?: VoiceSettings;
  maxWordsPerChunk?: number;    // default: 200
}

export function createElevenLabsProvider(config: ElevenLabsConfig): TTSProvider {
  return {
    async synthesize(text, options) {
      const chunks = splitTextIntoChunks(text, config.maxWordsPerChunk);
      // ... fetch each chunk, build word timestamps, concatenate audio
      // ... use cache if provided in options
      return { audio, words };
    }
  };
}
```

### Why This Shape

1. **Single method (`synthesize`)**: Keeps the interface minimal. A consumer implementing for Google Cloud TTS or Azure only needs one function.
2. **Returns `TTSResult`** (audio + words): The package needs both to function. Returning them together avoids coordination problems.
3. **Cache is passed in options, not baked into the provider**: Separates caching concern from synthesis concern. The same provider can be used with or without caching.
4. **AbortSignal for cancellation**: Standard web API pattern. Allows the hook to cancel on unmount without custom cancellation flags.

### Consumer-Authored Adapter Example

```typescript
// Consumer writes this for their own TTS service:
const myTTSProvider: TTSProvider = {
  async synthesize(text, options) {
    const response = await fetch('/api/my-tts', {
      method: 'POST',
      body: JSON.stringify({ text }),
      signal: options?.signal,
    });
    const { audioBlob, timestamps } = await response.json();
    return {
      audio: audioBlob,
      words: timestamps.map((t, i) => ({
        word: t.word,
        startTime: t.start,
        endTime: t.end,
        index: i,
      })),
    };
  },
};
```

---

## 4. Cache Interface Design

### The Interface

```typescript
// src/cache/types.ts

export interface CachedTTSData {
  audio: string;              // base64-encoded audio
  words: WordTimestamp[];
}

export interface CacheAdapter {
  /**
   * Retrieve cached TTS data. Returns null on miss or error.
   * Implementations MUST NOT throw -- return null on any failure.
   */
  get(key: string): Promise<CachedTTSData | null>;

  /**
   * Store TTS data. Fire-and-forget semantics -- failures are
   * logged but never thrown to the caller.
   */
  set(key: string, data: CachedTTSData): Promise<void>;
}
```

### Built-in Adapters

```
 +-------------------+     +-------------------+     +-------------------+
 |   CacheAdapter    |     |   CacheAdapter    |     |   CacheAdapter    |
 |   (interface)     |     |   (interface)     |     |   (interface)     |
 +--------+----------+     +--------+----------+     +--------+----------+
          |                         |                         |
          v                         v                         v
 +-------------------+     +-------------------+     +-------------------+
 |   memoryCache()   |     |  localStorageCache |    |  Consumer writes  |
 |   (ships w/ pkg)  |     |  (ships w/ pkg)   |     |  their own:       |
 |                   |     |                   |     |  supabaseCache,   |
 |   Map<string,     |     |  window           |     |  redisCache,      |
 |     CachedTTSData>|     |  .localStorage    |     |  indexedDBCache,  |
 |                   |     |  (with LRU evict) |     |  s3Cache, etc.    |
 +-------------------+     +-------------------+     +-------------------+
```

**memoryCache** (default, ships with package):
- In-memory `Map<string, CachedTTSData>`
- No persistence across page loads
- Optional max-entries parameter (LRU eviction)
- Zero dependencies

**localStorageCache** (ships with package):
- Uses `window.localStorage`
- Persists across page loads, same origin
- Size-aware: checks `localStorage` quota, evicts oldest entries on overflow
- Serializes audio as base64 (can be large -- warn in docs)

**supabaseCache** (ships as example/recipe, not bundled):
- Documented in README as a code recipe
- Shows how to implement `CacheAdapter` with Supabase
- Not a dependency of the package

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Cache key is computed by the adapter, not the caller | Different providers may want different key strategies. The built-in `computeCacheKey(text, voiceId)` utility is available but not mandatory. |
| `get()` returns null, never throws | Caching is optional and best-effort. A failed cache read should fall back to synthesis, not crash the experience. |
| `set()` is fire-and-forget | Storing in cache should never block the user from hearing audio. Errors are swallowed at the adapter level. |
| Audio stored as base64 string | Portable across storage backends. Blob URLs are ephemeral (session-scoped). Base64 is verbose but universally serializable. |

---

## 5. Export Structure

### Package.json Exports Map

```jsonc
{
  "name": "@vakunst/karaoke-reader",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./hooks": {
      "import": "./dist/hooks/index.js",
      "types": "./dist/hooks/index.d.ts"
    },
    "./utils": {
      "import": "./dist/utils/index.js",
      "types": "./dist/utils/index.d.ts"
    },
    "./elevenlabs": {
      "import": "./dist/adapters/elevenlabs/index.js",
      "types": "./dist/adapters/elevenlabs/index.d.ts"
    },
    "./styles.css": "./dist/styles.css"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "sideEffects": ["*.css"]
}
```

### Import Patterns for Consumers

```typescript
// Full styled component (most common use case)
import { KaraokeReader } from '@vakunst/karaoke-reader';
import '@vakunst/karaoke-reader/styles.css';

// Headless hooks only (custom UI)
import { useKaraokeSync, useAudioPlayback } from '@vakunst/karaoke-reader/hooks';

// Pure utilities only (no React)
import { buildWordTimestamps, splitTextIntoChunks } from '@vakunst/karaoke-reader/utils';

// ElevenLabs adapter (optional, tree-shakes if unused)
import { createElevenLabsProvider, useElevenLabsTTS } from '@vakunst/karaoke-reader/elevenlabs';
```

### Why Subpath Exports

1. **Tree-shaking**: A consumer using only `useKaraokeSync` does not pull in the styled components or ElevenLabs adapter.
2. **Separation of concerns**: The ElevenLabs adapter has its own fetch logic and types. Keeping it in a subpath makes clear it is optional.
3. **CSS isolation**: `styles.css` is a separate entry. Consumers who build their own UI never load it.
4. **No barrel re-export bloat**: Each subpath has its own index, avoiding the common problem where a single `index.ts` forces the bundler to parse everything.

---

## 6. Project Structure

```
karaoke-reader/
|-- package.json
|-- tsconfig.json
|-- tsup.config.ts              # Build config (ESM output, dts generation)
|-- vitest.config.ts            # Test config
|-- LICENSE
|-- README.md
|
|-- src/
|   |-- index.ts                # Main entry: re-exports components + hooks + types
|   |
|   |-- types.ts                # Core types: WordTimestamp, TTSProvider,
|   |                           #   CacheAdapter, TtsStatus, KaraokeTheme
|   |
|   |-- utils/                  # Pure functions (no React, no browser globals)
|   |   |-- index.ts
|   |   |-- buildWordTimestamps.ts
|   |   |-- buildWordTimestamps.test.ts
|   |   |-- splitTextIntoChunks.ts
|   |   |-- splitTextIntoChunks.test.ts
|   |   |-- markdown.ts         # stripMarkdownForTTS, parseMarkdownText
|   |   |-- markdown.test.ts
|   |   |-- base64ToAudioUrl.ts
|   |   |-- computeCacheKey.ts
|   |
|   |-- hooks/                  # React hooks (headless, no styles)
|   |   |-- index.ts
|   |   |-- useKaraokeSync.ts   # Core: rAF loop, binary search, activeWordIndex
|   |   |-- useKaraokeSync.test.ts
|   |   |-- useAudioPlayback.ts # Audio element lifecycle, status state machine
|   |   |-- useAudioPlayback.test.ts
|   |   |-- useAutoScroll.ts    # Comfort-zone scroll tracking
|   |   |-- useWordHighlight.ts # Direct DOM class toggling (perf)
|   |
|   |-- cache/                  # Cache adapter interface + built-in impls
|   |   |-- types.ts            # CacheAdapter interface, CachedTTSData
|   |   |-- memoryCache.ts      # In-memory Map-based cache
|   |   |-- memoryCache.test.ts
|   |   |-- localStorageCache.ts
|   |   |-- localStorageCache.test.ts
|   |
|   |-- components/             # Styled React components
|   |   |-- index.ts
|   |   |-- KaraokeReader.tsx   # Full composed experience
|   |   |-- KaraokeControls.tsx # Play/pause/skip buttons
|   |   |-- VolumeSlider.tsx
|   |   |-- LoadingIndicator.tsx
|   |
|   |-- styles/                 # Self-contained CSS (no Tailwind)
|   |   |-- karaoke-reader.css  # CSS custom properties + base styles
|   |
|   |-- adapters/
|       |-- elevenlabs/
|           |-- index.ts
|           |-- provider.ts     # createElevenLabsProvider(): TTSProvider
|           |-- provider.test.ts
|           |-- fetchTts.ts     # Raw API call to ElevenLabs with-timestamps
|           |-- types.ts        # ElevenLabs-specific types (AlignmentData, etc.)
|           |-- useElevenLabsTTS.ts  # Convenience hook wrapping provider
|
|-- examples/                   # Usage examples (not published to npm)
|   |-- generic/                # BYO timestamps + audio
|   |-- elevenlabs/             # ElevenLabs adapter with caching
|   |-- custom-ui/              # Headless hooks + custom rendering
```

### Build Tooling: tsup

tsup is chosen over Rollup for simplicity. It wraps esbuild for fast builds and generates `.d.ts` files via TypeScript compiler.

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'hooks/index': 'src/hooks/index.ts',
    'utils/index': 'src/utils/index.ts',
    'adapters/elevenlabs/index': 'src/adapters/elevenlabs/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
});
```

---

## 7. Data Flow

### Full Pipeline: Text to Highlighted Words

```
 TEXT INPUT (string)
      |
      | stripMarkdownForTTS()
      v
 CLEAN TEXT (no # or ~~ markers)
      |
      | TTSProvider.synthesize()
      |   |
      |   | splitTextIntoChunks()  (if text > 200 words)
      |   |   |
      |   |   v
      |   | [chunk1, chunk2, ...]
      |   |   |
      |   |   | (for each chunk, in sequence)
      |   |   |
      |   |   | CacheAdapter.get(key)?
      |   |   |   |-- HIT  -> use cached audio + timestamps
      |   |   |   |-- MISS -> fetch from TTS API
      |   |   |            |
      |   |   |            | fetchTtsWithTimestamps()
      |   |   |            |   -> { audio_base64, alignment }
      |   |   |            |
      |   |   |            | buildWordTimestamps(chunk, alignment, timeOffset)
      |   |   |            |   -> WordTimestamp[] for this chunk
      |   |   |            |
      |   |   |            | CacheAdapter.set(key, data)  (fire-and-forget)
      |   |   |
      |   |   | Accumulate: audioParts[], allWords[]
      |   |   |   (reindex words globally, accumulate timeOffset)
      |   |
      |   v
      | TTSResult { audio: Blob, words: WordTimestamp[] }
      |
      v
 +----+----+
 |         |
 v         v
AUDIO   WORD TIMESTAMPS
(Blob)  (WordTimestamp[])
 |         |
 |         |    parseMarkdownText(originalText)
 |         |       -> ParsedParagraph[] (with globalIndex per word)
 |         |
 v         v
 useAudioPlayback()     useKaraokeSync()
   |                      |
   | HTMLAudioElement      | activeWordIndex (updated every rAF)
   | status machine        |
   | play/pause            |
   v                      v
         +----------------------------------+
         |                                  |
         |   useWordHighlight()             |
         |     - toggles CSS classes on     |
         |       word <span> elements       |
         |     - spoken / active / upcoming |
         |     - NO React re-renders        |
         |                                  |
         |   useAutoScroll()                |
         |     - monitors activeWordIndex   |
         |     - scrolls container when     |
         |       active word leaves the     |
         |       20%-65% comfort zone       |
         |     - respects manual scroll     |
         |       cooldown (4s)              |
         |                                  |
         +----------------------------------+
                      |
                      v
              RENDERED DOM
         (word spans with classes
          toggled at 60fps via refs)
```

### The Sync Loop (Performance-Critical Path)

```
 requestAnimationFrame
      |
      v
 audio.currentTime  (float, seconds)
      |
      | Binary search over WordTimestamp[]
      | (sorted by startTime -- O(log n))
      |
      v
 activeWordIndex (integer)
      |
      | Compare to previous activeWordIndex
      |
      |-- SAME -> no DOM update, schedule next frame
      |
      |-- CHANGED ->
           |
           | 1. Previous word span:
           |      remove 'active' class
           |      add 'spoken' class
           |
           | 2. Current word span:
           |      remove 'upcoming' class
           |      add 'active' class
           |
           | 3. Check scroll position:
           |      word.getBoundingClientRect() vs container
           |      if outside comfort zone AND no recent manual scroll:
           |        container.scrollBy({ behavior: 'smooth' })
           |
           | Schedule next frame
```

### Why Direct DOM Manipulation

The existing code (TextReader.tsx lines 164-222) deliberately bypasses React's rendering pipeline for the highlight loop. This is preserved because:

1. **60fps target**: `requestAnimationFrame` fires up to 60 times/second. Running `setState` on each frame would trigger a full React reconciliation pass.
2. **Ref-based class toggling**: `span.classList.add/remove` is a direct DOM mutation. React does not need to diff the virtual DOM.
3. **No layout thrashing**: Only `classList` and occasional `getBoundingClientRect` are touched. No writes to `style` properties in the hot path.
4. **Proven in production**: This approach runs smoothly on tablets with long texts (2500+ words, 12+ audio chunks).

The package preserves this pattern in `useWordHighlight` by accepting a `Map<number, HTMLSpanElement>` ref from the consuming component.

---

## 8. Styling Strategy

### CSS Custom Properties (No Tailwind)

The current code uses Tailwind classes (`text-amber-300`, `opacity-40`, etc.) which creates a Tailwind dependency. The package replaces these with CSS custom properties that ship in a standalone `styles.css` file.

```css
/* src/styles/karaoke-reader.css */

.karaoke-reader {
  /* Layout */
  --kr-font-family: Georgia, 'Times New Roman', serif;
  --kr-font-size: clamp(1.2rem, 3vw, 1.8rem);
  --kr-line-height: 1.8;
  --kr-letter-spacing: 0.02em;
  --kr-max-width: 700px;
  --kr-padding: clamp(2rem, 6vw, 4rem) clamp(2rem, 8vw, 6rem);

  /* Colors */
  --kr-bg: #000000;
  --kr-text-color: #ffffff;
  --kr-active-color: #fcd34d;         /* amber-300 equivalent */
  --kr-spoken-opacity: 0.4;
  --kr-upcoming-opacity: 0.9;

  /* Transitions */
  --kr-color-transition: color 0.2s ease;
  --kr-opacity-transition: opacity 0.4s ease;

  /* Controls */
  --kr-control-font: system-ui, sans-serif;
  --kr-control-border: rgba(255, 255, 255, 0.3);
  --kr-control-border-hover: rgba(255, 255, 255, 0.8);
}
```

Consumers override by setting these properties on a parent element:

```css
.my-app .karaoke-reader {
  --kr-bg: #1a1a2e;
  --kr-active-color: #e94560;
  --kr-font-family: 'Inter', sans-serif;
}
```

Or via the `theme` prop on the component:

```tsx
<KaraokeReader
  theme={{
    backgroundColor: '#1a1a2e',
    activeColor: '#e94560',
    fontFamily: "'Inter', sans-serif",
  }}
/>
```

---

## 9. Build Order for Extraction

### Phase 1: Foundation (Pure Utils + Types)

Extract and test all pure functions. No React dependency at this stage.

```
 Step 1a: Create package scaffold
   - package.json, tsconfig.json, tsup.config.ts, vitest.config.ts
   - src/types.ts (WordTimestamp, TtsStatus, TTSProvider, CacheAdapter)

 Step 1b: Extract pure utilities
   - buildWordTimestamps.ts  (from useTextToSpeechWithTimestamps.ts:62-127)
   - splitTextIntoChunks.ts  (from useTextToSpeechWithTimestamps.ts:133-164)
   - markdown.ts             (from TextReader.tsx:36-139)
   - base64ToAudioUrl.ts     (from useTextToSpeechWithTimestamps.ts:229-243)
   - computeCacheKey.ts      (from ttsCache.ts:12-18)

 Step 1c: Transfer + expand tests
   - Move existing tests from useTextToSpeechWithTimestamps.test.ts
   - Add tests for markdown parsing (no existing tests)

 Gate: pnpm build && pnpm test passes.
       All pure functions work identically to original.
```

### Phase 2: Cache Layer

```
 Step 2a: Define CacheAdapter interface
   - src/cache/types.ts

 Step 2b: Implement built-in adapters
   - memoryCache.ts (Map-based, with optional LRU)
   - localStorageCache.ts (browser localStorage)

 Step 2c: Test adapters
   - get/set round-trip
   - null on miss
   - eviction behavior

 Gate: Cache adapters pass unit tests.
```

### Phase 3: Headless Hooks

```
 Step 3a: useAudioPlayback
   - Extract audio lifecycle from useTextToSpeechWithTimestamps.ts:249-554
   - Status state machine: idle -> loading -> ready -> playing -> paused -> done | error
   - Volume control, play/pause, cleanup

 Step 3b: useKaraokeSync
   - Extract rAF loop + binary search from useTextToSpeechWithTimestamps.ts:272-309
   - Input: WordTimestamp[] + HTMLAudioElement
   - Output: activeWordIndex (reactive)

 Step 3c: useWordHighlight
   - Extract DOM manipulation from TextReader.tsx:165-222
   - Input: activeWordIndex + Map<number, HTMLSpanElement>
   - Side effect: toggles CSS classes

 Step 3d: useAutoScroll
   - Extract scroll logic from TextReader.tsx:200-233
   - Input: containerRef + activeWordIndex + wordRefs
   - Side effect: scrollBy when word leaves comfort zone

 Gate: Hooks can be composed in a test harness.
       useKaraokeSync produces correct activeWordIndex for mock audio.
```

### Phase 4: ElevenLabs Adapter

```
 Step 4a: Extract fetchTtsWithTimestamps
   - From useTextToSpeechWithTimestamps.ts:172-223
   - Parameterize: remove hardcoded voice settings, accept config object

 Step 4b: Create TTSProvider implementation
   - createElevenLabsProvider(config) -> TTSProvider
   - Integrates chunking, timestamp building, caching

 Step 4c: Create convenience hook
   - useElevenLabsTTS(config) wraps provider + useAudioPlayback

 Gate: ElevenLabs adapter produces same output as original code
       for the same input text.
```

### Phase 5: Styled Components

```
 Step 5a: Create CSS file
   - Convert Tailwind classes to CSS custom properties
   - Self-contained, no external dependencies

 Step 5b: Build KaraokeReader component
   - Composes: useKaraokeSync + useAudioPlayback + useWordHighlight
                + useAutoScroll + markdown parsing
   - Renders word spans with ref callbacks
   - Accepts theme prop that maps to CSS custom properties

 Step 5c: Build sub-components
   - KaraokeControls, VolumeSlider, LoadingIndicator
   - Extract from TextReader.tsx sub-components

 Step 5d: Wire up exports
   - Main entry re-exports everything
   - Subpath exports for hooks, utils, elevenlabs

 Gate: <KaraokeReader> renders and highlights identically to
       the original TextReader component.
```

### Phase 6: Validation + Publish

```
 Step 6a: Integration test
   - Full pipeline: text -> ElevenLabs adapter -> KaraokeReader
   - Verify visual output matches original

 Step 6b: Bundle analysis
   - Check tree-shaking (importing only hooks should not pull components)
   - Verify CSS is not auto-included when using headless hooks

 Step 6c: Documentation
   - README with usage examples for all three modes
   - API reference generated from TSDoc

 Step 6d: Wire into MeinUngeheuer as consumer
   - Replace apps/tablet TextReader + useTextToSpeechWithTimestamps
     with imports from the published package
   - Verify identical behavior

 Gate: npm pack produces clean tarball.
       MeinUngeheuer tablet works identically with the extracted package.
```

---

## 10. Key Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Audio concatenation from base64 chunks may behave differently across browsers** | Silent glitches between chunks | Test on Chrome, Safari, Firefox. Consider using AudioContext.decodeAudioData for more precise concatenation if issues arise. |
| **CSS custom properties not supported in older browsers** | Broken styling on IE11 | IE11 is already excluded (React 18 does not support it). Document minimum browser versions. |
| **ElevenLabs API changes break the adapter** | Adapter stops working | Pin to specific API version in adapter. Add integration test that runs against live API (skip in CI by default). |
| **Large audio base64 in localStorage exceeds quota** | Cache silently fails | localStorageCache checks quota before write, evicts oldest entries. Document the size tradeoff in README. |
| **Consumers expect SSR support** | Hydration errors | Document that the package is browser-only. Export a `typeof window !== 'undefined'` guard in the hooks. |

---

## References

Research sources consulted:

- [Headless Component: a pattern for composing React UIs](https://martinfowler.com/articles/headless-component.html) -- Martin Fowler's article on the headless pattern as applied to React.
- [React Aria Hooks](https://react-spectrum.adobe.com/react-aria/hooks.html) -- Adobe's canonical implementation of the headless hook + styled component dual-layer pattern.
- [react-lectorem](https://github.com/kevinsmithwebdev/react-lectorem) -- An existing (simpler) React library for audio-text synchronization.
- [react-speech-highlight](https://github.com/albirrkarim/react-speech-highlight-demo) -- React text-to-speech with word/sentence highlighting, demonstrating the audio sync challenge.
- [js-tts-wrapper](https://github.com/willwade/js-tts-wrapper) -- Multi-provider TTS wrapper with unified API, demonstrating the adapter pattern for TTS services.
- [@type-cacheable](https://github.com/joshuaslate/type-cacheable) -- TypeScript caching with pluggable adapter pattern (Redis, LRU, node-cache).
- [Building React npm packages with tsup](https://www.hungrimind.com/articles/packaging-react-typescript) -- Modern guide to packaging React + TypeScript as npm modules.
- [Adapter pattern in TypeScript](https://refactoring.guru/design-patterns/adapter/typescript/example) -- Refactoring Guru's TypeScript adapter pattern reference.

---

## Summary

The package is structured around three concentric layers:

1. **Core utilities** -- pure functions, zero dependencies, testable anywhere.
2. **Headless hooks** -- React hooks that manage state and side effects without rendering anything.
3. **Styled components** -- opinionated defaults built on top of the hooks, overridable via CSS custom properties.

The ElevenLabs integration sits outside these layers as an optional adapter, accessed via a separate subpath export. Caching is similarly pluggable via the `CacheAdapter` interface.

The extraction follows a bottom-up build order: utilities first, then hooks, then components. Each phase has a clear gate. The final phase wires the package back into MeinUngeheuer as a consumer, validating that no behavior was lost.

---
*Last updated: 2026-03-07*
