# Testing Patterns

**Analysis Date:** 2026-03-08

## Test Framework

**Runner:**
- Vitest 3.x
- Each workspace package has its own `test` script
- Config: `packages/karaoke-reader/vitest.config.ts` (only explicit config file)
- Other packages use Vitest defaults (no config file)

**Assertion Library:**
- Vitest built-in `expect` (Jest-compatible)
- `@testing-library/jest-dom/vitest` extended matchers in karaoke-reader (via setup file)

**Run Commands:**
```bash
pnpm test                    # Run all tests across workspace
pnpm -r test                 # Same (workspace recursive)

# Single package
pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts
pnpm --filter karaoke-reader exec vitest run

# Watch mode
pnpm --filter @meinungeheuer/tablet exec vitest src/hooks/useInstallationMachine.test.ts
pnpm --filter karaoke-reader exec vitest

# Packages with --passWithNoTests (no tests yet)
# @meinungeheuer/backend, @meinungeheuer/printer-bridge, @meinungeheuer/shared
```

## Test File Organization

**Location:**
- Co-located with source files (test next to implementation)
- `foo.ts` -> `foo.test.ts`, `Foo.tsx` -> `Foo.test.tsx`

**Naming:**
- `{module}.test.ts` for pure logic
- `{Component}.test.tsx` for React components and hooks

**Structure by package:**
```
packages/karaoke-reader/src/
  adapters/elevenlabs/index.test.ts    # API adapter + hook tests
  cache.test.ts                        # Cache implementations
  components/KaraokeReader.test.tsx     # Component rendering tests
  hooks/useAudioSync.test.ts           # Audio sync hook + pure fn
  hooks/useAutoScroll.test.ts          # Auto-scroll hook
  hooks/useKaraokeReader.test.ts       # Main hook orchestration
  utils/buildWordTimestamps.test.ts    # Timestamp calculation
  utils/computeCacheKey.test.ts        # Cache key hashing
  utils/markdown.test.ts              # Markdown parsing
  utils/splitTextIntoChunks.test.ts   # Text chunking
  test-utils/setup.ts                 # Global test setup
  test-utils/mock-audio.ts            # MockAudio test double

apps/tablet/src/
  hooks/useInstallationMachine.test.ts # State machine reducer
```

## Test Structure

**Suite Organization:**
```typescript
// Pattern from packages/karaoke-reader/src/hooks/useAudioSync.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Test data (factory functions at top)
// ============================================================

function makeTimestamps(): WordTimestamp[] {
  return [
    { word: 'Hello', startTime: 0.0, endTime: 0.5, index: 0 },
    { word: 'world', startTime: 0.6, endTime: 1.0, index: 1 },
  ];
}

// ============================================================
// Unit tests: pure function
// ============================================================

describe('findActiveWordIndex', () => {
  it('returns -1 for empty timestamps', () => {
    expect(findActiveWordIndex([], 1.0)).toBe(-1);
  });
});

// ============================================================
// Hook integration tests
// ============================================================

describe('useAudioSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns -1 initially when no audio provided', () => {
    const { result } = renderHook(() =>
      useAudioSync({ audio: null, timestamps: makeTimestamps(), enabled: false }),
    );
    expect(result.current.activeWordIndex).toBe(-1);
  });
});
```

**Patterns:**
- **Setup/Teardown:** `beforeEach` for fake timers and mock resets; `afterEach` for real timers and `vi.restoreAllMocks()`
- **Numbered test comments:** Tests in karaoke-reader use numbered section comments referencing spec IDs (e.g., `// 1. Renders word spans (COMP-01)`)
- **Descriptive test names:** Include the expected transition or behavior: `'WAKE transitions sleep -> welcome'`, `'transitions from playing to paused on pause()'`

## Test Data Factories

**Pattern: `make*` helper functions at the top of test files:**

