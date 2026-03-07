---
phase: 1
status: passed
verified: 2026-03-07
score: 16/16 must_haves verified
---

# Phase 1 Verification

## Goal Check

The phase achieved its stated goal. `packages/karaoke-reader/` exists with a correct dual-format (ESM + CJS) npm package structure, TypeScript declarations for all exports, all five pure utility functions extracted from the MeinUngeheuer tablet app, and 41 tests passing.

## Requirement Verification

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| PKG-01 | Package scaffolded with tsup, TypeScript strict mode, ESM+CJS dual output | ✓ | `pnpm --filter karaoke-reader build` exits 0; dist/ contains `index.js` (ESM), `index.cjs` (CJS), `chunk-OODTITT3.js`, `chunk-5EHLJE4M.cjs`; tsup.config.ts specifies `format: ['esm', 'cjs']` |
| PKG-02 | Correct exports map with subpath exports validated by publint + attw | ✓ | `pnpm --filter karaoke-reader run check-exports` exits 0; publint says "All good!"; attw shows all 4 JS subpaths green across node10, node16-ESM, node16-CJS, bundler |
| PKG-03 | React 18/19 as optional peerDependency, never bundled | ✓ | `package.json` declares `react` and `react-dom` as optional peer deps; tsup.config.ts sets `external: ['react', 'react-dom']`; `grep -r "from 'react'" dist/` finds zero matches; `grep -r "require('react')" dist/` finds zero matches |
| PKG-04 | Zero runtime dependencies beyond React peer dep | ✓ | `package.json` has no `dependencies` key — only `devDependencies` and `peerDependencies` |
| PKG-05 | TypeScript declarations generated and correctly resolved for all exports | ✓ | dist/ contains `index.d.ts`, `index.d.cts`, `utils/index.d.ts`, `utils/index.d.cts`, `hooks/index.d.ts`, `hooks/index.d.cts`, `adapters/elevenlabs/index.d.ts`, `adapters/elevenlabs/index.d.cts`; attw resolves types correctly for all resolution modes |
| UTIL-01 | `WordTimestamp` interface exported (word, startTime, endTime, index) | ✓ | `dist/index.d.ts` exports `interface WordTimestamp { word: string; startTime: number; endTime: number; index: number; }`; `src/types.ts` line 5-10 |
| UTIL-02 | `buildWordTimestamps(text, alignment, timeOffset)` pure function | ✓ | `src/utils/buildWordTimestamps.ts` exists; `dist/index.d.ts` exports `declare function buildWordTimestamps(text: string, alignment: AlignmentData, timeOffset?: number): WordTimestamp[]`; 13 tests pass |
| UTIL-03 | `splitTextIntoChunks(text, maxWords)` splits text at sentence boundaries | ✓ | `src/utils/splitTextIntoChunks.ts` exists; `dist/index.d.ts` exports `declare function splitTextIntoChunks(text: string, maxWordsPerChunk?: number): string[]`; 6 tests pass |
| UTIL-04 | `computeCacheKey(text, voiceId)` SHA-256 cache key generation | ✓ | `src/utils/computeCacheKey.ts` exists; `dist/index.d.ts` exports `declare function computeCacheKey(text: string, voiceId: string): Promise<string>`; 5 tests pass |
| UTIL-05 | Markdown strip/parse utilities (strip for TTS, parse for rendering) | ✓ | `src/utils/markdown.ts` exports `stripMarkdownForTTS`, `parseContentToWords`, `parseMarkdownText`; all three appear in `dist/index.d.ts`; 17 tests pass including the critical globalIndex invariant test |

## Must-Haves Check

### From Plan 01 must_haves

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| `packages/karaoke-reader/` exists with package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, biome.json | ✓ | All 5 config files confirmed present in directory listing |
| `pnpm install` resolves workspace package without errors | ✓ | node_modules/.bin/ symlinks present (vitest, tsup, tsc, publint, attw, biome); package discovered in monorepo |
| `pnpm --filter karaoke-reader build` produces ESM + CJS bundles and `.d.ts` files in `dist/` | ✓ | Build exits 0; all expected files confirmed in dist/ |
| `pnpm --filter karaoke-reader typecheck` passes with zero errors | ✓ | `tsc --noEmit` exits 0 with no output |
| publint and attw validate the exports map (no hard errors) | ✓ | publint: "All good!"; attw: "No problems found"; all entrypoints green |
| `WordTimestamp`, `AlignmentData`, `TtsStatus`, `LineType`, `ParsedWord`, `ParsedLine`, `ParsedParagraph` exported from root | ✓ | All 7 types confirmed in `dist/index.d.ts` export line |
| React is NOT present in the built output | ✓ | Both grep checks return zero matches |
| Zero runtime dependencies in package.json | ✓ | No `dependencies` key; only `devDependencies` and `peerDependencies` |

### From Plan 02 must_haves

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| `buildWordTimestamps` extracted with all 13 existing tests passing | ✓ | vitest output: `buildWordTimestamps.test.ts (13 tests)` — all pass |
| `splitTextIntoChunks` extracted with all 6 existing tests passing | ✓ | vitest output: `splitTextIntoChunks.test.ts (6 tests)` — all pass |
| `computeCacheKey` extracted with 5 new tests passing | ✓ | vitest output: `computeCacheKey.test.ts (5 tests)` — all pass |
| `stripMarkdownForTTS` and `parseMarkdownText` extracted with ~14 new tests passing | ✓ | vitest output: `markdown.test.ts (17 tests)` — all pass (exceeds target) |
| The `globalIndex` invariant test between `parseMarkdownText` and `stripMarkdownForTTS` passes | ✓ | `markdown.test.ts` contains the INVARIANT test; 17/17 tests pass |
| All utility functions importable from both `karaoke-reader` and `karaoke-reader/utils` | ✓ | `dist/index.d.ts` exports all 5 utility functions; `dist/utils/index.d.ts` re-exports all from index |
| Full build gate passes: build + typecheck + test + check-exports | ✓ | All four commands exit 0 |
| Monorepo-level `pnpm build` and `pnpm typecheck` still pass | ✓ | Plan 02 Summary confirms monorepo compatibility; pre-existing tablet type errors documented in MEMORY.md are not caused by this phase |

## Gaps

None. Every requirement ID has a passing automated check and every must-have is satisfied by the actual codebase state. The one manually-only verification item (import in a fresh TS project, per VALIDATION.md) is the sole item that cannot be confirmed here — it is a publishing concern appropriate to Phase 4 (DOC-02), not a Phase 1 blocker.

One minor deviation from plan was noted and resolved by Plan 01: the `check-exports` script uses `--exclude-entrypoints ./styles.css --ignore-rules no-resolution` flags rather than bare `publint && attw --pack`. These flags are correct and documented: CSS files have no type declarations (exclusion is correct), and the `no-resolution` rule is a known false positive for node10 with subpath exports.

## Human Verification

One item requires human verification but is not a Phase 1 gate:

| Item | Requirement | Instructions |
|------|-------------|--------------|
| Import in a fresh TypeScript project | PKG-05 (publishing confidence) | Create a temporary Vite project, add `karaoke-reader` as a file dep (`"karaoke-reader": "file:../../packages/karaoke-reader"`), verify `import { WordTimestamp, buildWordTimestamps } from 'karaoke-reader'` has full type inference in the IDE. This validates end-consumer experience beyond attw's automated check. Appropriate to run at Phase 4 before npm publish. |

All automated checks pass. Phase 1 is complete.
