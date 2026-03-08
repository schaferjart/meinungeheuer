# Phase 1: Package Foundation -- Research

**Researched:** 2026-03-07
**Scope:** Everything needed to plan the scaffolding of `packages/karaoke-reader/` with correct exports, TypeScript declarations, and all pure utility functions extracted and tested.

---

## Source Code Analysis

### 1. `buildWordTimestamps` -- Character-to-word timestamp conversion

**Location:** `/apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` lines 62-127

**Signature:**
```typescript
export function buildWordTimestamps(
  text: string,
  alignment: AlignmentData,
  timeOffset: number = 0,
): WordTimestamp[]
```

**Dependencies:**
- `WordTimestamp` interface (defined in same file, lines 8-13)
- `AlignmentData` interface (defined in same file, lines 39-43, private/unexported)

**AlignmentData shape:**
```typescript
interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
```

**Logic summary:** Walks through the text splitting on whitespace boundaries (`/\s/`). For each word, maps to alignment arrays by character index position. Falls back to last known time if alignment is shorter than text. Assigns sequential `index` values.

**Existing tests:** 13 test cases in `useTextToSpeechWithTimestamps.test.ts` covering: basic English, German text, punctuation, multiple sentences, single word, sequential indices, time offset, multiple spaces, leading/trailing whitespace, empty text, start < end invariant, chronological order. Tests use a `mockAlignment` helper that generates evenly spaced timestamps at 0.05s intervals.

**Extraction notes:** Pure function, zero external dependencies. The `AlignmentData` type must be exported from the new package since it is a parameter type. The existing tests transfer directly with only import path changes.

---

### 2. `splitTextIntoChunks` -- Sentence boundary text splitting

**Location:** `/apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` lines 133-164

**Signature:**
```typescript
export function splitTextIntoChunks(text: string, maxWordsPerChunk: number = 200): string[]
```

**Dependencies:** None (pure string manipulation).

**Logic summary:** Uses regex `/[^.!?]+[.!?]+\s*/g` to find sentences. Accumulates sentences into chunks until word count exceeds `maxWordsPerChunk`, then starts a new chunk. Returns `[text]` if no sentence boundaries found or if text is short enough.

**Existing tests:** 6 test cases covering: short text, under max, splitting at sentence boundaries (verifying chunks end with period), no sentence boundaries, mixed punctuation, single sentence.

**Extraction notes:** Zero dependencies. Tests transfer directly. Consider whether the sentence regex handles edge cases like abbreviations ("Dr. Smith") or ellipsis ("...") -- the existing code does not, and that is acceptable for v1.

---

### 3. `computeCacheKey` -- SHA-256 hash generation

**Location:** `/apps/tablet/src/lib/ttsCache.ts` lines 12-18

**Signature:**
```typescript
export async function computeCacheKey(text: string, voiceId: string): Promise<string>
```

**Dependencies:**
- `crypto.subtle.digest` (Web Crypto API, available in browsers and Node 20+)
- `TextEncoder` (global, available in browsers and Node)

**Logic summary:** Normalizes whitespace (`/\s+/g` -> single space, trim), concatenates with `|` separator and voice ID, SHA-256 hashes, returns hex string.

**Existing tests:** NONE. No test file exists for `ttsCache.ts`. Tests must be written from scratch.

**Extraction notes:** Pure async function. Uses `crypto.subtle` which is available in Vitest's Node environment (Node 20+ has `globalThis.crypto.subtle`). The other functions in `ttsCache.ts` (`getCachedTts`, `storeTtsCache`) depend on Supabase and are NOT extracted in Phase 1 -- they stay in the MeinUngeheuer app. Only `computeCacheKey` is extracted.

---

### 4. `stripMarkdownForTTS` -- Markdown stripping for TTS input

**Location:** `/apps/tablet/src/components/TextReader.tsx` lines 36-41

**Signature:**
```typescript
function stripMarkdownForTTS(text: string): string
```

**Note:** Currently NOT exported (plain `function`, not `export function`).

**Dependencies:** None (pure regex).

**Logic summary:** Three regex replacements:
1. `^#+\s*` (multiline) -- removes header markers
2. `~~` -- removes strikethrough markers
3. `/ {2,}$/gm` -- removes trailing double-space line break markers

