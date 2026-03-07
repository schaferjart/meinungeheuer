# Phase 3 Research: Adapters and Styling

**Researched:** 2026-03-07
**Scope:** CSS-01 through CSS-03, ELEV-01 through ELEV-03, CACHE-01 through CACHE-03
**Input:** Existing `useTextToSpeechWithTimestamps.ts` (reference implementation), `ttsCache.ts` (reference cache), Phase 1-2 package scaffold with KaraokeReader component

---

## 1. ElevenLabs TTS with-Timestamps API

### Endpoint

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps
```

Header: `xi-api-key: <apiKey>`, `Content-Type: application/json`

### Request Body

```json
{
  "text": "The text to convert",
  "model_id": "eleven_multilingual_v2",
  "output_format": "mp3_44100_128",
  "voice_settings": {
    "stability": 0.35,
    "similarity_boost": 0.65,
    "style": 0.6,
    "use_speaker_boost": true
  }
}
```

Optional fields: `language_code`, `seed`, `previous_text`, `next_text`, `previous_request_ids`, `next_request_ids`, `pronunciation_dictionary_locators`, `apply_text_normalization`, `speed`.

### Response Format

A single JSON object (not NDJSON, not streaming):

```ts
interface TtsResponse {
  audio_base64: string;
  alignment: CharacterAlignmentResponseModel | null;
  normalized_alignment: CharacterAlignmentResponseModel | null;
}

