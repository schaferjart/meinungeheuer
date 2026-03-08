# Phase 4 Research: Validation and Publication

**Researched:** 2026-03-08
**Scope:** VAL-01, VAL-02, VAL-03, DOC-01, DOC-02
**Input:** Completed karaoke-reader package (111 tests, all passing), MeinUngeheuer tablet app (first consumer), Phase 1-3 verified and complete

---

## 1. VAL-01: Wiring MeinUngeheuer as First Consumer

### Current Tablet App Text Reading Architecture

The tablet app's text display pipeline consists of 4 files:

| File | Lines | Purpose |
|------|-------|---------|
| `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` | 555 | Monolithic hook: ElevenLabs API fetch, chunking, timestamp conversion, audio lifecycle, rAF sync loop, play/pause/volume |
| `apps/tablet/src/components/TextReader.tsx` | 600 | Visual component: markdown parsing, word rendering, DOM class toggling for highlight, auto-scroll, controls, i18n |
| `apps/tablet/src/lib/ttsCache.ts` | 78 | Supabase-backed TTS cache: get/set via `tts_cache` table |
| `apps/tablet/src/components/screens/TextDisplayScreen.tsx` | 73 | Thin wrapper: passes env vars and dispatches `READY` on completion |

### What the Karaoke-Reader Package Already Replaces

Every piece of core functionality in these 4 files has been extracted into the karaoke-reader package:

| Tablet App Code | karaoke-reader Replacement |
|-----------------|---------------------------|
| `buildWordTimestamps()` in `useTextToSpeechWithTimestamps.ts` | `buildWordTimestamps()` from `karaoke-reader/utils` |
| `splitTextIntoChunks()` in `useTextToSpeechWithTimestamps.ts` | `splitTextIntoChunks()` from `karaoke-reader/utils` |
| `fetchTtsWithTimestamps()` in `useTextToSpeechWithTimestamps.ts` | `fetchElevenLabsTTS()` from `karaoke-reader/elevenlabs` |
| `base64PartsToAudioUrl()` in `useTextToSpeechWithTimestamps.ts` | Internal to `fetchElevenLabsTTS()` |
| rAF sync loop + binary search in `useTextToSpeechWithTimestamps.ts` | `useAudioSync()` from `karaoke-reader/hooks` |
| Audio lifecycle, play/pause/volume in `useTextToSpeechWithTimestamps.ts` | `useKaraokeReader()` from `karaoke-reader/hooks` |
| `stripMarkdownForTTS()` in `TextReader.tsx` | `stripMarkdownForTTS()` from `karaoke-reader/utils` |
| `parseMarkdownText()` in `TextReader.tsx` | `parseMarkdownText()` from `karaoke-reader/utils` |
| `parseContentToWords()` in `TextReader.tsx` | `parseContentToWords()` from `karaoke-reader/utils` |
| DOM class toggling for word states in `TextReader.tsx` | `KaraokeReader` component (data-kr-state attribute system) |
| Comfort-zone auto-scroll in `TextReader.tsx` | `useAutoScroll()` from `karaoke-reader/hooks` |
| `computeCacheKey()` in `ttsCache.ts` | `computeCacheKey()` from `karaoke-reader/utils` |
| `CachedTts` interface in `ttsCache.ts` | `TTSCacheValue` from `karaoke-reader` |

### What the Tablet App Adds Beyond the Package

The `TextReader.tsx` component has MeinUngeheuer-specific UI that is NOT in the generic `KaraokeReader` component:

1. **i18n strings** -- "Wird vorbereitet...", "Angehalten", "Weiter", "Uberspringen", "Bereit?", "Lesen Sie in Ihrem Tempo", "Tippen zum Pausieren" (German/English).
2. **Action buttons** -- `ActionButton` sub-component with ghost variant for Skip/Continue/Ready controls.
3. **Loading dots animation** -- `LoadingDots` sub-component with pulsing animation.
4. **Volume slider** -- Custom-styled `VolumeSlider` sub-component (the package has its own, but the tablet's styling is Tailwind-based).
5. **Auto-continue timer** -- 2-second delay after `status === 'done'` before calling `onComplete()`.
6. **Status-dependent UI** -- Different control layouts for loading, ready, playing, paused, done, and error states.
7. **Skip button** -- Allows visitor to skip reading entirely.

### Rewiring Strategy

**Option A: Replace TextReader internals with KaraokeReader component**

Replace `TextReader.tsx` to use `<KaraokeReader>` from the package for the core text rendering and highlighting, while keeping the MeinUngeheuer-specific UI (buttons, i18n, auto-continue) as a wrapper around it. The `KaraokeReader` component supports `hideControls` and `onComplete` props, making it composable.

```tsx
// New TextReader.tsx (simplified concept)
import { KaraokeReader } from 'karaoke-reader';
import { useElevenLabsTTS } from 'karaoke-reader/elevenlabs';
import { stripMarkdownForTTS } from 'karaoke-reader/utils';
import 'karaoke-reader/styles.css';

export function TextReader({ text, voiceId, apiKey, language, onComplete }: TextReaderProps) {
  const ttsText = useMemo(() => stripMarkdownForTTS(text), [text]);

  const { status: ttsStatus, result } = useElevenLabsTTS({
    apiKey, voiceId, text: ttsText,
    cache: supabaseCache, // tablet's Supabase cache adapter
  });

  return (
    <div className="flex flex-col w-full h-full bg-black">
      <KaraokeReader
        text={text}
        timestamps={result?.timestamps ?? []}
        audioSrc={result?.audioUrl}
        autoPlay
        hideControls
        onComplete={handleAudioDone}
        onStatusChange={setKaraokeStatus}
      />
      {/* MeinUngeheuer-specific UI: buttons, i18n, loading dots */}
    </div>
  );
}
```

**Option B: Replace TextReader internals with hooks only (headless)**

Use `useElevenLabsTTS` + `useKaraokeReader` + `useAutoScroll` hooks directly, keeping all rendering in the tablet app. This preserves the existing Tailwind-based UI completely but eliminates all duplicated logic.

```tsx
import { useKaraokeReader, useAutoScroll } from 'karaoke-reader/hooks';
import { useElevenLabsTTS } from 'karaoke-reader/elevenlabs';
import { stripMarkdownForTTS, parseMarkdownText } from 'karaoke-reader/utils';
import type { WordTimestamp } from 'karaoke-reader';

// Use hooks, render own Tailwind UI
```

**Recommendation: Option A (component + wrapper)**

Option A is the cleaner extraction proof. It demonstrates that `<KaraokeReader>` actually works as a drop-in component for real consumers. The tablet app keeps its MeinUngeheuer-specific UI as a thin wrapper. The `KaraokeReader` CSS is imported once and the tablet's Tailwind classes handle the wrapper UI.

### Supabase Cache Adapter

The tablet app currently uses a Supabase-backed cache (`ttsCache.ts`). The karaoke-reader package exports a `CacheAdapter` interface. The tablet needs a thin Supabase adapter that implements `CacheAdapter`:

```ts
// apps/tablet/src/lib/supabaseCacheAdapter.ts
import type { CacheAdapter } from 'karaoke-reader';
import { getSupabaseClient } from './supabase';

export function createSupabaseTTSCache(): CacheAdapter {
  return {
    async get(key) {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('tts_cache')
        .select('audio_base64_parts, word_timestamps')
        .eq('cache_key', key)
        .single();
      if (!data) return null;
      return {
        audioBase64Parts: data.audio_base64_parts,
        wordTimestamps: data.word_timestamps,
      };
    },
    async set(key, value) {
      const supabase = getSupabaseClient();
      await supabase.from('tts_cache').insert({
        cache_key: key,
        audio_base64_parts: value.audioBase64Parts,
        word_timestamps: value.wordTimestamps,
      });
    },
  };
}
```

This replaces the existing `ttsCache.ts` entirely while conforming to the package's interface.

### Import Changes Required

**Files to modify:**

| File | Change |
|------|--------|
| `apps/tablet/package.json` | Add `"karaoke-reader": "workspace:*"` to dependencies |
| `apps/tablet/src/components/TextReader.tsx` | Rewrite to use `KaraokeReader` component + `useElevenLabsTTS` hook from package |
| `apps/tablet/src/components/screens/TextDisplayScreen.tsx` | Minor: verify props still compatible |
| `apps/tablet/src/lib/ttsCache.ts` | Replace with Supabase `CacheAdapter` implementation, or create new file alongside |
| `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` | Delete (entirely replaced by package) |
| `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts` | Delete (tests live in package now) |

**Files that reference the old hook (must update imports):**

- `apps/tablet/src/components/TextReader.tsx` -- imports `useTextToSpeechWithTimestamps` and `TtsStatus`
- `apps/tablet/src/lib/ttsCache.ts` -- imports `WordTimestamp` type from the hook

After rewiring, these should import from `karaoke-reader` or `karaoke-reader/elevenlabs` instead.

### Styling Implications

The existing `TextReader.tsx` uses Tailwind classes (`flex`, `flex-col`, `bg-black`, `text-amber-300`, `opacity-40`, etc.) plus inline styles for word highlighting. The `KaraokeReader` component uses CSS class names (`kr-root`, `kr-word`, etc.) and imports `karaoke-reader/styles.css`.

**Key concern:** The package's `styles.css` sets a black background, Georgia font, etc. on `.kr-root`. The tablet app wraps this in Tailwind layout. There should be no conflict because:
1. The package CSS is scoped to `.kr-*` class names.
2. The tablet's Tailwind classes apply to wrapper elements, not the KaraokeReader internals.
3. The package supports `className` and `style` props for additional customization.

The voice settings (stability 0.35, similarity_boost 0.65, style 0.6) are currently hardcoded in `useTextToSpeechWithTimestamps.ts` (line 189). The `fetchElevenLabsTTS` function accepts `voiceSettings` as an optional parameter, so the tablet app can pass these.

### Behavior Regression Checklist

To verify VAL-01 (zero behavior regression), check these behaviors:

1. Text renders with markdown formatting (headers small/italic, strikethrough displayed, list items indented)
2. Audio auto-plays on component mount
3. Words highlight in amber as audio progresses
4. Already-spoken words dim to 40% opacity
5. Upcoming words at 90% opacity
6. Auto-scroll keeps active word in 20%-65% comfort zone
7. Manual scroll pauses auto-scroll for several seconds
8. Tap/click pauses audio, tap again resumes
9. Pause shows Continue + Skip buttons
10. Done state shows loading dots for 2 seconds, then calls onComplete
11. Error state shows "Read at your own pace" with Ready button
12. Volume slider appears during playback
13. TTS cache hit returns immediately without API call
14. TTS cache miss fetches from API and stores result
15. Long texts are chunked and timestamps span correctly

---

## 2. VAL-02: Unit Tests (Current State Assessment)

### Requirements

> VAL-02: Core logic has unit tests (timestamp conversion, text chunking, cache key)

### Current Test Coverage in karaoke-reader Package

| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| `src/utils/buildWordTimestamps.test.ts` | 13 | Character-to-word timestamp conversion: basic text, German text, punctuation, multiple sentences, single word, sequential indices, time offset, whitespace, empty text, chronological order |
| `src/utils/splitTextIntoChunks.test.ts` | 6 | Sentence-boundary splitting: short text, under limit, long text splits, no boundaries, mixed punctuation, single sentence |
| `src/utils/computeCacheKey.test.ts` | 5 | SHA-256 cache key: hex format, deterministic, whitespace normalization, voiceId differentiation, text differentiation |
| `src/utils/markdown.test.ts` | 17 | Markdown strip/parse: stripMarkdownForTTS (headers, strikethrough, trailing spaces), parseContentToWords (basic, strikethrough regions, mixed), parseMarkdownText (paragraphs, headers, list items, blank lines, global indices, complex document) |
| `src/cache.test.ts` | 9 | Memory cache (get/set/null), localStorage cache (get/set/null, quota exceeded, corrupted JSON, SecurityError) |

**Total unit tests for core logic: 50**

### Assessment: VAL-02 is Already Satisfied

The requirement asks for unit tests covering "timestamp conversion, text chunking, cache key." All three are thoroughly tested:

- **Timestamp conversion**: 13 tests in `buildWordTimestamps.test.ts`
- **Text chunking**: 6 tests in `splitTextIntoChunks.test.ts`
- **Cache key**: 5 tests in `computeCacheKey.test.ts`

Additionally, the markdown utilities have 17 tests and the cache adapters have 9 tests. The requirement is clearly satisfied with existing tests.

---

## 3. VAL-03: Integration Tests (Current State Assessment)

### Requirements

> VAL-03: Hook and component have integration tests (DOM class toggling, status transitions)

### Current Test Coverage

| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| `src/hooks/useAudioSync.test.ts` | 13 | Audio sync: returns -1 initially, binary search correctness, gap handling, rAF loop lifecycle, cleanup, enable/disable, timestamp changes |
| `src/hooks/useKaraokeReader.test.ts` | 13 | Orchestrator hook: status transitions (idle->loading->ready, ready->playing->paused, playing->done), autoplay, autoplay-blocked, volume control, toggle, onComplete callback, onError callback, cleanup |
| `src/hooks/useAutoScroll.test.ts` | 8 | Auto-scroll: no-op when disabled, scrolls when word outside comfort zone, no scroll within zone, manual scroll cooldown, scroll reset after cooldown, disabled prevents scroll |
| `src/components/KaraokeReader.test.tsx` | 11 | Component: renders words from markdown, data-kr-state attributes, click/Space/Enter toggle, volume slider, loading/error states, hideControls, className/style props |

**Total integration tests: 45**

### Assessment: VAL-03 is Already Satisfied

The requirement asks for integration tests covering "DOM class toggling" and "status transitions":

- **DOM class toggling**: `KaraokeReader.test.tsx` tests that words render with `data-kr-state="upcoming"` and verifies the component renders the correct DOM structure. The `useAudioSync.test.ts` tests verify the binary search and rAF loop that drives word index changes.
- **Status transitions**: `useKaraokeReader.test.ts` tests the full state machine (idle -> loading -> ready -> playing -> paused -> done, error states, autoplay-blocked detection).

Additionally, the auto-scroll hook has 8 tests covering the comfort zone scrolling behavior, which is also a key integration concern.

---

## 4. DOC-01: README Structure and Content

### Requirements

> DOC-01: README with usage examples: generic mode (timestamps + audio URL) and ElevenLabs mode

### Best Practices for npm Component Library READMEs

Based on successful React component library READMEs (react-hot-toast, react-select, @radix-ui, cmdk), the structure should be:

1. **Package name + one-line description**
2. **Install** -- `npm install karaoke-reader`
3. **Quick Start** -- minimal working example (5-10 lines of JSX)
4. **Features** -- bullet list of capabilities
5. **Usage Examples**
   - Generic Mode (bring-your-own timestamps + audio)
   - ElevenLabs Mode (API key + text in, full karaoke out)
6. **API Reference**
   - `<KaraokeReader>` props table
   - Hooks: `useKaraokeReader`, `useAudioSync`, `useAutoScroll`
   - Utilities: `buildWordTimestamps`, `splitTextIntoChunks`, `computeCacheKey`, `stripMarkdownForTTS`
   - ElevenLabs adapter: `fetchElevenLabsTTS`, `useElevenLabsTTS`
   - Cache: `CacheAdapter`, `createMemoryCache`, `createLocalStorageCache`
7. **Styling** -- CSS custom properties table, theming example
8. **Subpath Exports** -- what each export path provides
9. **TypeScript** -- mention strict types, link to exported types
10. **License**

### Key Code Examples

#### Generic Mode Example

```tsx
import { KaraokeReader } from 'karaoke-reader';
import 'karaoke-reader/styles.css';

function App() {
  // Your timestamps from any source
  const timestamps = [
    { word: 'Hello', startTime: 0.0, endTime: 0.5, index: 0 },
    { word: 'world', startTime: 0.6, endTime: 1.1, index: 1 },
  ];

  return (
    <KaraokeReader
      text="Hello world"
      timestamps={timestamps}
      audioSrc="/hello-world.mp3"
      autoPlay
      onComplete={() => console.log('Done!')}
    />
  );
}
```

#### ElevenLabs Mode Example

```tsx
import { KaraokeReader } from 'karaoke-reader';
import { useElevenLabsTTS } from 'karaoke-reader/elevenlabs';
import { stripMarkdownForTTS } from 'karaoke-reader/utils';
import 'karaoke-reader/styles.css';

function App() {
  const text = 'Hello, this is a karaoke reading experience.';

  const { status, result, error } = useElevenLabsTTS({
    apiKey: 'your-api-key',
    voiceId: 'your-voice-id',
    text: stripMarkdownForTTS(text),
  });

  if (status === 'loading') return <div>Loading TTS...</div>;
  if (status === 'error') return <div>Error: {error?.message}</div>;
  if (!result) return null;

  return (
    <KaraokeReader
      text={text}
      timestamps={result.timestamps}
      audioSrc={result.audioUrl}
      autoPlay
    />
  );
}
```

### Props Tables

The `KaraokeReaderProps` interface has these properties to document:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | required | Markdown text to render with karaoke highlighting |
| `timestamps` | `WordTimestamp[]` | required | Sorted word-level timestamps (by startTime) |
| `audioSrc` | `string \| HTMLAudioElement` | -- | Audio source URL or existing Audio element |
| `autoPlay` | `boolean` | `false` | Auto-play when audio is ready |
| `onComplete` | `() => void` | -- | Fires when playback finishes |
| `onStatusChange` | `(status: TtsStatus) => void` | -- | Fires on every status transition |
| `onError` | `(error: Error) => void` | -- | Fires on error |
| `initialVolume` | `number` | `1` | Initial volume (0.0-1.0) |
| `hideControls` | `boolean` | `false` | Hide built-in playback controls |
| `scrollComfortTop` | `number` | `0.20` | Top boundary of comfort zone |
| `scrollComfortBottom` | `number` | `0.65` | Bottom boundary of comfort zone |
| `scrollCooldown` | `number` | `3000` | Cooldown after manual scroll (ms) |
| `className` | `string` | -- | Additional CSS classes for root |
| `style` | `CSSProperties` | -- | Inline styles for root |

### CSS Custom Properties Table

All 21 `--kr-*` variables should be documented with their defaults. The existing `styles.css` already defines them. Example theming:

```css
/* Light theme override */
.my-reader {
  --kr-bg: #f5f5f5;
  --kr-color: #1a1a1a;
  --kr-highlight-color: #2563eb;
  --kr-spoken-opacity: 0.3;
}
```

---

## 5. DOC-02: npm Publication

### Requirements

> DOC-02: Published to npm, installable via `npm install karaoke-reader`

### Package Name Availability

**`karaoke-reader` is available on npm.** The registry returns 404 for `npm view karaoke-reader`, confirming the name is not taken.

### npm Login Status

The user is **not currently logged in to npm** (`npm whoami` returns 401 Unauthorized). This needs to be resolved before publishing.

### Pre-Publish Checklist

1. **Remove `"private": true`** from `packages/karaoke-reader/package.json`. Currently set to `true`, which blocks `npm publish`.

2. **Set version to `0.1.0`** (or `1.0.0` depending on confidence level). Currently `0.0.1`.

3. **Add required package.json metadata:**
   - `description` -- "Word-by-word karaoke text highlighting synced to audio playback"
   - `repository` -- GitHub URL (if public)
   - `license` -- MIT (or appropriate)
   - `keywords` -- `["karaoke", "text-to-speech", "tts", "highlighting", "react", "audio", "elevenlabs"]`
   - `author` -- User's npm identity
   - `homepage` -- Optional: GitHub repo or demo URL

4. **Verify `files` field** -- Currently `["dist"]`, which is correct. Only the `dist/` folder ships to npm.

5. **Verify `sideEffects`** -- Currently `["*.css"]`, correct for tree-shaking.

6. **Run prepublish checks:**
   ```bash
   pnpm --filter karaoke-reader build
   pnpm --filter karaoke-reader test
   pnpm --filter karaoke-reader run check-exports  # publint + attw
   ```

7. **npm login** -- `npm login` or `npm adduser` with 2FA.

8. **Publish:**
   ```bash
   cd packages/karaoke-reader
   npm publish --access public
   ```

9. **Verify publication:**
   ```bash
   npm view karaoke-reader
   npm pack --dry-run  # preview what will be published
   ```

### What Ships to npm

Based on the `"files": ["dist"]` configuration, only these files ship:

```
dist/
  index.js, index.cjs, index.d.ts, index.d.cts
  hooks/index.js, index.cjs, index.d.ts, index.d.cts
  utils/index.js, index.cjs, index.d.ts, index.d.cts
  adapters/elevenlabs/index.js, index.cjs, index.d.ts, index.d.cts
  styles.css
  chunk-*.js, chunk-*.cjs (shared code)
  *.map (source maps)
  types-*.d.ts, types-*.d.cts (shared type declarations)
package.json
```

No source files, no test files, no config files.

### Post-Publish Verification

After publishing, verify in a fresh project:

```bash
mkdir test-karaoke && cd test-karaoke
npm init -y
npm install karaoke-reader react react-dom
npx tsc --init
```

Then verify imports resolve:
```ts
import { KaraokeReader } from 'karaoke-reader';
import { useElevenLabsTTS } from 'karaoke-reader/elevenlabs';
import { buildWordTimestamps } from 'karaoke-reader/utils';
import { useKaraokeReader } from 'karaoke-reader/hooks';
import 'karaoke-reader/styles.css';
```

---

## 6. Workspace Integration Considerations

### pnpm Workspace Protocol

For local development (before npm publish), the tablet app can reference the package via workspace protocol:

```json
// apps/tablet/package.json
{
  "dependencies": {
    "karaoke-reader": "workspace:*"
  }
}
```

This resolves to the local `packages/karaoke-reader` directory via the pnpm workspace. After npm publish, external consumers use the published version.

### Build Order

The root `package.json` build script currently builds `@meinungeheuer/shared` first:

```json
"build": "pnpm --filter @meinungeheuer/shared build && pnpm -r --filter '!@meinungeheuer/shared' build"
```

Since `karaoke-reader` is a separate package in `packages/`, it will build as part of the second phase. However, if the tablet app depends on `karaoke-reader`, the build order must ensure `karaoke-reader` builds before the tablet app.

**Required build order change:**

```json
"build": "pnpm --filter @meinungeheuer/shared build && pnpm --filter karaoke-reader build && pnpm -r --filter '!@meinungeheuer/shared' --filter '!karaoke-reader' build"
```

Or simpler: let pnpm handle it via the dependency graph. Since the tablet app will have `"karaoke-reader": "workspace:*"` in its dependencies, pnpm's `--workspace-concurrency` and dependency resolution should handle build ordering automatically.

**Verification:** Run `pnpm build` from the root and confirm all packages build in the correct order.

### Vite Configuration

The tablet app uses Vite. When importing from a workspace package, Vite resolves via the `exports` field in `package.json`. The karaoke-reader package already has correct exports map entries. CSS imports (`import 'karaoke-reader/styles.css'`) work because the `./styles.css` export points directly to the CSS file.

**Potential issue:** Vite may try to process the CSS through its plugin pipeline. Since the package's CSS is plain CSS (no Tailwind), this should work fine. The tablet app uses `@tailwindcss/vite` plugin, which processes `.css` files that contain Tailwind directives. The karaoke-reader's `styles.css` has no Tailwind directives, so the plugin should pass it through unchanged.

---

## 7. Tablet App Tests Impact

### Current Tablet Tests

| Test File | Tests | Impact |
|-----------|-------|--------|
| `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts` | ~25 | **DELETE** -- tests pure functions (`buildWordTimestamps`, `splitTextIntoChunks`) that are now in the package. Equivalent tests exist in `packages/karaoke-reader/src/utils/`. |
| `apps/tablet/src/hooks/useInstallationMachine.test.ts` | ? | **NO CHANGE** -- tests the tablet's state machine, unrelated to text reading. |

### Test Migration Plan

1. **Delete `useTextToSpeechWithTimestamps.test.ts`** -- All tested functions (`buildWordTimestamps`, `splitTextIntoChunks`) now live in the karaoke-reader package with equivalent or more comprehensive tests.

2. **Delete `useTextToSpeechWithTimestamps.ts`** -- The hook is entirely replaced by `useElevenLabsTTS` + `useKaraokeReader` from the package.

3. **Keep `useInstallationMachine.test.ts`** -- Unaffected by the text reading extraction.

4. **No new tablet-level tests needed** -- The integration between the tablet and the package is validated by:
   - The karaoke-reader package's 111 tests covering all core behavior.
   - Manual testing that the TextDisplayScreen behaves identically (VAL-01 success criterion).
   - `pnpm build` and `pnpm typecheck` passing across the monorepo.

---

## 8. Risk Assessment

### High Risk

1. **Visual regression in the rewired TextReader.** The existing `TextReader.tsx` uses Tailwind classes for word state colors (`text-amber-300`, `opacity-40`, `opacity-90`). The `KaraokeReader` component uses CSS class-based state (`data-kr-state` attributes + `styles.css`). The amber highlight is `#fcd34d` in both systems (Tailwind's `amber-300`), so colors should match. However, subtle differences in transition timing, opacity values, or font rendering could be noticeable.

   **Mitigation:** Side-by-side manual testing on the actual tablet hardware. The CSS custom properties can be tuned to match the original look exactly if needed.

2. **Supabase cache adapter compatibility.** The existing `ttsCache.ts` stores data with additional metadata fields (`text_length`, `voice_id`) that the generic `CacheAdapter.set()` interface does not include. The new Supabase adapter must either omit these fields (breaking the existing DB schema expectations) or extend the `set` call to include them.

   **Mitigation:** The Supabase adapter can add extra columns in its `set` implementation beyond what `CacheAdapter` requires. The interface contract is `set(key, value)` but the implementation can add metadata. The DB schema may need a minor adjustment if `text_length` and `voice_id` are NOT NULL columns.

### Medium Risk

3. **Build order in CI.** If `pnpm build` does not build `karaoke-reader` before the tablet app, the tablet's `import from 'karaoke-reader'` will fail. pnpm should handle this via workspace dependency resolution, but needs verification.

   **Mitigation:** Test with `pnpm build` from root before committing.

4. **npm publish requires authentication.** The user is not currently logged in to npm. Publishing requires `npm login` with 2FA. This is a manual step that cannot be automated in CI without tokens.

   **Mitigation:** Document the `npm login` + `npm publish` steps clearly. Consider adding a `prepublishOnly` script to run checks.

### Low Risk

5. **Package name squatting.** The name `karaoke-reader` is currently available but could be taken before publication. This is unlikely given the niche name.

6. **React 18 vs 19 compatibility.** The package declares `"react": "^18.0.0 || ^19.0.0"` as peerDependency. The tablet uses React 18.3.1. The success criteria mention testing with both React 18 and 19. The package uses no React 19-specific APIs, so this should work.

---

## 9. Implementation Order

### Dependency Analysis

```
DOC-01 (README)  ─────────────────┐
                                   │
VAL-02 (unit tests)  ─ ALREADY DONE │
                                   │
VAL-03 (integration tests)  ─ ALREADY DONE
                                   │
VAL-01 (wire tablet app)  ─────────┤
                                   │
DOC-02 (npm publish)  ─────────────┘  (depends on VAL-01 being verified + README existing)
```

Since VAL-02 and VAL-03 are already satisfied by the existing 111 tests, the actual new work is:

1. **VAL-01: Wire MeinUngeheuer tablet app** -- The core integration work. Modify `TextReader.tsx`, create Supabase cache adapter, delete old hook, update imports, verify build.

2. **DOC-01: Write README** -- Can be done in parallel with VAL-01 but benefits from having a working integration as proof.

3. **DOC-02: npm publish** -- Depends on README existing and all tests passing. Requires manual npm login step from the user.

### Recommended Plan Breakdown

**Plan 01: Wire MeinUngeheuer as Consumer (VAL-01)**
- Add `karaoke-reader` workspace dependency to tablet
- Create Supabase `CacheAdapter` implementation
- Rewrite `TextReader.tsx` to use `KaraokeReader` + `useElevenLabsTTS`
- Delete `useTextToSpeechWithTimestamps.ts` and its test file
- Update `ttsCache.ts` imports
- Verify `pnpm build`, `pnpm typecheck`, `pnpm test` all pass
- Manual behavior regression testing

**Plan 02: README and npm Publish (DOC-01, DOC-02)**
- Write comprehensive README with both usage modes
- Add package.json metadata (description, keywords, license, author)
- Remove `"private": true`
- Set version to `0.1.0`
- Add `prepublishOnly` script
- Verify with `npm pack --dry-run`
- npm login + npm publish (manual user step)
- Post-publish verification in fresh project

**Why 2 plans, not 3:**

VAL-02 and VAL-03 are already complete. No new test work is needed. The README and npm publish are tightly coupled (README must exist before publishing, and both are documentation/publication concerns). Keeping them in one plan avoids unnecessary overhead.

---

## 10. Files Affected Summary

### New Files
- `apps/tablet/src/lib/supabaseCacheAdapter.ts` -- Supabase `CacheAdapter` for karaoke-reader
- `packages/karaoke-reader/README.md` -- Package documentation

### Modified Files
- `apps/tablet/package.json` -- Add `karaoke-reader` dependency
- `apps/tablet/src/components/TextReader.tsx` -- Rewrite to use package
- `packages/karaoke-reader/package.json` -- Add metadata, remove `private: true`, bump version
- `package.json` (root) -- Possibly update build order

### Deleted Files
- `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` -- Replaced by package
- `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts` -- Tests in package
- `apps/tablet/src/lib/ttsCache.ts` -- Replaced by Supabase cache adapter

### Unchanged Files
- `apps/tablet/src/components/screens/TextDisplayScreen.tsx` -- Props unchanged, no modification needed
- `apps/tablet/src/hooks/useInstallationMachine.ts` -- Unrelated
- All `packages/karaoke-reader/src/` files -- No changes needed in the package itself

---

## RESEARCH COMPLETE