**Existing tests:** NONE. Tests must be written from scratch. The `TextDisplayScreen` uses a fallback text with headers (`# 2024-10-28, 2130h`) and strikethrough (`~~believe~~`) that serve as real-world test data.

**Extraction notes:** Trivially extractable. Add export. Write tests covering headers, strikethrough, trailing spaces, and combined cases.

---

### 5. `parseMarkdownText` -- Markdown to renderable word structure

**Location:** `/apps/tablet/src/components/TextReader.tsx` lines 91-139

**Signature:**
```typescript
function parseMarkdownText(text: string): ParsedParagraph[]
```

**Note:** Currently NOT exported.

**Related types (also unexported, lines 69-85):**
```typescript
type LineType = 'header' | 'list-item' | 'text';

interface ParsedWord {
  word: string;
  strikethrough: boolean;
  globalIndex: number;
}

interface ParsedLine {
  type: LineType;
  words: ParsedWord[];
}

interface ParsedParagraph {
  lines: ParsedLine[];
}
```

**Dependencies:**
- `parseContentToWords` helper (lines 48-67, also unexported) -- splits content on `~~` delimiters and whitespace, returning `Array<{ word: string; strikethrough: boolean }>`.

**Logic summary:** Splits text on blank lines into paragraphs, then on newlines into lines. Each line is classified as `header` (starts with `#`), `list-item` (starts with `\d+\.`), or `text`. Words within lines get globally sequential indices and strikethrough flags.

**Existing tests:** NONE. Tests must be written from scratch. The fallback text in TextDisplayScreen provides excellent test data with headers, lists, strikethrough, and multi-paragraph structure.

**Extraction notes:** All related types and the helper function `parseContentToWords` must be extracted together. These types become part of the package's public API since consumers of the component will need them. The `globalIndex` on `ParsedWord` is the critical link that ties parsed markdown words to `WordTimestamp` entries -- this correspondence must be documented and tested.

---

### 6. `WordTimestamp` interface

**Location:** `/apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` lines 8-13

```typescript
export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
  index: number;
}
```

**Usage sites:**
- `buildWordTimestamps` return type
- `ttsCache.ts` imports it (`import type { WordTimestamp } from '../hooks/useTextToSpeechWithTimestamps'`)
- `TextReader.tsx` uses it indirectly via the hook return type
- `useTextToSpeechWithTimestamps.test.ts` imports it as a type

**Extraction notes:** This becomes the package's core type export. It is the interface between timestamp producers (like the ElevenLabs adapter) and timestamp consumers (like the KaraokeReader component). No change to the shape needed.

---

### 7. Other types to export

**`TtsStatus`** (line 15): `'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error'`
- Used by the hook and will be used by the component in Phase 2
- Export in Phase 1 so the types subpath is complete

**`AlignmentData`** (lines 39-43): Must be exported since it is a parameter of `buildWordTimestamps`. Currently unexported. Rename consideration: this is ElevenLabs-specific terminology. However, it describes a generic character-level alignment format that other TTS providers could produce. Keep the name but document it as "character-level alignment data, as returned by ElevenLabs TTS API or any compatible source."

---

### 8. Functions NOT extracted in Phase 1

| Function | File | Reason |
|----------|------|--------|
| `fetchTtsWithTimestamps` | useTextToSpeechWithTimestamps.ts:172-223 | ElevenLabs API call -- Phase 3 (adapters) |
| `base64PartsToAudioUrl` | useTextToSpeechWithTimestamps.ts:229-243 | Audio lifecycle -- Phase 2 (hooks) |
| `useTextToSpeechWithTimestamps` | useTextToSpeechWithTimestamps.ts:249-554 | React hook -- Phase 2 |
| `getCachedTts` | ttsCache.ts:23-42 | Supabase-specific -- stays in MeinUngeheuer |
| `storeTtsCache` | ttsCache.ts:47-77 | Supabase-specific -- stays in MeinUngeheuer |
| `parseContentToWords` | TextReader.tsx:48-67 | Extracted as internal helper alongside `parseMarkdownText` |

---

## Package Architecture

### Directory Layout