interface CharacterAlignmentResponseModel {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
```

- `alignment` -- maps to the **original** input text character positions.
- `normalized_alignment` -- maps to the **normalized** text (numbers spelled out, abbreviations expanded, etc.).
- Both are optional in the API spec but at least one is present when the model supports it.

The existing reference implementation at `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` (line 211) prefers `alignment` over `normalized_alignment` because alignment maps to the original text characters, which is what `buildWordTimestamps` needs for correct word-to-character index mapping.

### Audio Format

The `audio_base64` field contains base64-encoded audio bytes. The format depends on the `output_format` parameter. The reference implementation uses `mp3_44100_128` (44.1kHz MP3 at 128kbps).

Decoding pattern (from reference, lines 229-243):
```ts
function base64PartsToAudioUrl(parts: string[]): string {
  const binaryParts: Uint8Array[] = [];
  for (const part of parts) {
    const binary = atob(part);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    binaryParts.push(bytes);
  }
  const blob = new Blob(binaryParts, { type: 'audio/mpeg' });
  return URL.createObjectURL(blob);
}
```

### Text Length Limits

The API docs specify no explicit text length limit. However, the reference implementation (line 415-416) already chunks text at ~200 words per chunk using `splitTextIntoChunks`. This is a pragmatic limit because:
1. Very long texts can timeout or produce poor alignment quality.
2. Base64 audio for long texts can be very large (a 5-minute audio at 128kbps is ~4.7MB base64).
3. Chunking allows sequential fetching with time offset accumulation.

### Key API Concerns for the Adapter

1. **No text length limit documented** -- but chunking is essential for reliability. The adapter must chunk long texts.
2. **Time offset accumulation across chunks** -- when fetching multiple chunks sequentially, each chunk's timestamps start at 0. The adapter must accumulate `timeOffset` by reading the last chunk's final `character_end_times_seconds` value.
3. **Word reindexing across chunks** -- words from chunk N must have their `index` offset by the total word count from chunks 0..N-1.
4. **Audio concatenation** -- multiple base64 audio parts are concatenated as raw bytes into a single Blob, then a Blob URL is created.

---

## 2. Reference Implementation Analysis

### `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` (555 lines)

This is the complete reference for what the ElevenLabs adapter must do. It is a monolithic React hook that combines API fetching, caching, audio lifecycle, and playback sync. For Phase 3, we extract **only the TTS fetching logic** (API call, chunking, audio decoding). The playback/sync logic already lives in the karaoke-reader package hooks.

**What to extract into the adapter:**

| Lines | Function | Extract to adapter? |
|-------|----------|-------------------|
| 170-223 | `fetchTtsWithTimestamps()` | Yes -- core API call |
| 229-243 | `base64PartsToAudioUrl()` | Yes -- audio decoding |
| 395-451 | Chunk loop with `splitTextIntoChunks` + `buildWordTimestamps` + reindexing | Yes -- orchestration |
| 401-403 | Cache key computation + lookup | Yes (via cache adapter interface) |
| 451 | Cache store (fire-and-forget) | Yes (via cache adapter interface) |

**What stays in the existing hooks (already extracted in Phase 2):**

| Function | Where it lives now |
|----------|-------------------|
| Audio element creation/lifecycle | `useKaraokeReader` |
| rAF loop + binary search | `useAudioSync` |
| Play/pause/toggle controls | `useKaraokeReader` |
| Volume control | `useKaraokeReader` |
| Status state machine | `useKaraokeReader` |
| Auto-scroll | `useAutoScroll` |
| DOM class toggling | `KaraokeReader` component |

### `apps/tablet/src/lib/ttsCache.ts` (78 lines)

This is the reference for the cache layer. It's a Supabase-specific implementation. Key patterns to preserve:

1. **`get(key)` returns `null` on miss or error** -- never throws.
2. **`set(key, value)` is fire-and-forget** -- never throws. Errors are logged.
3. **Duplicate key handling** -- Supabase returns error code `23505` for duplicate insert, which is silently ignored.
4. **Cache value shape**: `{ audioBase64Parts: string[], wordTimestamps: WordTimestamp[] }`.

### Adapter Return Shape

The adapter must return everything `KaraokeReader` needs as props:

```ts
interface ElevenLabsTTSResult {
  /** Blob URL of the audio (ready to pass as audioSrc) */
  audioUrl: string;
  /** Word-level timestamps (ready to pass as timestamps) */
  timestamps: WordTimestamp[];
}
```

This is the bridge between the ElevenLabs API and the generic `KaraokeReader` component.

---

## 3. Cache Adapter Interface Design

### Requirements

From CACHE-01 through CACHE-03:
- Generic `CacheAdapter` interface with `get` and `set`.
- Built-in `memoryCache()` and `localStorageCache()` adapters.
- Fire-and-forget semantics: cache errors never throw or block playback.

### Interface Design

```ts
interface TTSCacheValue {
  audioBase64Parts: string[];
  wordTimestamps: WordTimestamp[];
}

interface CacheAdapter {
  get(key: string): Promise<TTSCacheValue | null>;
  set(key: string, value: TTSCacheValue): Promise<void>;
}
```

**Design decisions:**

1. **Async interface** (`Promise`) -- even though `memoryCache` is synchronous, `localStorage` access can be slow and Supabase/IndexedDB adapters are inherently async. Unified async interface prevents consumer confusion.

2. **Fire-and-forget wrapping** -- The ElevenLabs adapter wraps all cache calls in try/catch internally. The `CacheAdapter` implementations themselves should also be defensive, but the adapter never lets a cache error propagate.

3. **Cache key** -- `computeCacheKey(text, voiceId)` already exists in the package utils. The adapter uses it internally. Consumers do not need to compute cache keys.

4. **No TTL/expiry in the interface** -- Keep it simple for v1. Consumers who need TTL can implement it in their adapter.

### Memory Cache Implementation

```ts
function createMemoryCache(): CacheAdapter {
  const store = new Map<string, TTSCacheValue>();
  return {
    async get(key) { return store.get(key) ?? null; },
    async set(key, value) { store.set(key, value); },
  };
}
```

Simple, zero dependencies, cleared on page reload.

### LocalStorage Cache Implementation

```ts
function createLocalStorageCache(prefix = 'kr-tts-'): CacheAdapter {
  return {
    async get(key) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    async set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch { /* quota exceeded, etc. -- silently ignore */ }
    },
  };
}
```

**Risks with localStorage:**
- **5-10MB quota** -- a single TTS response for a ~200 word chunk produces roughly 200KB-1MB of base64 audio data. A few cached responses could fill localStorage.
- **Synchronous blocking** -- JSON.stringify/parse of large objects can block the main thread.
- **Mitigation:** Document that localStorage cache is best for short texts. For production use with long texts, recommend IndexedDB or server-side caching (like the existing Supabase adapter in MeinUngeheuer).

### Where to export

Cache types and adapters should be exported from the root package (`karaoke-reader`) since they are general-purpose:
```ts
// src/index.ts additions
export type { CacheAdapter, TTSCacheValue } from './types.js';
export { createMemoryCache, createLocalStorageCache } from './cache.js';
```

The ElevenLabs adapter accepts an optional `cache?: CacheAdapter` parameter.

---

## 4. ElevenLabs Adapter Architecture

### API Shape

```ts
// src/adapters/elevenlabs/index.ts

