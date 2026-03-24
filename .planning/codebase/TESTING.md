# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:**
- Vitest (all workspaces)
- Versions: `^3.0.5` in tablet, printer-bridge, backend; separate config per workspace package

**Assertion Library:**
- Vitest built-in `expect` (Chai-based)
- `@testing-library/jest-dom/vitest` — DOM matchers in `packages/karaoke-reader`

**Run Commands:**
```bash
pnpm test                          # Run all tests across all workspaces (pnpm -r test)
pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts  # Single file
pnpm --filter @meinungeheuer/tablet exec vitest src/hooks/useInstallationMachine.test.ts     # Watch mode
pnpm --filter @meinungeheuer/printer-bridge test   # Printer bridge tests only
pnpm --filter karaoke-reader test                   # Karaoke reader tests only
pnpm --filter @meinungeheuer/shared test            # Shared programs tests only
```

## Vitest Configuration Per Workspace

**`apps/tablet`** — No vitest.config.ts; runs with Vitest defaults. Uses `jsdom` only where specified with in-file directive `// @vitest-environment jsdom`. Default environment is Node.

**`apps/printer-bridge`** — No vitest.config.ts; runs with Vitest defaults (Node environment). `"test": "vitest run --passWithNoTests"` — allows running with zero tests found.

**`apps/backend`** — No vitest.config.ts; `"test": "vitest run --passWithNoTests"`. No test files exist currently.

**`packages/shared`** — `packages/shared/vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],  // Explicit include to exclude dist/
  },
});
```

**`packages/karaoke-reader`** — `packages/karaoke-reader/vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-utils/setup.ts'],  // Imports @testing-library/jest-dom/vitest
  },
});
```

## Test File Organization

**Location:** Co-located with source — `foo.ts` → `foo.test.ts`, `foo.tsx` → `foo.test.tsx`

**Naming:** `{module}.test.ts` / `{module}.test.tsx`

**Structure:**
```
apps/tablet/src/
  hooks/
    useInstallationMachine.ts
    useInstallationMachine.test.ts   # Reducer logic
    useConversation.ts
    useConversation.test.ts          # mapRole() only
    usePortraitCapture.ts
    usePortraitCapture.test.ts
  lib/
    systemPrompt.ts
    systemPrompt.test.ts
    fullscreen.ts
    fullscreen.test.ts

apps/printer-bridge/src/
  config.ts
  config.test.ts
  printer.ts
  printer.test.ts

packages/shared/src/programs/
  aphorism.ts
  free-association.ts
  free-association.test.ts
  index.ts
  index.test.ts                      # Registry + schema validation

packages/karaoke-reader/src/
  adapters/elevenlabs/
    index.ts
    index.test.ts                    # fetchElevenLabsTTS + useElevenLabsTTS
  cache.ts
  cache.test.ts
  hooks/
    useAudioSync.ts
    useAudioSync.test.ts
    useAutoScroll.ts
    useAutoScroll.test.ts
    useKaraokeReader.ts
    useKaraokeReader.test.ts
  components/
    KaraokeReader.tsx
    KaraokeReader.test.tsx
  utils/
    buildWordTimestamps.ts
    buildWordTimestamps.test.ts
    computeCacheKey.ts
    computeCacheKey.test.ts
    markdown.ts
    markdown.test.ts
    splitTextIntoChunks.ts
    splitTextIntoChunks.test.ts
```

## Test Count by Package

| Package | Test Files | Approx Tests |
|---------|-----------|-------------|
| `apps/tablet` | 5 | ~40 |
| `apps/printer-bridge` | 2 | ~10 |
| `apps/backend` | 0 | 0 |
| `packages/shared` | 2 | ~20 |
| `packages/karaoke-reader` | 9 | ~80 |
| **Total** | **18** | **~150** |

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ModuleName', () => {
  describe('specific feature/method', () => {
    it('does X when Y', () => {
      // arrange
      const state = { screen: 'sleep', ... };
      // act
      const next = reducer(state, { type: 'WAKE' });
      // assert
      expect(next.screen).toBe('welcome');
    });
  });
});
```

**Reducer testing pattern (useInstallationMachine.test.ts):**
The reducer is inlined into the test file — the source module does not export the reducer function. Tests duplicate the reducer logic to test it in isolation without React hooks:
```typescript
// Reducer is re-implemented inline — never calls renderHook
function reducer(state: InstallationState, action: InstallationAction): InstallationState { ... }

