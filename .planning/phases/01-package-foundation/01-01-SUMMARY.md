---
phase: 1
plan: 01
status: complete
date: 2026-03-07
---

# Plan 01 Summary: Scaffold package with build tooling, types, and exports map

## What Was Built

Scaffolded the `packages/karaoke-reader/` package with full build infrastructure, type definitions, and validated exports map. The package builds successfully to ESM + CJS dual format with TypeScript declaration files, and passes both publint and attw validation.

## Key Files Created/Modified

### Created
- `packages/karaoke-reader/package.json` -- Package manifest with 5 subpath exports (`.`, `./utils`, `./hooks`, `./elevenlabs`, `./styles.css`), React as optional peerDependency, zero runtime dependencies
- `packages/karaoke-reader/tsconfig.json` -- Extends `tsconfig.base.json`, strict mode, jsx: react-jsx
- `packages/karaoke-reader/tsup.config.ts` -- 4 entry points, ESM+CJS, dts, sourcemaps, CSS copy via onSuccess hook
- `packages/karaoke-reader/vitest.config.ts` -- Node environment, no globals
- `packages/karaoke-reader/biome.json` -- Linter + formatter config (space indent, 100 line width)
- `packages/karaoke-reader/src/types.ts` -- 7 exported type/interface definitions extracted from existing codebase
- `packages/karaoke-reader/src/index.ts` -- Root barrel re-exporting all types
- `packages/karaoke-reader/src/utils/index.ts` -- Placeholder for Plan 02
- `packages/karaoke-reader/src/hooks/index.ts` -- Placeholder for Phase 2
- `packages/karaoke-reader/src/adapters/elevenlabs/index.ts` -- Placeholder for Phase 3
- `packages/karaoke-reader/src/styles.css` -- Placeholder for Phase 3

### Modified
- `pnpm-lock.yaml` -- Updated with new package dependencies

## Deviations from Plan

1. **tsup.config.ts CSS handling:** Added `onSuccess` hook to copy `src/styles.css` to `dist/styles.css`, since tsup does not automatically handle standalone CSS files in the entry config.
2. **attw configuration:** Added `--exclude-entrypoints ./styles.css` (CSS files have no type declarations) and `--ignore-rules no-resolution` (node10 cannot resolve subpath exports -- this is expected for modern ESM packages).

## Self-Check: PASSED

All verification criteria met:
- `pnpm --filter karaoke-reader build` exits 0 -- produces ESM + CJS bundles and `.d.ts` files
- `pnpm --filter karaoke-reader typecheck` exits 0 -- zero errors
- `publint` passes -- "All good!"
- `attw` passes -- "No problems found" (all entrypoints green for node16 and bundler)
- `dist/index.d.ts` exports: WordTimestamp, AlignmentData, TtsStatus, LineType, ParsedWord, ParsedLine, ParsedParagraph
- No React imports in `dist/` output
- Zero runtime dependencies in package.json