```
packages/karaoke-reader/
  package.json
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  biome.json
  src/
    index.ts              # Main barrel: re-exports types + utils
    types.ts              # WordTimestamp, AlignmentData, TtsStatus,
                          # ParsedParagraph, ParsedLine, ParsedWord, LineType
    utils/
      index.ts            # Barrel for /utils subpath export
      buildWordTimestamps.ts
      buildWordTimestamps.test.ts
      splitTextIntoChunks.ts
      splitTextIntoChunks.test.ts
      computeCacheKey.ts
      computeCacheKey.test.ts
      markdown.ts         # stripMarkdownForTTS, parseMarkdownText, parseContentToWords
      markdown.test.ts
    hooks/
      index.ts            # Empty barrel, placeholder for Phase 2
    adapters/
      elevenlabs/
        index.ts          # Empty barrel, placeholder for Phase 3
```

### Exports Map (Phase 1)

```jsonc
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./utils": {
      "import": { "types": "./dist/utils/index.d.ts", "default": "./dist/utils/index.js" },
      "require": { "types": "./dist/utils/index.d.cts", "default": "./dist/utils/index.cjs" }
    },
    "./hooks": {
      "import": { "types": "./dist/hooks/index.d.ts", "default": "./dist/hooks/index.js" },
      "require": { "types": "./dist/hooks/index.d.cts", "default": "./dist/hooks/index.cjs" }
    },
    "./elevenlabs": {
      "import": { "types": "./dist/adapters/elevenlabs/index.d.ts", "default": "./dist/adapters/elevenlabs/index.js" },
      "require": { "types": "./dist/adapters/elevenlabs/index.d.cts", "default": "./dist/adapters/elevenlabs/index.cjs" }
    },
    "./styles.css": "./dist/styles.css"
  }
}
```

**Phase 1 note:** The `./hooks`, `./elevenlabs`, and `./styles.css` entries are scaffolded with empty or minimal content. This ensures publint and attw validate the full exports map from day one, and subsequent phases simply fill in the content without changing the exports structure.

### What the main `index.ts` exports in Phase 1

```typescript
// Types
export type { WordTimestamp, AlignmentData, TtsStatus } from './types.js';
export type { ParsedParagraph, ParsedLine, ParsedWord, LineType } from './types.js';

// Utilities
export { buildWordTimestamps } from './utils/buildWordTimestamps.js';
export { splitTextIntoChunks } from './utils/splitTextIntoChunks.js';
export { computeCacheKey } from './utils/computeCacheKey.js';
export { stripMarkdownForTTS, parseMarkdownText } from './utils/markdown.js';
```

### What `./utils` index.ts exports

Same as above, but only the utility functions (types are re-exported from the main entry for convenience, but technically live in `types.ts`).

---

## Build Configuration

### tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'utils/index': 'src/utils/index.ts',
    'hooks/index': 'src/hooks/index.ts',
    'adapters/elevenlabs/index': 'src/adapters/elevenlabs/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  splitting: true,
  treeshake: true,
});
```

**Key decisions:**
- **4 entry points** matching the 4 JS subpath exports. Each produces its own `.js`, `.cjs`, `.d.ts`, and `.d.cts` files.
- **ESM + CJS dual output** for maximum compatibility (PKG-01).
- **`external: ['react', 'react-dom']`** ensures React is never bundled (PKG-03). In Phase 1 none of the code uses React, but this is set from the start.
- **`splitting: true`** enables code splitting so shared code between entry points is not duplicated.
- **`treeshake: true`** eliminates dead code.
- **`clean: true`** removes `dist/` before each build.

### tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"],
  "exclude": ["**/*.test.ts"]
}
```

**Notes:**
- Extends the monorepo's `tsconfig.base.json` (strict mode, ES2022 target, bundler resolution, noUncheckedIndexedAccess).
- `lib` includes `DOM` because `computeCacheKey` uses `crypto.subtle` and `TextEncoder` which are defined in DOM lib typings. Also needed for Phase 2 hooks.
- `jsx: "react-jsx"` is set from the start even though Phase 1 has no JSX, to avoid changing the config in Phase 2.
- `noEmit: true` because tsup handles emission; tsc is only used for type-checking.

### package.json

```jsonc
{
  "name": "karaoke-reader",
  "version": "0.0.1",
  "private": true,           // Stays private until Phase 4 publication
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { /* see exports map above */ },
  "files": ["dist"],
  "sideEffects": ["*.css"],
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "react-dom": { "optional": true }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "biome check src/",
    "check-exports": "publint && attw --pack"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.5",
    "@biomejs/biome": "^2.0.0",
    "publint": "^0.3.0",
    "@arethetypeswrong/cli": "^0.17.0"
  }
}
```