```typescript
// From apps/tablet/src/hooks/useInstallationMachine.test.ts
function makeDefinition(overrides: Partial<Definition> = {}): Definition {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    session_id: '00000000-0000-0000-0000-000000000002',
    term: 'BIRD',
    definition_text: 'A bird is a happy accident.',
    citations: ['everything that flies is basically refusing to stay'],
    language: 'en',
    chain_depth: 0,
    created_at: '2026-02-24T14:00:00+00:00',
    embedding: null,
    ...overrides,
  };
}
```

```typescript
// From packages/karaoke-reader/src/cache.test.ts
const makeSample = (id = 1): TTSCacheValue => ({
  audioBase64Parts: [`base64-part-${id}`],
  wordTimestamps: [{ word: `word${id}`, startTime: 0, endTime: 1, index: 0 }],
});
```

**Helper for state machine traversal:**
```typescript
// From apps/tablet/src/hooks/useInstallationMachine.test.ts
function advance(state: InstallationState, ...actions: InstallationAction[]): InstallationState {
  return actions.reduce((s, a) => reducer(s, a), state);
}
```

**Location:**
- Defined at the top of each test file, not shared across files
- No global fixtures directory

## Vitest Configuration

**karaoke-reader** (`packages/karaoke-reader/vitest.config.ts`):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-utils/setup.ts'],
  },
});
```

**Setup file** (`packages/karaoke-reader/src/test-utils/setup.ts`):
```typescript
import '@testing-library/jest-dom/vitest';
```

**Other packages:** No vitest.config file -- use Vitest defaults (Node environment, no globals).

## Mocking

**Framework:** Vitest built-in (`vi.fn()`, `vi.spyOn()`, `vi.useFakeTimers()`)

**Audio Mocking (custom test double):**
```typescript
// From packages/karaoke-reader/src/test-utils/mock-audio.ts
export class MockAudio extends EventTarget {
  currentTime = 0;
  duration = NaN;
  volume = 1;
  paused = true;
  readyState = 0;
  src = '';
  preload: '' | 'none' | 'metadata' | 'auto' = '';

