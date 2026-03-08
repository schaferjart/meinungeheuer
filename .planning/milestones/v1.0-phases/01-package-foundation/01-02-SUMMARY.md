# Plan 02 Summary: Extract utility functions with tests and wire exports

**Status:** Complete
**Date:** 2026-03-07
**Commits:** 5

## What was done

Extracted 5 pure utility functions from the MeinUngeheuer tablet app into the `karaoke-reader` package, along with comprehensive tests and wired barrel exports.

### Tasks completed

| Task | Description | Tests | Commit |
|------|-------------|-------|--------|
| 02-01 | Extract `buildWordTimestamps` | 13 (transferred) | `4fbb202` |
| 02-02 | Extract `splitTextIntoChunks` | 6 (transferred) | `44bff0b` |
| 02-03 | Extract `computeCacheKey` | 5 (new) | `c0df9da` |
| 02-04 | Extract markdown utilities (`stripMarkdownForTTS`, `parseContentToWords`, `parseMarkdownText`) | 17 (new) | `12ce59b` |
| 02-05 | Wire barrel exports (utils/index.ts + root index.ts) | - | `88c340b` |
| 02-06 | Full build gate validation | - | (validation only) |

### Test results

- **Total tests:** 41 (exceeds the ~38 target)
  - `buildWordTimestamps`: 13 tests
  - `splitTextIntoChunks`: 6 tests
  - `computeCacheKey`: 5 tests
  - `markdown` (stripMarkdownForTTS + parseMarkdownText): 17 tests

### Build gate

All checks pass:
- `pnpm --filter karaoke-reader build` -- ESM + CJS bundles + declarations
- `pnpm --filter karaoke-reader typecheck` -- zero errors
- `pnpm --filter karaoke-reader test` -- 41/41 pass
- `pnpm --filter karaoke-reader run check-exports` -- publint + attw both pass
- No React in dist/ bundle
- All exports verified in `dist/index.d.ts` and `dist/utils/index.d.ts`
- Monorepo `pnpm build` passes (tablet typecheck errors are pre-existing, documented in MEMORY.md)

### Key decisions

- Removed unused type imports (`ParsedWord`, `LineType`) from `markdown.ts` -- they are structurally used through `ParsedLine` and `ParsedParagraph` but not directly referenced as type annotations.

### Files created/modified

- `packages/karaoke-reader/src/utils/buildWordTimestamps.ts` (new)
- `packages/karaoke-reader/src/utils/buildWordTimestamps.test.ts` (new)
- `packages/karaoke-reader/src/utils/splitTextIntoChunks.ts` (new)
- `packages/karaoke-reader/src/utils/splitTextIntoChunks.test.ts` (new)
- `packages/karaoke-reader/src/utils/computeCacheKey.ts` (new)
- `packages/karaoke-reader/src/utils/computeCacheKey.test.ts` (new)
- `packages/karaoke-reader/src/utils/markdown.ts` (new)
- `packages/karaoke-reader/src/utils/markdown.test.ts` (new)
- `packages/karaoke-reader/src/utils/index.ts` (updated)
- `packages/karaoke-reader/src/index.ts` (updated)
