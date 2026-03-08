---
phase: 2
plan: 01
title: "Test infrastructure and dev dependencies"
status: complete
duration_minutes: 8
commits:
  - 0a8e4c6 feat(karaoke-reader): install test dev dependencies
  - b35e605 feat(karaoke-reader): configure vitest for happy-dom environment
  - 02e8ce0 feat(karaoke-reader): add .test.tsx to tsconfig exclude
  - 154dad5 feat(karaoke-reader): create MockAudio test helper
---

# Plan 01 Summary: Test Infrastructure and Dev Dependencies

## What was done

1. **Installed dev dependencies** -- Added `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `happy-dom`, `react`, `react-dom`, `@types/react`, `@types/react-dom` as devDependencies.

2. **Configured vitest for happy-dom** -- Updated `vitest.config.ts` to use `environment: 'happy-dom'` and `globals: true`. Created `src/test-utils/setup.ts` importing `@testing-library/jest-dom/vitest` for matcher extensions.

3. **Updated tsconfig.json exclude** -- Added `**/*.test.tsx` pattern to the exclude array alongside existing `**/*.test.ts`.

4. **Created MockAudio test helper** -- `src/test-utils/mock-audio.ts` exports a `MockAudio` class extending `EventTarget` with controllable properties (`currentTime`, `duration`, `volume`, `paused`, `readyState`) and simulation methods (`play`, `pause`, `simulateCanPlayThrough`, `simulateEnded`, `simulateError`, `simulateTimeUpdate`).

## Gate result

All passing:
- `pnpm build` -- clean build, all entrypoints emitted
- `tsc --noEmit` -- no type errors
- `check-exports` -- publint + attw all green
- `vitest run` -- 41 tests passing (4 files, all Phase 1 utility tests)

## Files modified

- `packages/karaoke-reader/package.json` -- added 8 devDependencies
- `packages/karaoke-reader/vitest.config.ts` -- happy-dom + globals + setup file
- `packages/karaoke-reader/tsconfig.json` -- added .test.tsx exclude
- `packages/karaoke-reader/src/test-utils/setup.ts` -- jest-dom matcher setup
- `packages/karaoke-reader/src/test-utils/mock-audio.ts` -- MockAudio class