interface ElevenLabsTTSOptions {
  /** ElevenLabs API key. */
  apiKey: string;
  /** ElevenLabs voice ID. */
  voiceId: string;
  /** Text to synthesize (may be markdown -- caller should strip before passing). */
  text: string;
  /** Model ID (default: 'eleven_multilingual_v2'). */
  modelId?: string;
  /** Output format (default: 'mp3_44100_128'). */
  outputFormat?: string;
  /** Voice settings overrides. */
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  /** Max words per chunk for text splitting (default: 200). */
  maxWordsPerChunk?: number;
  /** Optional cache adapter. */
  cache?: CacheAdapter;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

interface ElevenLabsTTSResult {
  /** Blob URL for the synthesized audio. Caller must revoke when done. */
  audioUrl: string;
  /** Word-level timestamps for the full text. */
  timestamps: WordTimestamp[];
}

async function fetchElevenLabsTTS(options: ElevenLabsTTSOptions): Promise<ElevenLabsTTSResult>;
```

### Why a Plain Function (Not a Hook)

The adapter is a **plain async function**, not a React hook. Reasons:

1. **Tree-shakeable** -- consumers who don't use ElevenLabs don't import React hook code.
2. **Testable** -- can be tested without React rendering context.
3. **Flexible** -- consumers can call it from a hook, an event handler, a server context, etc.
4. **Separation of concerns** -- fetching TTS data is a side effect, not UI state management. The existing hooks (`useKaraokeReader`) handle the UI state.

Consumers wire it like:
```tsx
const { audioUrl, timestamps } = await fetchElevenLabsTTS({ apiKey, voiceId, text });
<KaraokeReader text={text} timestamps={timestamps} audioSrc={audioUrl} />
```

### Optional: Convenience Hook

We could also export a `useElevenLabsTTS` hook that wraps `fetchElevenLabsTTS` in a React effect:

```ts
function useElevenLabsTTS(options: ElevenLabsTTSOptions): {
  status: 'idle' | 'loading' | 'ready' | 'error';
  result: ElevenLabsTTSResult | null;
  error: Error | null;
}
```

This would handle:
- Calling `fetchElevenLabsTTS` in a `useEffect` when params change
- Managing loading/error/ready states
- Cleanup (revoking blob URL, aborting in-flight requests via AbortController)

**Decision:** Ship both `fetchElevenLabsTTS` (core, non-React) and `useElevenLabsTTS` (convenience hook). The hook is thin enough (20-30 lines) and significantly improves DX for React consumers. The function is the real implementation; the hook just wraps it.

### Internal Flow

```
useElevenLabsTTS(text, voiceId, apiKey, cache?)
  │
  ├─ computeCacheKey(text, voiceId)
  ├─ cache?.get(cacheKey)
  │   └─ HIT → decode base64Parts to Blob URL + return timestamps
  │
  ├─ MISS → splitTextIntoChunks(text, maxWordsPerChunk)
  │   └─ for each chunk:
  │       ├─ POST /v1/text-to-speech/{voiceId}/with-timestamps
  │       ├─ Extract alignment (prefer alignment over normalized_alignment)
  │       ├─ buildWordTimestamps(chunkText, alignment, timeOffset)
  │       ├─ Accumulate timeOffset from last character end time
  │       └─ Reindex words for global sequence
  │
  ├─ base64PartsToAudioUrl(allAudioParts) → Blob URL
  ├─ cache?.set(cacheKey, { audioBase64Parts, wordTimestamps }) [fire-and-forget]
  └─ return { audioUrl, timestamps }
```

### Tree-shakeability Verification

The current tsup config already ensures tree-shakeability:

1. **Separate entry point:** `'adapters/elevenlabs/index': 'src/adapters/elevenlabs/index.ts'` is its own entry in `tsup.config.ts` (line 9).
2. **Separate output file:** Builds to `dist/adapters/elevenlabs/index.js` -- completely separate from `dist/index.js`.
3. **No cross-imports:** The root `src/index.ts` does NOT import from `src/adapters/elevenlabs/`. The adapter imports from the root types/utils (via shared chunks), not the other way around.
4. **tsup config has `splitting: true` and `treeshake: true`** (lines 16-17).
5. **`sideEffects: ["*.css"]`** in package.json tells bundlers that JS files are side-effect-free.

**Verification method:** After building, check that `dist/index.js` has no references to ElevenLabs API URLs or the adapter code. The current build already confirms this -- `dist/index.js` only contains the KaraokeReader component, hooks, and utils.

**Additional verification for tests:** Import only `{ KaraokeReader }` from the root in a test, and verify the ElevenLabs fetch function is not pulled in. Can be tested by checking bundle size or by examining the built output.

### What the Adapter Must NOT Import

The adapter must not import React or any React hooks. It is a pure async function. The `useElevenLabsTTS` convenience hook will import React, but it lives in the same file and is tree-shakeable (named export).

**However:** if we put `useElevenLabsTTS` in the same file, consumers who only want the async function still pull in React as a dependency of the hooks export. **Better approach:** Export only the async function from the elevenlabs adapter. If we want a convenience hook, export it from the `/hooks` subpath or from a separate file within the adapter directory.

**Decision:** Ship `fetchElevenLabsTTS` from `karaoke-reader/elevenlabs`. Ship `useElevenLabsTTS` also from `karaoke-reader/elevenlabs` in the same entry point, since the adapter subpath is already opt-in (consumers who import it accept the React peer dep). The hook is a thin wrapper; bundlers with tree-shaking will drop it if unused.

---

## 5. CSS Custom Properties Design

### Requirements

From CSS-01 through CSS-03:
- Self-contained CSS with no Tailwind dependency.
- Styled default: Georgia serif, dark background, amber highlight, smooth transitions.
- All visual properties overridable via CSS custom properties (`--kr-*`).

### Current State

`src/styles.css` is a placeholder: `/* karaoke-reader styles -- populated in Phase 3 */`

The component already uses `kr-` prefixed CSS class names:
- `.kr-root` -- root container
- `.kr-loading` -- loading state modifier
- `.kr-error` -- error state modifier
- `.kr-loading-indicator` -- loading spinner/text
- `.kr-error-fallback` -- error message
- `.kr-scroll-container` -- scrollable text area
- `.kr-content` -- max-width text wrapper
- `.kr-paragraph` -- paragraph wrapper
- `.kr-line` -- line wrapper
- `.kr-line--header`, `.kr-line--list-item`, `.kr-line--text` -- line type modifiers
- `.kr-word` -- individual word span
- `.kr-word--strikethrough` -- strikethrough modifier
- `.kr-controls` -- controls container
- `.kr-volume-label` -- volume control label
- `.kr-volume-slider` -- volume range input

Word states are set via `data-kr-state` attribute: `upcoming`, `active`, `spoken`.

### CSS Custom Property Naming Convention

Prefix: `--kr-` (matching class name prefix).

| Property | Default | Purpose |
|----------|---------|---------|
| `--kr-bg` | `#000000` | Root background color |
| `--kr-color` | `#ffffff` | Base text color |
| `--kr-font-family` | `Georgia, 'Times New Roman', serif` | Text font |
| `--kr-font-size` | `clamp(1.2rem, 3vw, 1.8rem)` | Base text size |
| `--kr-line-height` | `1.8` | Line height |
| `--kr-letter-spacing` | `0.02em` | Letter spacing |
| `--kr-padding` | `clamp(2rem, 6vw, 4rem) clamp(2rem, 8vw, 6rem)` | Content padding |
| `--kr-max-width` | `700px` | Max content width |
| `--kr-highlight-color` | `#fcd34d` (amber-300) | Active word color |
| `--kr-spoken-opacity` | `0.4` | Spoken word opacity |
| `--kr-upcoming-opacity` | `0.9` | Upcoming word opacity |
| `--kr-active-opacity` | `1` | Active word opacity |
| `--kr-transition-color` | `color 0.2s ease` | Color transition |
| `--kr-transition-opacity` | `opacity 0.4s ease` | Opacity transition |
| `--kr-header-font-size` | `clamp(0.9rem, 2vw, 1.1rem)` | Header text size |
| `--kr-header-opacity` | `0.5` | Header opacity |
| `--kr-controls-opacity` | `0.15` | Controls default opacity |
| `--kr-controls-hover-opacity` | `0.5` | Controls hover opacity |
| `--kr-slider-track-color` | `rgba(255,255,255,0.2)` | Volume slider track |
| `--kr-slider-thumb-color` | `rgba(255,255,255,0.4)` | Volume slider thumb |
| `--kr-error-color` | `#ef4444` | Error text color |

### CSS Architecture

```css
/* Layer 1: Custom property defaults (on .kr-root) */
.kr-root {
  --kr-bg: #000000;
  --kr-color: #ffffff;
  --kr-font-family: Georgia, 'Times New Roman', serif;
  /* ... all defaults ... */
}

/* Layer 2: Component styles using var() */
.kr-root {
  background: var(--kr-bg);
  color: var(--kr-color);
  font-family: var(--kr-font-family);
  /* ... */
}

/* Layer 3: State-driven styles via data attributes */
.kr-word[data-kr-state="upcoming"] {
  opacity: var(--kr-upcoming-opacity);
}
.kr-word[data-kr-state="active"] {
  color: var(--kr-highlight-color);
  opacity: var(--kr-active-opacity);
}
.kr-word[data-kr-state="spoken"] {
  opacity: var(--kr-spoken-opacity);
}
```

### Why CSS Custom Properties (Not CSS-in-JS, Not className Overrides)

1. **No runtime cost** -- CSS custom properties are resolved by the browser, not JavaScript.
2. **Cascading** -- consumers set properties on a parent element, and they cascade down. No prop drilling.
3. **Works with any framework** -- not tied to React's styling system.
4. **Inspectable** -- visible in browser DevTools, easy to debug.
5. **Theming** -- multiple instances can have different themes by wrapping in different parent elements.

### Visual Design Reference (from TextReader.tsx)

The existing MeinUngeheuer TextReader has these inline styles (lines 324-331):

```ts
const baseStyle = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
  lineHeight: '1.8',
  color: '#ffffff',
  letterSpacing: '0.02em',
  margin: 0,
};
```

And Tailwind classes for state colors:
- Active: `text-amber-300` (which is `#fcd34d`)
- Spoken: `opacity-40` (0.4)
- Upcoming: `opacity-90` (0.9)

The volume slider styles are in an inline `<style>` tag (lines 477-519) with custom slider thumb appearance.

### Scrollbar Hiding

The reference uses `::-webkit-scrollbar { display: none; }` and `scrollbar-width: none` + `-ms-overflow-style: none`. These should be included in the CSS for `.kr-scroll-container`.

### Status-Specific Styles

The component already sets `data-kr-status` on the root element. CSS can target different statuses:

```css
.kr-root[data-kr-status="loading"] { /* loading state styles */ }
.kr-root[data-kr-status="error"] { /* error state styles */ }
```

---

## 6. Build and Export Configuration

### Current State (Working)

**tsup.config.ts** has 4 entry points, all building correctly:
```ts
entry: {
  index: 'src/index.ts',                              // root
  'utils/index': 'src/utils/index.ts',                // /utils
  'hooks/index': 'src/hooks/index.ts',                // /hooks
  'adapters/elevenlabs/index': 'src/adapters/elevenlabs/index.ts',  // /elevenlabs
},
```

With `splitting: true`, `treeshake: true`, `external: ['react', 'react-dom']`.

CSS is copied via `onSuccess` hook: `copyFileSync('src/styles.css', 'dist/styles.css')`.

**package.json** exports map has all 5 subpaths configured:
- `.` -- root (types, utils, hooks, component)
- `./utils` -- utils only
- `./hooks` -- hooks only
- `./elevenlabs` -- ElevenLabs adapter
- `./styles.css` -- CSS file

### Changes Needed for Phase 3

**No changes to tsup.config.ts.** The entry points and configuration are already correct.

**No changes to package.json exports.** The subpath exports are already configured.

**File changes:**
1. `src/styles.css` -- populate with full CSS (currently placeholder)
2. `src/adapters/elevenlabs/index.ts` -- implement adapter (currently `export {}`)
3. `src/types.ts` -- add `CacheAdapter` and `TTSCacheValue` types
4. New file: `src/cache.ts` -- `createMemoryCache()` and `createLocalStorageCache()`
5. `src/index.ts` -- add exports for cache types and adapters

### Export Map After Phase 3

```ts
// From 'karaoke-reader' (root)
export { KaraokeReader, type KaraokeReaderProps } from './components/KaraokeReader.js';
export { useKaraokeReader, useAudioSync, useAutoScroll } from './hooks/index.js';
export { buildWordTimestamps, splitTextIntoChunks, computeCacheKey, ... } from './utils/index.js';
export type { WordTimestamp, AlignmentData, TtsStatus, CacheAdapter, TTSCacheValue } from './types.js';
export { createMemoryCache, createLocalStorageCache } from './cache.js';

// From 'karaoke-reader/elevenlabs'
export { fetchElevenLabsTTS, useElevenLabsTTS } from './adapters/elevenlabs/index.js';
export type { ElevenLabsTTSOptions, ElevenLabsTTSResult } from './adapters/elevenlabs/index.js';

// From 'karaoke-reader/styles.css'
// (CSS file, no JS exports)
```

---

## 7. Testing Strategy

### ElevenLabs Adapter Tests

**Unit tests for `fetchElevenLabsTTS`:**

1. Happy path: mock fetch returns valid TTS response, verify `audioUrl` is a blob URL and `timestamps` match expected word timing.
2. Multi-chunk: text exceeding maxWordsPerChunk splits into chunks, timestamps have correct time offsets and reindexed.
3. Cache hit: cache adapter returns data, no fetch call made.
4. Cache miss + store: cache returns null, fetch called, cache set called with correct data (fire-and-forget).
5. Cache error on get: cache.get throws, fetch still succeeds (cache error swallowed).
6. Cache error on set: cache.set throws, result still returned (cache error swallowed).
7. API error: fetch returns non-OK status, function throws with descriptive error.
8. Missing alignment: API returns no alignment data, function throws.
9. AbortSignal: pass an aborted signal, function rejects.

**Mocking strategy:**
- Mock `fetch` globally via `vi.fn()`.
- Create mock cache adapters with `vi.fn()` for get/set.
- No React testing needed (it is a plain function).

### useElevenLabsTTS Hook Tests

10. Status transitions: idle -> loading -> ready (on successful fetch).
11. Status transitions: idle -> loading -> error (on failed fetch).
12. Cleanup: blob URL revoked on unmount.
13. Cleanup: AbortController signals abort on unmount or param change.
14. Re-fetch: changing text/voiceId triggers new fetch.

**Testing library:** `@testing-library/react` `renderHook`.

### Cache Adapter Tests

15. memoryCache: get returns null for unknown key.
16. memoryCache: set then get returns stored value.
17. localStorageCache: get returns null for unknown key.
18. localStorageCache: set then get returns stored value.
19. localStorageCache: handles quota exceeded gracefully (mock localStorage.setItem to throw).
20. localStorageCache: handles corrupted data gracefully (mock localStorage.getItem to return invalid JSON).

### CSS Tests

CSS testing is primarily visual/manual, but we can verify:

21. Build validation: `dist/styles.css` exists and is non-empty after build.
22. Custom property presence: CSS file contains all `--kr-*` custom properties.
23. Component test: KaraokeReader renders `data-kr-state` attributes that the CSS targets.

### Test File Locations

```
src/adapters/elevenlabs/index.ts       -> src/adapters/elevenlabs/index.test.ts
src/cache.ts                           -> src/cache.test.ts
```

---

## 8. Risk Assessment

### High Risk

1. **Base64 audio Blob URL creation in tests.** `atob()`, `Blob`, and `URL.createObjectURL` may not be fully available in happy-dom. **Mitigation:** Mock `URL.createObjectURL` to return a predictable string. The actual audio decoding does not need to be tested (it is a well-known pattern); test the orchestration and data flow instead.

2. **localStorage quota in localStorageCache.** Large TTS responses (base64 audio) can easily exceed localStorage's 5-10MB limit. **Mitigation:** Document the limitation. Recommend memoryCache for short-lived usage or a custom IndexedDB/server adapter for production with long texts.

### Medium Risk

3. **ElevenLabs API response format changes.** The `alignment` field structure could change in future API versions. **Mitigation:** Use the `AlignmentData` interface already defined in `types.ts`. Validate the response shape at runtime (check for null alignment).

4. **CSS specificity conflicts with consumer styles.** Consumer's global styles (e.g., `* { box-sizing: border-box; }` or `p { margin: 1em; }`) could affect the component. **Mitigation:** Reset relevant properties in `.kr-root` and `.kr-word` selectors. Use `data-kr-*` attributes for state styling to avoid class name conflicts.

5. **CSS custom property inheritance edge cases.** If a consumer wraps the component in an element that also defines `--kr-*` properties, they cascade correctly (this is the desired behavior). But if the consumer's CSS accidentally overrides a property they didn't intend to, there's no protection. **Mitigation:** Document all custom properties clearly.

### Low Risk

6. **Tree-shakeability regression.** If the adapter accidentally imports from the root, it could pull in React code. **Mitigation:** The adapter only imports from `../types.js` and `../utils/*`. No React imports. Verify in build output.

7. **useElevenLabsTTS hook memory leaks.** If the component unmounts during a fetch, the blob URL and abort controller must be cleaned up. **Mitigation:** Standard useEffect cleanup pattern with AbortController.

---

## 9. Implementation Order

The three workstreams (CSS, ElevenLabs adapter, cache layer) have a dependency:

```
CACHE-01,02,03 (CacheAdapter interface + implementations)
       │
       ▼
ELEV-01,02,03 (ElevenLabs adapter uses CacheAdapter)
       │
CSS-01,02,03 (independent -- no dependencies on above)
```

**Recommended plan order:**

1. **Plan 01: Cache Layer** -- Define `CacheAdapter` type, implement `createMemoryCache` and `createLocalStorageCache`, add exports, write tests. Small scope, unblocks adapter.

2. **Plan 02: ElevenLabs Adapter** -- Implement `fetchElevenLabsTTS` and `useElevenLabsTTS`, wire cache integration, write tests. Larger scope, depends on cache types.

3. **Plan 03: CSS Styling** -- Populate `styles.css` with full custom property system, verify build, update component if needed for any missing class names. Independent but listed last because it is the least likely to surface issues that affect the other plans.

Alternatively, CSS could be done first or in parallel since it is independent. But starting with cache -> adapter follows the data dependency chain and lets us verify the most technically risky pieces first.

---

## RESEARCH COMPLETE