**Key decisions:**
- **`peerDependenciesMeta.react.optional: true`**: In Phase 1, none of the exported code actually uses React. Making the peer dep optional means consumers of only the `/utils` subpath don't get peer dependency warnings. In Phase 2, when hooks are added, we can remove the `optional` flag or keep it (consumers who only use utils still don't need React).
- **Zero runtime `dependencies`**: Satisfies PKG-04.
- **`private: true`**: Prevents accidental publish before Phase 4. Removed when ready to publish.
- **`check-exports` script**: Runs publint and attw for validation (PKG-02, PKG-05).

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',   // Pure functions don't need DOM
  },
});
```

Phase 1 tests are all pure function tests that run in Node. No happy-dom/jsdom needed until Phase 2.

### biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

### pnpm-workspace.yaml

No change needed. The existing config already includes `packages/*`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`packages/karaoke-reader/` is automatically discovered.

---

## Extraction Strategy

### Step-by-step plan

**Step 1: Scaffold package structure**
- Create `packages/karaoke-reader/` with all config files (package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, biome.json)
- Create directory tree: `src/`, `src/utils/`, `src/hooks/`, `src/adapters/elevenlabs/`
- Create placeholder barrel files for hooks and elevenlabs (empty exports)
- Create `src/styles.css` placeholder (empty file or minimal comment)
- Verify: `pnpm install` resolves the new workspace package

**Step 2: Create types.ts**
- Copy `WordTimestamp` interface from `useTextToSpeechWithTimestamps.ts:8-13`
- Copy `AlignmentData` interface from `useTextToSpeechWithTimestamps.ts:39-43` (currently unexported, now exported)
- Copy `TtsStatus` type from `useTextToSpeechWithTimestamps.ts:15`
- Copy markdown types from `TextReader.tsx:69-85` (`LineType`, `ParsedWord`, `ParsedLine`, `ParsedParagraph`)
- All types are pure TypeScript -- no adaptation needed

**Step 3: Extract `buildWordTimestamps`**
- Copy function body from `useTextToSpeechWithTimestamps.ts:62-127`
- Import `WordTimestamp` and `AlignmentData` from `../types.js`
- Copy the 13 existing tests from `useTextToSpeechWithTimestamps.test.ts:43-193` (including the `mockAlignment` helper)
- Update imports to point to new location
- Verify: tests pass identically

**Step 4: Extract `splitTextIntoChunks`**
- Copy function body from `useTextToSpeechWithTimestamps.ts:133-164`
- No type imports needed (pure string -> string[])
- Copy the 6 existing tests from `useTextToSpeechWithTimestamps.test.ts:200-265`
- Verify: tests pass identically

**Step 5: Extract `computeCacheKey`**
- Copy function body from `ttsCache.ts:12-18`
- No type imports needed (pure string -> Promise<string>)
- Write NEW tests:
  - Deterministic: same input always produces same hash
  - Different inputs produce different hashes
  - Whitespace normalization: `"hello  world"` and `"hello world"` produce same key
  - Voice ID matters: same text with different voiceId produces different key
  - Returns 64-character hex string (SHA-256 = 32 bytes = 64 hex chars)
- Verify: tests pass

**Step 6: Extract markdown utilities**
- Copy `stripMarkdownForTTS` from `TextReader.tsx:36-41`
- Copy `parseContentToWords` from `TextReader.tsx:48-67` (internal helper, not exported from package)
- Copy `parseMarkdownText` from `TextReader.tsx:91-139`
- Write NEW tests for `stripMarkdownForTTS`:
  - Removes `# ` header markers
  - Removes `~~` strikethrough markers
  - Removes trailing double-spaces
  - Preserves normal text
  - Combined: text with all three marker types
- Write NEW tests for `parseMarkdownText`:
  - Single paragraph, plain text
  - Multiple paragraphs (separated by blank line)
  - Header detection (`# title` -> type: 'header')
  - List item detection (`1. item` -> type: 'list-item')
  - Strikethrough words (`~~word~~` -> `{ word, strikethrough: true }`)
  - Global index is sequential across paragraphs and lines
  - Global index matches word sequence produced by `stripMarkdownForTTS` (critical invariant)
  - Use the `FALLBACK_TEXT` from TextDisplayScreen as a real-world integration test case

**Step 7: Wire barrel exports**
- `src/utils/index.ts`: export all utility functions
- `src/index.ts`: re-export types + all utilities
- `src/hooks/index.ts`: empty for now (placeholder for Phase 2)
- `src/adapters/elevenlabs/index.ts`: empty for now (placeholder for Phase 3)

**Step 8: Build and validate**
- `pnpm build` in package directory: verify ESM + CJS + `.d.ts` output
- `pnpm typecheck`: verify zero type errors
- `pnpm test`: verify all tests pass
- `publint`: verify exports map is correct
- `attw --pack`: verify types resolve for all module resolution strategies

### What to copy vs. adapt vs. create new

| Item | Action | Notes |
|------|--------|-------|
| `WordTimestamp` interface | Copy verbatim | No changes |
| `AlignmentData` interface | Copy, add `export` | Was unexported |
| `TtsStatus` type | Copy verbatim | No changes |
| `ParsedParagraph` + related types | Copy, add `export` | Were unexported |
| `buildWordTimestamps()` | Copy verbatim | Already exported and tested |
| `splitTextIntoChunks()` | Copy verbatim | Already exported and tested |
| `computeCacheKey()` | Copy verbatim | Already exported, needs new tests |
| `stripMarkdownForTTS()` | Copy, add `export` | Was unexported, needs new tests |
| `parseContentToWords()` | Copy as internal helper | Keep unexported from package |
| `parseMarkdownText()` | Copy, add `export` | Was unexported, needs new tests |
| Existing test cases | Copy with import path updates | 19 tests transfer directly |
| New test cases | Create from scratch | ~15-20 new tests needed |
| Package config files | Create new | package.json, tsconfig, tsup, vitest, biome |
| Barrel index files | Create new | 4 barrel files |

---

## Risk Assessment

### Risk 1: `computeCacheKey` uses `crypto.subtle` -- environment compatibility

**Impact:** Medium. `crypto.subtle` is available in browsers and Node 20+, but some test environments or edge runtimes might not have it.

**Mitigation:** Vitest running on Node 20+ has `globalThis.crypto.subtle` available natively. No polyfill needed for tests. Document in the package that `crypto.subtle` is required (Web Crypto API). If CJS consumers in older Node versions need it, they can polyfill -- but this is unlikely for a browser-focused package.

### Risk 2: Markdown utilities have no existing tests -- hidden edge cases

**Impact:** Medium. The regex in `stripMarkdownForTTS` and the parsing logic in `parseMarkdownText` handle a specific subset of markdown. Edge cases (nested strikethrough, multiple `#` levels, empty lines within paragraphs) might not be covered.

**Mitigation:** Use the real-world `FALLBACK_TEXT` from TextDisplayScreen (which has headers, strikethrough, numbered lists, multi-paragraph structure) as an integration test case. Additionally write targeted edge case tests. The functions are small (5 lines and 48 lines respectively) so manual review is tractable.

### Risk 3: `globalIndex` correspondence between `parseMarkdownText` and `stripMarkdownForTTS`

**Impact:** High. The `globalIndex` assigned by `parseMarkdownText` must correspond exactly to the word positions in the text produced by `stripMarkdownForTTS`. If they drift, highlighting will be offset. This invariant is currently implicit in TextReader.tsx.

**Mitigation:** Write an explicit test that: (1) calls `stripMarkdownForTTS(text)` and splits into words, (2) calls `parseMarkdownText(text)` and extracts words by `globalIndex`, (3) asserts the two word sequences are identical. This test makes the implicit invariant explicit and will catch any future drift.

### Risk 4: tsup CJS output for ESM-only code

**Impact:** Low. All Phase 1 code is pure functions with no module-level side effects. CJS output should be straightforward.

**Mitigation:** The `attw --pack` check validates that types resolve correctly for both ESM and CJS module resolution modes. Run this as part of the build gate.

### Risk 5: Subpath exports with empty placeholders may confuse publint/attw

**Impact:** Low. Empty barrel files (`export {}`) still produce valid JS/DTS output from tsup. publint and attw should accept them.

**Mitigation:** If empty barrels cause issues, export a trivial sentinel (`export const __placeholder = true`) and remove it when real exports are added. Test this during implementation.

### Risk 6: `splitTextIntoChunks` regex does not handle all edge cases

**Impact:** Low. The regex `/[^.!?]+[.!?]+\s*/g` does not handle: abbreviations (Dr., Mrs.), URLs (https://...), decimal numbers (3.14). However, this function is used for TTS text chunking where these patterns are uncommon, and the fallback (return entire text as one chunk) is safe.

**Mitigation:** Document the limitation. Accept for v1. Can be improved in a future version with a more sophisticated sentence tokenizer.

---

## Validation Architecture

### Unit Testing Strategy

All tests use Vitest, test files colocated with source (`foo.ts` -> `foo.test.ts`), running in Node environment (no DOM needed for Phase 1).

**Test categories:**

| Test File | Tests From Existing | New Tests | Total (est.) |
|-----------|-------------------|-----------|--------------|
| `buildWordTimestamps.test.ts` | 13 | 0 | 13 |
| `splitTextIntoChunks.test.ts` | 6 | 0 | 6 |
| `computeCacheKey.test.ts` | 0 | 5 | 5 |
| `markdown.test.ts` | 0 | 12-15 | ~14 |
| **Total** | **19** | **~20** | **~38** |

### `computeCacheKey` test plan

1. Returns a 64-character lowercase hex string
2. Deterministic: same inputs produce same output
3. Whitespace normalization: `"a  b"` and `"a b"` produce same key
4. Voice ID differentiation: same text, different voice ID -> different key
5. Text differentiation: different text, same voice ID -> different key

### `stripMarkdownForTTS` test plan

1. Removes `# ` header markers (single `#`)
2. Removes `## ` header markers (multiple `#`)
3. Removes `~~` strikethrough markers
4. Removes trailing double-space line break markers
5. Preserves normal text without markers
6. Combined: text with all three marker types produces clean output
7. Does not alter content within words (e.g., `hello~~world` becomes `helloworld`)

