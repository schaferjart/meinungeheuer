# MeinUngeheuer Testing Guide

## Test Framework: Vitest

All projects use **Vitest** for unit testing. Configuration is minimal (relying on defaults).

**Files:**
- `apps/tablet/package.json` — `"test": "vitest run"`
- `apps/printer-bridge/package.json` — `"test": "vitest run --passWithNoTests"`
- `apps/backend/package.json` — implicit (no tests yet)

**Installation:** Already included in `devDependencies` across all apps.

### Running Tests

```bash
# Run all tests (all apps)
pnpm test

# Watch mode (tablet only)
pnpm --filter @meinungeheuer/tablet exec vitest src/hooks/useInstallationMachine.test.ts

# Single test file
pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts
```

---

## Test File Locations

Tests are **co-located** with source files using the `.test.ts` suffix.

```
apps/tablet/src/
├── hooks/
│   ├── useInstallationMachine.ts          ← source
│   ├── useInstallationMachine.test.ts     ← test (co-located)
│   ├── useTextToSpeechWithTimestamps.ts   ← source
│   └── useTextToSpeechWithTimestamps.test.ts  ← test (co-located)
├── lib/
│   ├── api.ts
│   ├── supabase.ts
│   └── (no tests yet)
└── components/
    └── (components typically tested indirectly)

apps/printer-bridge/src/
├── layout.ts                 ← source
├── layout.test.ts            ← test (co-located)
├── printer.ts                ← source (no test file yet)
└── (others)
```

**Pattern:** For every testable module, create a `.test.ts` file in the same directory.

---

## Test Patterns & Examples

### 1. Pure Function Testing (Reducer)

Test pure reducer logic without React. Extract the reducer to a testable function, inline it in the test:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useInstallationMachine.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { InstallationState, InstallationAction } from './useInstallationMachine';
import type { Definition } from '@meinungeheuer/shared';
import { DEFAULT_MODE, DEFAULT_TERM } from '@meinungeheuer/shared';

const initialState: InstallationState = {
  screen: 'sleep',
  mode: DEFAULT_MODE,
  term: DEFAULT_TERM,
  contextText: null,
  parentSessionId: null,
  sessionId: null,
  definition: null,
  conversationId: null,
  language: 'de',
};

function reducer(state: InstallationState, action: InstallationAction): InstallationState {
  switch (action.type) {
    case 'WAKE':
      if (state.screen !== 'sleep') return state;
      return { ...state, screen: 'welcome' };
    // ... rest of reducer logic
    default:
      return state;
  }
}

describe('useInstallationMachine reducer', () => {
  it('WAKE transitions sleep → welcome', () => {
    const next = reducer(initialState, { type: 'WAKE' });
    expect(next.screen).toBe('welcome');
  });

  it('other actions are no-ops in sleep', () => {
    const actions: InstallationAction[] = [
      { type: 'TIMER_3S' },
      { type: 'READY' },
      { type: 'TIMER_2S' },
    ];
    for (const action of actions) {
      const next = reducer(initialState, action);
      expect(next.screen).toBe('sleep');
    }
  });
});
```

**Pattern:**
- Import `describe`, `it`, `expect` from `vitest`
- Define helper functions if needed (`makeDefinition`, `advance`)
- Test state transitions with explicit assertions
- Guard conditions tested separately

### 2. State Guard Testing

Ensure invalid transitions are no-ops:

```typescript
describe('State guards prevent invalid transitions', () => {
  it('DEFINITION_RECEIVED is ignored outside conversation', () => {
    const def = makeDefinition();
    const inSleep = reducer(initialState, { type: 'DEFINITION_RECEIVED', definition: def });
    expect(inSleep.screen).toBe('sleep');
    expect(inSleep.definition).toBeNull();
  });

  it('FACE_LOST is ignored outside farewell', () => {
    const inConversation: InstallationState = { ...initialState, screen: 'conversation' };
    const next = reducer(inConversation, { type: 'FACE_LOST' });
    expect(next.screen).toBe('conversation');
  });
});
```

### 3. Full Flow Testing

Test a complete user journey by chaining actions:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useInstallationMachine.test.ts`

