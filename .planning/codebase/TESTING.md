# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:**
- Vitest 3.0.5
- Config: Per-package or workspace-level via Vitest config files
- Environment: `happy-dom` (lightweight DOM implementation for faster tests)

**Assertion Library:**
- Vitest built-in assertions (compatible with Jest API)
- Methods: `expect().toBe()`, `expect().toEqual()`, `expect().toHaveBeenCalled()`, etc.

**Test Utilities:**
- React Testing Library 16.3.2 — `renderHook()` for hook testing
- `@testing-library/dom` — DOM utilities
- Vitest spies and mocks: `vi.fn()`, `vi.spyOn()`, `vi.stubGlobal()`, `vi.useFakeTimers()`

**Run Commands:**
```bash
pnpm test                             # Run all tests
pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts  # Single file
pnpm --filter @meinungeheuer/tablet exec vitest src/hooks/useInstallationMachine.test.ts      # Watch mode
```

## Test File Organization

**Location:**
- Co-located with source: `src/hooks/useInstallationMachine.ts` → `src/hooks/useInstallationMachine.test.ts`
- Same directory as implementation
- Not in separate `__tests__` directory

**Naming:**
- Test files: `{name}.test.ts` or `{name}.test.tsx`
- Glob pattern: `**/*.test.ts` or `**/*.test.tsx`

**Structure:**
```
apps/tablet/src/hooks/
├── useInstallationMachine.ts
├── useInstallationMachine.test.ts
├── useConversation.ts
└── useConversation.test.ts

packages/karaoke-reader/src/
├── hooks/
│   ├── useKaraokeReader.ts
│   └── useKaraokeReader.test.ts
├── utils/
│   ├── buildWordTimestamps.ts
│   └── buildWordTimestamps.test.ts
├── test-utils/
│   ├── mock-audio.ts
│   └── setup.ts
└── cache.test.ts
```

## Test Structure

**Suite Organization:**

Using Vitest's `describe()` and `it()`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useInstallationMachine reducer', () => {
  describe('SLEEP state', () => {
    it('starts in sleep state', () => {
      expect(initialState.screen).toBe('sleep');
    });

    it('WAKE transitions sleep → welcome', () => {
      const next = reducer(initialState, { type: 'WAKE' });
      expect(next.screen).toBe('welcome');
    });
  });

  describe('Configuration actions', () => {
    it('SET_CONFIG updates mode, term, contextText', () => {
      // ...
    });
  });
});
```

**Patterns:**

**Setup/Teardown:**
```typescript
beforeEach(() => {
  vi.useFakeTimers();
  // or other setup
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
```

**Describe blocks organize by:**
- State machine states (e.g., `describe('SLEEP state')`)
- Feature areas (e.g., `describe('Configuration actions')`)
- Component or function (e.g., `describe('buildWordTimestamps')`)

**Test names are descriptive:**
- Describe what is being tested and the expected outcome
- Format: "does X when given Y" or "transitions from X to Y"
- Examples:
  - `'starts in sleep state'`
  - `'WAKE transitions sleep → welcome'`
  - `'TIMER_3S with term_only stages → term_prompt'`

## Mocking

**Framework:** Vitest `vi` module

**Mock Types:**

**Function Mocks:**
```typescript
const onComplete = vi.fn();
const mockAudio = new MockAudio() as unknown as HTMLAudioElement;

// Track calls
expect(onComplete).toHaveBeenCalledTimes(1);
expect(onComplete).toHaveBeenCalledWith(expect.any(Error));
```

**Spy Mocks:**
```typescript
const pauseSpy = vi.spyOn(mockAudio, 'pause');
// ... trigger pause
expect(pauseSpy).toHaveBeenCalled();
pauseSpy.mockRestore();
```

**Global Stubs:**
```typescript
const pngBlob = new Blob([...], { type: 'image/png' });
const mockFetch = vi.fn()
  .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(pngBlob) })
  .mockRejectedValueOnce(new Error('ECONNREFUSED'));
vi.stubGlobal('fetch', mockFetch);
```

**Patterns:**
- Mocks track function calls and return values
- `.mockResolvedValueOnce()` for sequential async returns
- `.mockRejectedValueOnce()` for error simulation
- `.mockImplementation()` for custom behavior
- Call `vi.restoreAllMocks()` in `afterEach()` to clean up

**What to Mock:**
- External APIs (fetch, ElevenLabs SDK)
- Audio events and methods (play, pause, currentTime)
- Timers (vi.useFakeTimers() for testing delays)
- HTMLMediaElement and browser APIs not fully implemented in happy-dom

**What NOT to Mock:**
- Pure utility functions (test with real data)
- React hooks that are the subject of the test
- Zod validation (use real schemas)
- State machine reducer logic (test pure function directly)
- Test helper functions (e.g., `makeDefinition()`, `mockAlignment()`)

## Fixtures and Factories

**Test Data:**

Fixtures created as functions within test files:

```typescript
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

function makeTimestamps(): WordTimestamp[] {
  return [
    { word: 'Hello', startTime: 0.0, endTime: 0.5, index: 0 },
    { word: 'world', startTime: 0.6, endTime: 1.0, index: 1 },
  ];
}