### `parseMarkdownText` test plan

1. Single line, plain text -> one paragraph, one line, type 'text'
2. Multiple paragraphs (blank line separation)
3. Header detection: `# Title` -> type 'header', content without `#`
4. List item detection: `1. Item` -> type 'list-item'
5. Strikethrough words: `~~word~~` -> `{ word: "word", strikethrough: true }`
6. Mixed strikethrough: `normal ~~struck~~ more` -> correct flags
7. Global index is sequential starting at 0
8. Global index increments across paragraphs
9. Empty paragraphs are skipped
10. **Invariant test:** word sequence from `parseMarkdownText` (sorted by `globalIndex`) matches word sequence from `stripMarkdownForTTS` split on whitespace

### Package Validation (publint + attw)

After `pnpm build`:

```bash
# Validate package.json exports map matches dist output
npx publint

# Validate TypeScript types resolve for all resolution strategies
npx attw --pack
```

**Expected attw output for Phase 1:**
- `node10`: types resolve via `main` + `types` fields
- `node16-esm`: types resolve via `exports["."].import.types`
- `node16-cjs`: types resolve via `exports["."].require.types`
- `bundler`: types resolve via `exports["."].import.types`
- Same for `./utils`, `./hooks`, `./elevenlabs` subpaths

**Potential attw issues:**
- If `./styles.css` subpath has no types condition, attw may warn. This is expected and correct -- CSS files have no types.
- If placeholder barrels export nothing, attw may flag `EmptyDeclarationFile`. Solution: export at least one type or const from each barrel.

### Build Gate Checklist (all must pass)

1. `pnpm build` -- produces `dist/` with all expected files
2. `pnpm typecheck` -- zero TypeScript errors
3. `pnpm test` -- all ~38 tests pass
4. `pnpm run check-exports` -- publint + attw both pass
5. Manual verification: `dist/` contains no React imports in the JS output
6. Manual verification: `dist/index.js` and `dist/utils/index.js` export the expected symbols

### Verifying React is NOT bundled (PKG-03)

After build, check the output files:

```bash
# Should find zero matches (React is externalized)
grep -r "from 'react'" dist/ || echo "OK: no React imports in dist"
grep -r "require('react')" dist/ || echo "OK: no React requires in dist"
```

In Phase 1 this is trivially true since no source code imports React. But setting up `external: ['react', 'react-dom']` in tsup ensures it remains true in Phase 2+.

---

## RESEARCH COMPLETE