```typescript
function advance(state: InstallationState, ...actions: InstallationAction[]): InstallationState {
  return actions.reduce((s, a) => reducer(s, a), state);
}

describe('Full Mode A (text_term) flow', () => {
  it('traverses all 9 states', () => {
    const def = makeDefinition();
    const final = advance(
      { ...initialState, mode: 'text_term', contextText: 'Some text' },
      { type: 'WAKE' },                                    // → welcome
      { type: 'TIMER_3S' },                                // → text_display
      { type: 'READY' },                                   // → term_prompt
      { type: 'TIMER_2S' },                                // → conversation
      { type: 'DEFINITION_RECEIVED', definition: def },   // → synthesizing
      { type: 'DEFINITION_READY' },                        // → definition
      { type: 'TIMER_10S' },                               // → printing
      { type: 'PRINT_DONE' },                              // → farewell
      { type: 'TIMER_15S' },                               // → sleep
    );
    expect(final.screen).toBe('sleep');
    expect(final.definition).toBeNull();
  });
});
```

### 4. Utility Function Testing

Test pure utility functions with realistic inputs:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildWordTimestamps, splitTextIntoChunks } from './useTextToSpeechWithTimestamps';

function mockAlignment(text: string, intervalSeconds: number = 0.05) {
  const characters = text.split('');
  const characterStartTimes: number[] = [];
  const characterEndTimes: number[] = [];

  for (let i = 0; i < characters.length; i++) {
    characterStartTimes.push(i * intervalSeconds);
    characterEndTimes.push((i + 1) * intervalSeconds);
  }

  return {
    characters,
    character_start_times_seconds: characterStartTimes,
    character_end_times_seconds: characterEndTimes,
  };
}

describe('buildWordTimestamps', () => {
  it('splits basic English text into word timestamps', () => {
    const text = 'hello world';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(2);
    expect(words[0]?.word).toBe('hello');
    expect(words[0]?.startTime).toBeCloseTo(0.0);
    expect(words[0]?.endTime).toBeCloseTo(0.25);
  });

  it('handles German text with umlauts', () => {
    const text = 'uber das Ungeheuer';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(3);
    expect(words[0]?.word).toBe('uber');
  });

  it('word start times are strictly before end times', () => {
    const text = 'Vielmehr sollst Du es ihm selber allererst erzahlen.';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    for (const word of words) {
      expect(word.endTime).toBeGreaterThan(word.startTime);
    }
  });
});