  play(): Promise<void> {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  // Simulation methods for test control
  simulateCanPlayThrough(duration = 10): void { /* ... */ }
  simulateEnded(): void { /* ... */ }
  simulateError(): void { /* ... */ }
  simulateTimeUpdate(time: number): void { /* ... */ }
}
```

Usage pattern -- cast through `unknown`:
```typescript
const mock = new MockAudio();
const audio = mock as unknown as HTMLAudioElement;
// Control via mock, pass audio to components
```

**Fetch Mocking:**
```typescript
// From packages/karaoke-reader/src/adapters/elevenlabs/index.test.ts
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Usage:
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve(makeApiResponse(text)),
});
```

**Spy Pattern:**
```typescript
// From packages/karaoke-reader/src/hooks/useKaraokeReader.test.ts
const pauseSpy = vi.spyOn(mockAudio, 'pause');
// ... test actions ...
expect(pauseSpy).toHaveBeenCalled();
pauseSpy.mockRestore();
```

**DOM Mocking:**
```typescript
// From packages/karaoke-reader/src/hooks/useAutoScroll.test.ts
function createMockContainer(height = 600) {
  const el = document.createElement('div');
  el.scrollBy = vi.fn();
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: 0, bottom: height, left: 0, right: 400,
    width: 400, height, x: 0, y: 0, toJSON: () => ({}),
  });
  return el;
}
```

**Fake Cache Mock:**
```typescript
// From packages/karaoke-reader/src/adapters/elevenlabs/index.test.ts
function makeMockCache(stored?: TTSCacheValue | null): CacheAdapter & {
  getCalls: string[];
  setCalls: Array<{ key: string; value: TTSCacheValue }>;
} {
  const getCalls: string[] = [];
  const setCalls: Array<{ key: string; value: TTSCacheValue }> = [];
  return {
    getCalls, setCalls,
    async get(key) { getCalls.push(key); return stored ?? null; },
    async set(key, value) { setCalls.push({ key, value }); },
  };
}
```

**What to Mock:**
- Browser APIs not available in happy-dom/Node: `HTMLAudioElement`, `fetch`, `URL.createObjectURL`, `URL.revokeObjectURL`
- DOM geometry: `getBoundingClientRect`, `scrollBy`
- Time: `vi.useFakeTimers()` for `requestAnimationFrame`, `setTimeout`, `setInterval`
- Storage: `vi.spyOn(Storage.prototype, 'getItem')` for localStorage error simulation

**What NOT to Mock:**
- The reducer/state machine logic (test directly as pure functions)
- Zod schemas (test with real validation)
- Utility functions (test with real inputs)
- React hooks (use `renderHook` from testing-library)

## Coverage

**Requirements:** None enforced. No coverage thresholds configured.

**View Coverage:**
```bash
pnpm --filter karaoke-reader exec vitest run --coverage
```

## Test Types

**Unit Tests:**
- Pure function tests: `buildWordTimestamps`, `computeCacheKey`, `splitTextIntoChunks`, `stripMarkdownForTTS`, `findActiveWordIndex`
- Reducer tests: `useInstallationMachine` reducer tested as a pure function without React rendering
- Cache implementation tests: `createMemoryCache`, `createLocalStorageCache`
- Test the function directly with constructed inputs, assert on outputs

**Hook Integration Tests:**
- `useKaraokeReader`: status transitions, play/pause/toggle, volume, cleanup
- `useAudioSync`: activeWordIndex tracking via rAF polling with fake timers
- `useAutoScroll`: scroll triggering based on word position relative to container
- `useElevenLabsTTS`: fetch lifecycle, cache integration, abort handling
- Use `renderHook` + `act` from `@testing-library/react`

**Component Tests:**
- `KaraokeReader.test.tsx`: Render with testing-library, query DOM for data attributes and CSS classes
- Verify rendering (word spans, data attributes), interaction (click/keyboard), and state changes (via mock audio events)

**E2E Tests:**
- Not present. No Playwright, Cypress, or similar framework.

**Backend/Printer Tests:**
- Not present. Both use `--passWithNoTests` flag. Routes, webhooks, and printer logic are untested.

## Common Patterns

**Async Testing:**
```typescript
// From packages/karaoke-reader/src/hooks/useKaraokeReader.test.ts
it('transitions from ready to playing on play()', async () => {
  const { result } = renderHook(() =>
    useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
  );

  act(() => {
    mockAudio.simulateCanPlayThrough(5);
  });

  await act(async () => {
    result.current.play();
  });

  expect(result.current.status).toBe('playing');
});
```

**Fake Timers + rAF Testing:**
```typescript
// From packages/karaoke-reader/src/hooks/useAudioSync.test.ts
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('updates activeWordIndex when audio.currentTime advances', () => {
  // ... setup hook ...
  mockAudio.currentTime = 0.3;
  act(() => {
    vi.advanceTimersByTime(16); // One rAF tick (~16ms)
  });
  expect(result.current.activeWordIndex).toBe(0);
});
```

**Error Testing:**
```typescript
// From packages/karaoke-reader/src/adapters/elevenlabs/index.test.ts
it('API error response -- throws descriptive error', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 400,
    text: () => Promise.resolve('Invalid voice ID'),
  });

  await expect(
    fetchElevenLabsTTS(makeBaseOptions()),
  ).rejects.toThrow('ElevenLabs TTS API error (400): Invalid voice ID');
});
```

**Error Resilience Testing (swallowed errors):**
```typescript
// From packages/karaoke-reader/src/adapters/elevenlabs/index.test.ts
it('cache get error swallowed -- fetch still succeeds', async () => {
  const cache: CacheAdapter = {
    async get() { throw new Error('Cache read failure'); },
    async set() {},
  };

  const result = await fetchElevenLabsTTS(makeBaseOptions({ text, cache }));
  expect(result.timestamps).toHaveLength(2);
});
```

**Cleanup/Unmount Testing:**
```typescript
// From packages/karaoke-reader/src/hooks/useKaraokeReader.test.ts
it('pauses audio on unmount', async () => {
  const pauseSpy = vi.spyOn(mockAudio, 'pause');
  const { result, unmount } = renderHook(() =>
    useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
  );

  // ... start playback ...
  pauseSpy.mockClear();
  unmount();

  expect(pauseSpy).toHaveBeenCalled();
  pauseSpy.mockRestore();
});
```

**State Machine Full-Flow Testing:**
```typescript
// From apps/tablet/src/hooks/useInstallationMachine.test.ts
it('traverses all 9 states', () => {
  const def = makeDefinition();
  const final = advance(
    { ...initialState, mode: 'text_term', contextText: 'Some text' },
    { type: 'WAKE' },                                     // -> welcome
    { type: 'TIMER_3S' },                                 // -> text_display
    { type: 'READY' },                                    // -> term_prompt
    { type: 'TIMER_2S' },                                 // -> conversation
    { type: 'DEFINITION_RECEIVED', definition: def },     // -> synthesizing
    { type: 'DEFINITION_READY' },                         // -> definition
    { type: 'TIMER_10S' },                                // -> printing
    { type: 'PRINT_DONE' },                               // -> farewell
    { type: 'TIMER_15S' },                                // -> sleep
  );
  expect(final.screen).toBe('sleep');
  expect(final.definition).toBeNull();
});
```

**Guard Testing (invalid transitions are no-ops):**
```typescript
it('DEFINITION_RECEIVED is ignored outside conversation', () => {
  const def = makeDefinition();
  const inSleep = reducer(initialState, { type: 'DEFINITION_RECEIVED', definition: def });
  expect(inSleep.screen).toBe('sleep');
  expect(inSleep.definition).toBeNull();
});
```

**Invariant Testing:**
```typescript
// From packages/karaoke-reader/src/utils/markdown.test.ts
it('INVARIANT: globalIndex word order matches stripMarkdownForTTS word order', () => {
  const text = '# 2024-10-28, 2130h\n\nI ~~believe~~ think...';
  const stripped = stripMarkdownForTTS(text);
  const strippedWords = stripped.split(/\s+/).filter(Boolean);
  const parsed = parseMarkdownText(text);
  const parsedWords = parsed
    .flatMap(p => p.lines.flatMap(l => l.words))
    .sort((a, b) => a.globalIndex - b.globalIndex)
    .map(w => w.word);
  expect(parsedWords).toEqual(strippedWords);
});
```

## Test Gaps

**Untested areas:**
- `apps/backend/` -- zero tests. All route handlers, webhook processing, chain logic, and embedding generation are untested.
- `apps/printer-bridge/` -- zero tests. Job processing, Realtime subscription, and printCard are untested.
- `packages/shared/` -- zero tests. Zod schemas and createSupabaseClient are untested.
- `apps/tablet/src/hooks/useConversation.ts` -- ElevenLabs integration hook is untested.
- `apps/tablet/src/hooks/useFaceDetection.ts` -- MediaPipe integration hook is untested.
- `apps/tablet/src/App.tsx` -- Main app component and screen routing untested.
- `apps/tablet/src/components/` -- All screen components and shared components untested.
- `apps/tablet/src/lib/` -- API client, persist, systemPrompt, fullscreen utilities untested.

**Well-tested areas:**
- `packages/karaoke-reader/` -- comprehensive coverage: utils, hooks, components, adapters, cache (10 test files)
- `apps/tablet/src/hooks/useInstallationMachine.ts` -- state machine reducer thoroughly tested with all transitions, guards, and full flows

---

*Testing analysis: 2026-03-08*