// Sequence helper
function advance(state: InstallationState, ...actions: InstallationAction[]): InstallationState {
  return actions.reduce((s, a) => reducer(s, a), state);
}
```

**Full flow tests:**
```typescript
it('traverses states (text_term skips term_prompt)', () => {
  const final = advance(
    { ...initialState, mode: 'text_term', ... },
    { type: 'WAKE' },
    { type: 'TIMER_3S' },
    { type: 'READY' },
    { type: 'DEFINITION_RECEIVED', definition: def },
    { type: 'DEFINITION_READY' },
    { type: 'TIMER_10S' },
    { type: 'TIMER_15S' },
  );
  expect(final.screen).toBe('sleep');
});
```

**Per-screen guard tests:**
```typescript
it('DEFINITION_RECEIVED is ignored outside conversation', () => {
  const inSleep = reducer(initialState, { type: 'DEFINITION_RECEIVED', definition: def });
  expect(inSleep.screen).toBe('sleep');
});
```

## Mocking Patterns

**Global fetch mock (printer.test.ts, elevenlabs adapter test):**
```typescript
// vi.stubGlobal — preferred for Node tests without jsdom
const mockFetch = vi.fn()
  .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(pngBlob) })
  .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') });
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.restoreAllMocks();
});
```

**Browser global mock (ElevenLabs adapter test — happy-dom):**
```typescript
beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});
```

**console.warn spy (to assert warnings are logged):**
```typescript
vi.spyOn(console, 'warn').mockImplementation(() => {});
// ... test ...
// or assert it was called:
expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
warnSpy.mockRestore();
```

**DOM environment directive (fullscreen.test.ts):**
```typescript
// @vitest-environment jsdom
```
Used at file top when a test needs browser globals but the package default is Node.

**Module re-import pattern (fullscreen.test.ts):**
For modules with side-effectful module-level code, `vi.resetModules()` + dynamic `import()` ensures each test gets a fresh module:
```typescript
afterEach(() => {
  vi.resetModules();
});
it('returns true when navigator.standalone is true', async () => {
  Object.defineProperty(navigator, 'standalone', { value: true, ... });
  const { isStandaloneMode } = await import('./fullscreen');
  expect(isStandaloneMode()).toBe(true);
});
```

**DOM API mock (usePortraitCapture.test.ts):**
```typescript
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
  return originalCreateElement(tag);
});
```

**Storage mock (cache.test.ts):**
```typescript
const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
  throw new DOMException('SecurityError');
});
```

**MockAudio utility (karaoke-reader):**
The `packages/karaoke-reader/src/test-utils/mock-audio.ts` provides a `MockAudio` class that simulates `HTMLAudioElement` events (`canplaythrough`, `timeupdate`, etc.) with imperative trigger methods:
```typescript
const mockAudio = new MockAudio() as unknown as HTMLAudioElement;
act(() => {
  (mockAudio as unknown as MockAudio).simulateCanPlayThrough(5); // sets duration
});
```

**Custom CacheAdapter mock (elevenlabs adapter test):**
```typescript
function makeMockCache(stored?: TTSCacheValue | null) {
  const getCalls: string[] = [];
  const setCalls: Array<{ key: string; value: TTSCacheValue }> = [];
  return {
    getCalls,
    setCalls,
    async get(key: string) { getCalls.push(key); return stored ?? null; },
    async set(key: string, value: TTSCacheValue) { setCalls.push({ key, value }); },
  };
}
```

## Hook Testing

`@testing-library/react`'s `renderHook` + `waitFor` + `act` used for all hook tests:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';

it('status transitions: idle -> loading -> ready', async () => {
  const { result } = renderHook(() => useElevenLabsTTS(options));
  expect(['idle', 'loading']).toContain(result.current.status);

  await waitFor(() => {
    expect(result.current.status).toBe('ready');
  });
});
```

**Fake timers for rAF-dependent hooks:**
```typescript
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
```

## Factory Helpers

Tests use `makeXxx()` factory functions for test data, not shared fixtures files:
```typescript
function makeDefinition(overrides: Partial<Definition> = {}): Definition {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    session_id: '00000000-0000-0000-0000-000000000002',
    term: 'BIRD',
    definition_text: 'A bird is a happy accident.',
    ...overrides,
  };
}
```

**Null UUID convention:** Test IDs use `00000000-0000-0000-0000-000000000001` through `...099` pattern for readability.

## What IS Tested

- State machine reducer transitions (all screens, all stage-config combinations, guard conditions)
- ElevenLabs role mapping (`mapRole`)
- System prompt content assertions (guardrails, mode blocks, paragraph numbering)
- Program registry (`getProgram` fallback, `listPrograms`, stage configs)
- Individual program instances (id, stages, prompt content, first message language selection)
- Shared Zod schemas (optional fields, defaults, variant shapes)
- Printer console-mode vs HTTP-mode behavior
- Printer retry logic (2-attempt loop, render API fallback)
- Printer API key header injection
- Config `loadConfig` env var reading + defaults
- Portrait capture hook (`captureFrame`, canvas interaction, blob size thresholds)
- Fullscreen API (standalone mode detection, webkit fallback, manifest.json assertions)
- ElevenLabs TTS adapter (fetch calls, multi-chunk time offsets, cache hit/miss, error handling, abort)
- Cache implementations (memory, localStorage, error resilience, prefix isolation)
- Word timestamp building from character alignment data
- Karaoke audio sync (`findActiveWordIndex` pure function, hook state transitions)
- KaraokeReader component (word span rendering, data attributes)
- All cache error cases are explicitly tested (read throws, write throws, corrupted JSON)

## What is NOT Tested

- `apps/backend` — zero test files. The entire Hono API surface (routes, webhook handlers, services) is untested. This is the highest-risk gap.
- `apps/tablet/src/lib/persist.ts` — no tests for Supabase persistence functions
- `apps/tablet/src/lib/api.ts` — no tests for `fetchConfig`, `startSession`, `submitVoiceChainData`
- `apps/tablet/src/lib/supabase.ts` — Supabase client initialization
- `apps/tablet/src/hooks/useFaceDetection.ts` — MediaPipe integration untested
- `apps/tablet/src/hooks/useAudioCapture.ts` — audio recording untested
- `apps/tablet/src/components/screens/*` — UI components have no rendering tests (except `KaraokeReader`)
- `apps/printer-bridge/src/index.ts` — Supabase Realtime subscription logic untested
- `packages/shared/src/programs/voice-chain.ts` — no test file for the voice chain program
- Supabase integration — no database integration tests anywhere
- ElevenLabs webhook signature verification — no tests for auth middleware in `apps/backend/src/routes/webhook.ts`

## Coverage

**Requirements:** None enforced — no coverage thresholds configured.

**View Coverage:**
```bash
pnpm --filter karaoke-reader exec vitest run --coverage
pnpm --filter @meinungeheuer/tablet exec vitest run --coverage
```

---

*Testing analysis: 2026-03-24*