function mockAlignment(text: string, intervalSeconds: number = 0.05) {
  // Returns { characters, character_start_times_seconds, character_end_times_seconds }
}
```

**Location:**
- Inline in test file above test suite (`describe()` block)
- Not in separate fixture files
- Use `makeX()` naming for factories

**Usage:**
- Overrides allow customization: `makeDefinition({ term: 'SPRECHEN' })`
- Spread default values: `{ ...defaultState, screen: 'conversation' }`

## Custom Test Utilities

**MockAudio** (`packages/karaoke-reader/src/test-utils/mock-audio.ts`):

Extends `EventTarget` to provide controllable audio simulation for tests:

```typescript
export class MockAudio extends EventTarget {
  currentTime = 0;
  duration = NaN;
  volume = 1;
  paused = true;
  readyState = 0;
  src = '';

  play(): Promise<void> { ... }
  pause(): void { ... }
  simulateCanPlayThrough(duration?: number): void { ... }
  simulateEnded(): void { ... }
  simulateError(): void { ... }
  simulateTimeUpdate(time: number): void { ... }
}
```

**Usage in Tests:**
```typescript
const audio = new MockAudio() as unknown as HTMLAudioElement;
const mockAudio = audio as unknown as MockAudio;

const { result } = renderHook(() =>
  useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio })
);

act(() => {
  mockAudio.simulateCanPlayThrough(5);
});

expect(result.current.status).toBe('ready');
```

**Setup File** (`packages/karaoke-reader/src/test-utils/setup.ts`):

Vitest runs setup file before tests:

```typescript
// In vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-utils/setup.ts'],
  },
});
```

## Test Types

**Unit Tests:**
- Scope: Single function or pure reducer
- Approach: Test with multiple input variations
- Example: `apps/tablet/src/hooks/useInstallationMachine.test.ts` — tests pure reducer function directly
- Example: `packages/karaoke-reader/src/utils/buildWordTimestamps.test.ts` — tests utility function with text alignment data

**Hook Tests:**
- Scope: React custom hooks in isolation
- Approach: Use `renderHook()` from @testing-library/react, wrap state changes in `act()`
- Example: `apps/tablet/src/hooks/useConversation.test.ts` — tests role mapping function
- Example: `packages/karaoke-reader/src/hooks/useKaraokeReader.test.ts` — tests audio state machine hook

**Integration Tests:**
- Scope: Multiple components or layers working together
- Used for: API contracts, printer bridge with render API + POS server, state flow sequences
- Example: `apps/printer-bridge/src/printer.test.ts` — tests `renderAndPrint()` calling both render-api and POS server in sequence

**E2E Tests:**
- Not used in codebase
- Manual testing via kiosk mode or admin dashboard

## Common Patterns

**Async Testing:**

Use `act()` wrapper for state updates and `async/await` for Promises:

```typescript
await act(async () => {
  result.current.play();
});

expect(result.current.status).toBe('playing');
```

**Error Testing:**

Test error handling with thrown errors or rejected promises:

```typescript
it('transitions to error on audio error event', () => {
  const audio = new MockAudio() as unknown as HTMLAudioElement;
  const mockAudio = audio as unknown as MockAudio;

  const { result } = renderHook(() =>
    useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
  );

  act(() => {
    mockAudio.simulateError();
  });

  expect(result.current.status).toBe('error');
  expect(result.current.error).toBeInstanceOf(Error);
});
```

**State Machine Transitions:**

Test reducer with sequence of actions using helper function:

```typescript
function advance(state: InstallationState, ...actions: InstallationAction[]): InstallationState {
  return actions.reduce((s, a) => reducer(s, a), state);
}

it('traverses states (text_term skips term_prompt)', () => {
  const def = makeDefinition();
  const final = advance(
    { ...initialState, mode: 'text_term', contextText: 'Some text' },
    { type: 'WAKE' },                                          // → welcome
    { type: 'TIMER_3S' },                                      // → text_display
    { type: 'READY' },                                         // → conversation
    { type: 'DEFINITION_RECEIVED', definition: def },         // → synthesizing
    { type: 'DEFINITION_READY' },                              // → definition
    { type: 'TIMER_10S' },                                     // → farewell
    { type: 'TIMER_15S' },                                     // → sleep
  );
  expect(final.screen).toBe('sleep');
});
```

**Testing Zod Validation:**

```typescript
import { PrintPayloadSchema, PortraitPrintPayloadSchema } from '@meinungeheuer/shared';

it('returns a valid PrintPayload', () => {
  const payload = buildTestPayload();
  const result = PrintPayloadSchema.safeParse(payload);
  expect(result.success).toBe(true);
});
```

## Coverage

**Requirements:** No enforcement detected (no coverage thresholds configured)

**View Coverage:**
```bash
pnpm test -- --coverage  # (if configured)
```

**Current Coverage:**
- Core logic heavily tested: state machine, utility functions, hooks
- Mock implementations allow testing without real ElevenLabs/Supabase
- Integration tests validate API contracts
- No coverage minimum enforced

---

*Testing analysis: 2026-03-24*