describe('splitTextIntoChunks', () => {
  it('returns single chunk for short text', () => {
    const text = 'This is a short sentence.';
    const chunks = splitTextIntoChunks(text, 200);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits long text at sentence boundaries', () => {
    const sentences: string[] = [];
    for (let s = 0; s < 10; s++) {
      const sentenceWords = Array.from({ length: 25 }, (_, i) => `word${s}_${i}`);
      sentences.push(sentenceWords.join(' ') + '.');
    }
    const text = sentences.join(' ');

    const chunks = splitTextIntoChunks(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(4);

    for (const chunk of chunks) {
      expect(chunk.trimEnd().endsWith('.')).toBe(true);
    }
  });
});
```

**Pattern:**
- Helper functions (`mockAlignment`) create realistic test fixtures
- Test single concerns (`splits`, `handles`, `respects`, etc.)
- Use `toBeCloseTo()` for floating-point comparisons
- Use property matchers: `toHaveLength()`, `toBeGreaterThan()`, etc.

### 5. Layout/Formatting Testing

Test ESC/POS card formatting with fixtures and assertions on output:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/printer-bridge/src/layout.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { wordWrap, center, formatCard, formatCardForPrinter } from './layout.js';
import type { PrintPayload } from '@meinungeheuer/shared';
import type { PrinterConfig } from './config.js';

const BASE_CONFIG: PrinterConfig = {
  connection: 'console',
  maxWidthChars: 48,
  maxWidthMm: 72,
  charset: 'UTF-8',
  autoCut: true,
};

const SAMPLE_PAYLOAD: PrintPayload = {
  term: 'VOGEL',
  definition_text: 'Ein Vogel ist ein glücklicher Zufall, der gelernt hat, der Schwerkraft zu widersprechen.',
  citations: [
    '...alles was fliegt, weigert sich im Grunde zu bleiben',
    '...wie ein Gedanke, der entkam, bevor man ihn aufschreiben konnte',
  ],
  language: 'de',
  session_number: 47,
  chain_ref: null,
  timestamp: '2026-02-25T14:32:00+01:00',
};

describe('wordWrap', () => {
  it('does not wrap short text', () => {
    expect(wordWrap('Hello world', 48)).toEqual(['Hello world']);
  });

  it('wraps at word boundary', () => {
    const result = wordWrap('one two three four five', 12);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(12);
    }
    expect(result.join(' ')).toBe('one two three four five');
  });

  it('handles a single word longer than maxWidth', () => {
    const result = wordWrap('Donaudampfschifffahrtsgesellschaft', 10);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('formatCard', () => {
  it('returns an array of strings', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('no line exceeds maxWidthChars', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(BASE_CONFIG.maxWidthChars);
    }
  });

  it('contains the term in upper-case', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    const termLine = lines.find((l) => l.includes('VOGEL'));
    expect(termLine).toBeDefined();
  });

  it('uses transliteration when charset is not UTF-8', () => {
    const asciiConfig: PrinterConfig = { ...BASE_CONFIG, charset: 'PC850' };
    const lines = formatCard(SAMPLE_PAYLOAD, asciiConfig);
    const combined = lines.join(' ');
    expect(combined).toContain('gluecklicher');
    expect(combined).not.toContain('ü');
  });
});

describe('formatCardForPrinter', () => {
  it('returns a commands array', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });

  it('term command has bold=true and doubleHeight=true', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    const termCmd = commands.find((c) => c.type === 'text' && c.text === 'VOGEL');
    expect(termCmd).toBeDefined();
    expect(termCmd?.bold).toBe(true);
    expect(termCmd?.doubleHeight).toBe(true);
  });

  it('cut command is present when autoCut=true', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    const cutCmd = commands.find((c) => c.type === 'cut');
    expect(cutCmd).toBeDefined();
  });

  it('no cut command when autoCut=false', () => {
    const cfg: PrinterConfig = { ...BASE_CONFIG, autoCut: false };
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, cfg);
    const cutCmd = commands.find((c) => c.type === 'cut');
    expect(cutCmd).toBeUndefined();
  });
});
```

**Pattern:**
- Define fixtures as constants (BASE_CONFIG, SAMPLE_PAYLOAD)
- Test output properties: length, inclusion, format, structure
- Use `.find()` to locate specific commands by criteria
- Test both positive cases (feature present) and negative cases (feature absent)

---

## Mocking Strategies

### 1. Test Fixtures & Helpers

Create reusable helpers for building test objects:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useInstallationMachine.test.ts`

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
```

**Pattern:** Helper factory functions with optional overrides. No mocking library needed for simple objects.

### 2. Mock Alignment Data

For TTS tests, mock the ElevenLabs alignment response:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts`

```typescript
function mockAlignment(text: string, intervalSeconds: number = 0.05) {
  const characters = text.split('');
  const characterStartTimes: number[] = [];
  const characterEndTimes: number[] = [];

  for (let i = 0; i < characters.length; i++) {
    characterStartTimes.push(i * intervalSeconds);
    characterEndTimes.push((i + 1) * intervalSeconds);
  }

  return {
    characters,
    character_start_times_seconds: characterStartTimes,
    character_end_times_seconds: characterEndTimes,
  };
}
```

**Pattern:** Simple deterministic mock functions. No need for `vi.mock()` if the function accepts the data as a parameter.

### 3. No API Mocking in Unit Tests

Unit tests focus on pure functions. Hooks that call APIs (ElevenLabs, Supabase) are **integration-tested separately** or **tested indirectly** via E2E tests. Current tests avoid mocking the SDK itself.

**Reason:** The SDK behavior is opaque and hard to mock accurately. Better to test reducer logic separately, then test the full flow with real API calls in a staging environment.

---

## Coverage

No explicit coverage targets enforced. Focus on:

1. **State machine logic** → reducer tests (full coverage)
2. **Utility functions** → pure function tests (high coverage)
3. **Layout/formatting** → edge-case tests (output validation)
4. **API calls & UI interactions** → integration/E2E tests (manual testing, not unit tests)

Current tests achieve ~90%+ coverage on tested modules (`useInstallationMachine`, `useTextToSpeechWithTimestamps`, `layout.ts`).

---

## Test Data & Fixtures

### Shared Test Constants

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useInstallationMachine.test.ts`

```typescript
const initialState: InstallationState = {
  screen: 'sleep',
  mode: DEFAULT_MODE,
  term: DEFAULT_TERM,
  contextText: null,
  parentSessionId: null,
  sessionId: null,
  definition: null,
  conversationId: null,
  language: 'de',
};
```

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/printer-bridge/src/layout.test.ts`

```typescript
const BASE_CONFIG: PrinterConfig = {
  connection: 'console',
  maxWidthChars: 48,
  maxWidthMm: 72,
  charset: 'UTF-8',
  autoCut: true,
};

const SAMPLE_PAYLOAD: PrintPayload = {
  term: 'VOGEL',
  definition_text: 'Ein Vogel ist ein glücklicher Zufall, der gelernt hat, der Schwerkraft zu widersprechen.',
  citations: [...],
  language: 'de',
  session_number: 47,
  chain_ref: null,
  timestamp: '2026-02-25T14:32:00+01:00',
};
```

**Pattern:** Fixtures defined at module level, variants created by spreading (`{ ...BASE_CONFIG, charset: 'PC850' }`).

---

## Assertions & Matchers

### Common Patterns

```typescript
// Identity & Equality
expect(value).toBe(expected);                    // ===
expect(value).toEqual(expected);                 // deep equality
expect(value).toStrictEqual(expected);           // strict deep equality

// Arrays
expect(array).toHaveLength(n);
expect(array).toContain(element);
expect(array).toEqual([a, b, c]);

// Objects
expect(obj).toHaveProperty('key');
expect(obj).toMatchObject({ key: 'value' });

// Numbers
expect(num).toBeCloseTo(expected, decimals);     // floating-point
expect(num).toBeGreaterThan(min);
expect(num).toBeLessThanOrEqual(max);

// Strings
expect(str).toMatch(/regex/);
expect(str).toContain('substring');
expect(str).toStartWith('prefix');

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Collections
expect(arr).toEqual(expected);
for (const item of arr) {
  expect(item).toBeSomething();
}
```

---

## Best Practices Checklist

- ✓ Tests co-located with source (`foo.ts` + `foo.test.ts`)
- ✓ Pure functions tested directly (reducers, utilities)
- ✓ State transitions guarded (invalid transitions are no-ops)
- ✓ Full flows tested end-to-end (chain of actions)
- ✓ Edge cases covered (empty input, boundary values, long text)
- ✓ Fixtures created with factory helpers and overrides
- ✓ No mocking of third-party SDKs in unit tests
- ✓ Console logging and side effects separated from logic
- ✓ Assertions specific (not just `toBeTruthy()`)
- ✓ Test names describe the scenario (`it('WAKE transitions sleep → welcome')`)
- ✓ Describe blocks organize by feature or state
