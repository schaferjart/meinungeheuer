# MeinUngeheuer Codebase Conventions

## TypeScript Style

### Strict Mode
All projects compile with `"strict": true` in `tsconfig.base.json`. This means:
- No implicit `any` types
- Null/undefined checking enforced (`"strictNullChecks": true`)
- No unused locals or parameters (`"noUnusedLocals": true`, `"noUnusedParameters": true`)
- Indexed access safety (`"noUncheckedIndexedAccess": true`)

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/tsconfig.base.json`

Example from `types.ts`:
```typescript
export const ModeSchema = z.enum(['text_term', 'term_only', 'chain']);
export type Mode = z.infer<typeof ModeSchema>;
```

All type definitions are explicitly typed. No `any` casts.

### ES2022 Target
- `"target": "ES2022"`
- `"module": "ESNext"`
- `"moduleResolution": "bundler"`

### Zod for Runtime Validation
All API boundaries validate with Zod schemas. Schemas are defined alongside type exports for DRY principle:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/packages/shared/src/types.ts`

```typescript
export const SessionSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  // ...
});
export type Session = z.infer<typeof SessionSchema>;

export const InsertSessionSchema = SessionSchema.omit({ id: true, created_at: true });
export type InsertSession = z.infer<typeof InsertSessionSchema>;
```

Pattern: Define **full schema** with all fields, then derive **insert schema** by omitting server-generated fields (id, created_at).

---

## Naming Conventions

### File Naming

- **Components:** PascalCase in `components/screens/`, e.g., `TextDisplayScreen.tsx`, `ConversationScreen.tsx`
- **Hooks:** camelCase starting with `use`, e.g., `useInstallationMachine.ts`, `useConversation.ts`
- **Utilities/Lib:** camelCase, e.g., `systemPrompt.ts`, `ttsCache.ts`, `api.ts`
- **Tests:** Same name as source + `.test.ts`, e.g., `useInstallationMachine.test.ts` ← lives next to `useInstallationMachine.ts`
- **Routes (Backend):** camelCase, e.g., `webhook.ts`, `session.ts`, `config.ts`
- **Services (Backend):** camelCase, e.g., `supabase.ts`, `embeddings.ts`, `chain.ts`

### Component Naming

Screen components follow the pattern: `{StateName}Screen.tsx`

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/components/screens/`

- `SleepScreen.tsx`
- `WelcomeScreen.tsx`
- `TextDisplayScreen.tsx`
- `TermPromptScreen.tsx`
- `ConversationScreen.tsx`
- `SynthesizingScreen.tsx`
- `DefinitionScreen.tsx`
- `PrintingScreen.tsx`
- `FarewellScreen.tsx`

### Type Naming

Database types map to table names in snake_case, but TypeScript types are PascalCase:
- Table: `sessions` → Type: `Session`
- Table: `print_queue` → Type: `PrintQueueRow`
- Table: `definitions` → Type: `Definition`

Union types use `|`:
```typescript
export type Role = 'visitor' | 'agent';
export type StateName = 'sleep' | 'welcome' | 'text_display' | /* ... */ 'farewell';
```

### Variable Naming

- State variables use camelCase: `sessionId`, `contextText`, `parentSessionId`
- Constants use UPPER_SNAKE_CASE: `DEFAULT_MODE`, `WAKE_THRESHOLD_MS`
- Private/internal helpers start with `_` (rarely used—prefer `function` scope)
- Refs in React: `...Ref` suffix, e.g., `wordSpansRef`, `containerRef`, `scrollResetTimerRef`

---

## Error Handling Patterns

### API Error Handling

Use Zod for parsing; throw on validation failure or network error:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/lib/api.ts`

```typescript
async function apiFetch<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json: unknown = await res.json();
  return schema.parse(json);  // Throws if schema mismatch
}
```

Pattern: Fetch → check HTTP status → parse JSON → validate with Zod → throw on any error.

### Backend Error Handling

Services never crash. All errors are caught, logged, and returned as JSON responses:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/backend/src/routes/webhook.ts`

```typescript
webhookRoutes.post('/definition', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = SaveDefinitionWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  // ... proceed with validated data
});
```

Pattern: Try/catch → Zod `.safeParse()` → return error JSON. No uncaught exceptions.

### Supabase Query Error Handling

Always check `.error` after `.select()`, `.insert()`, etc.:

```typescript
const { data: existingSession, error: sessionFetchError } = await supabase
  .from('sessions')
  .select('id, mode')
  .eq('elevenlabs_conversation_id', conversation_id)
  .maybeSingle();

if (sessionFetchError) {
  console.error('[webhook/definition] Session fetch error:', {
    message: sessionFetchError.message,
    details: sessionFetchError.details,
  });
  // Return error response or throw
  return c.json({ error: 'Database query failed' }, 500);
}
```

### Console Logging

Use prefixed log statements for debugging. Prefix format: `[module/function]`

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useConversation.ts`

```typescript
console.log('[MeinUngeheuer] Connected to ElevenLabs, conversationId:', conversationId);
console.log('[MeinUngeheuer] save_definition called:', result);
console.error('[MeinUngeheuer] ElevenLabs error:', message, context);
```

Pattern: All logs include a context prefix so you can trace which module/function emitted the message.

---

## Import Organization

### Order
1. External libraries (React, zod, etc.)
2. Absolute imports from shared packages (`@meinungeheuer/shared`, `@11labs/react`)
3. Relative imports (local modules, `.../hooks`, `.../lib`)
4. Side effects (styles, globals)

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/components/TextReader.tsx`

```typescript
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useTextToSpeechWithTimestamps,
  type TtsStatus,
} from '../hooks/useTextToSpeechWithTimestamps';
// (relative import of local hook)
```

### Type Imports

Use `type` keyword for imports of type-only symbols:

```typescript
import type { Mode, StateName, Definition } from '@meinungeheuer/shared';
import { DEFAULT_MODE, DEFAULT_TERM } from '@meinungeheuer/shared';
```

This allows better tree-shaking and makes intent clear.

### Workspace Imports

Use workspace protocol for shared package:

```typescript
import { z } from 'zod';
import type { Mode } from '@meinungeheuer/shared';
import { DEFAULT_MODE, DEFAULT_TERM } from '@meinungeheuer/shared';
```

**Note:** `@meinungeheuer/shared` is defined in `packages/shared/package.json` and imported via `@meinungeheuer/shared` alias across all apps.

---

## Component Patterns (React)

### Functional Components with Props Interface

All components are functional. Props are defined as a TypeScript interface:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/components/TextReader.tsx`

```typescript
export interface TextReaderProps {
  text: string;
  voiceId: string;
  apiKey: string;
  language: 'de' | 'en';
  onComplete: () => void;
}

export function TextReader({ text, voiceId, apiKey, language, onComplete }: TextReaderProps) {
  // Component body
}
```

### Hooks and State

Use `useReducer` for complex multi-screen state (state machines), `useState` for simple local state:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useInstallationMachine.ts`

```typescript
export function useInstallationMachine(overrideInitial?: Partial<InstallationState>) {
  const [state, dispatch] = useReducer(
    installationReducer,
    overrideInitial ? { ...initialState, ...overrideInitial } : initialState,
  );

  const wake = useCallback(() => dispatch({ type: 'WAKE' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, dispatch, wake, reset };
}
```

Pattern: Reducer defines all actions as a discriminated union, reducer function handles transitions, hook returns state + dispatch + convenience methods.

### useEffect Cleanup

Always return a cleanup function if allocating timers, subscriptions, or listeners:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/components/TextReader.tsx`

```typescript
useEffect(() => {
  return () => {
    clearTimeout(scrollResetTimerRef.current);
  };
}, []);
```

### useCallback Dependencies

Dependencies must be explicitly listed. Use refs to avoid unnecessary re-initialization of callbacks that depend on ElevenLabs SDK hooks:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useConversation.ts`

```typescript
const onDefinitionReceivedRef = useRef(onDefinitionReceived);
onDefinitionReceivedRef.current = onDefinitionReceived;

const startConversation = useCallback(async (): Promise<string> => {
  // ...
}, [agentId, mode, term, contextText, language, conversation]);
```

Pattern: If a callback changes frequently but you want to avoid re-initialization of a third-party hook, store in a ref and update it on every render.

### Sub-components

Smaller components nested in the same file are defined as functions at the bottom:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/components/TextReader.tsx`

```typescript
function LoadingDots() {
  return (
    <div className="flex gap-2 items-center">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-2 h-2 rounded-full bg-white/40" />
      ))}
    </div>
  );
}

function VolumeSlider({ volume, onVolumeChange }: { volume: number; onVolumeChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center py-2 volume-control">
      {/* ... */}
    </div>
  );
}
```

### CSS: Tailwind v4

Use Tailwind v4 classes. No CSS modules or styled-components:

```typescript
<div className="flex flex-col w-full h-full bg-black">
  {/* ... */}
</div>
```

For inline styles that need computed values:

```typescript
const baseStyle: React.CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
  lineHeight: '1.8',
  color: '#ffffff',
};

<div style={baseStyle}>Text</div>
```

For dynamic CSS (pseudo-elements, animations):

```typescript
<style>{`
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.4s ease-out forwards;
  }
`}</style>
```

---

## State Management Patterns

### useReducer for State Machines

Complex flows with multiple screens/states use a reducer with a discriminated union of actions:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/hooks/useInstallationMachine.ts`

```typescript
export type InstallationAction =
  | { type: 'WAKE' }
  | { type: 'TIMER_3S' }
  | { type: 'READY' }
  | { type: 'DEFINITION_RECEIVED'; definition: Definition }
  | { type: 'SET_CONFIG'; mode: Mode; term: string; contextText: string | null; parentSessionId: string | null }
  | /* ... */

function installationReducer(state: InstallationState, action: InstallationAction): InstallationState {
  switch (action.type) {
    case 'SET_CONFIG':
      return {
        ...state,
        mode: action.mode,
        term: action.term,
        contextText: action.contextText,
        parentSessionId: action.parentSessionId,
      };
    case 'WAKE':
      if (state.screen !== 'sleep') return state;
      return { ...state, screen: 'welcome' };
    // ... each action handler
    default:
      return state;
  }
}
```

Pattern: All transitions are state-guarded. Invalid transitions return the state unchanged.

### Constants

All magic values are extracted to constants in `constants.ts`:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/packages/shared/src/constants.ts`

```typescript
export const FACE_DETECTION = {
  WAKE_THRESHOLD_MS: 3000,
  SLEEP_THRESHOLD_MS: 30000,
  DETECTION_INTERVAL_MS: 500,
  MIN_CONFIDENCE: 0.5,
} as const;

export const TIMERS = {
  WELCOME_DURATION_MS: 3000,
  TERM_PROMPT_DURATION_MS: 2000,
  DEFINITION_DISPLAY_MS: 10000,
  FAREWELL_DURATION_MS: 15000,
  PRINT_TIMEOUT_MS: 30000,
} as const;
```

Pattern: Group related constants in objects with `as const` to preserve literal types.

### API Response Handling

API responses are validated with Zod schemas, results are typed:

**File:** `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/lib/api.ts`

```typescript
export const ConfigResponseSchema = z.object({
  mode: ModeSchema,
  term: z.string(),
  contextText: z.string().nullable().optional(),
  // ...
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

export async function fetchConfig(backendUrl: string): Promise<ConfigResponse> {
  return apiFetch(
    `${backendUrl}/api/config`,
    { method: 'GET' },
    ConfigResponseSchema,
  );
}
```

Pattern: Schema → inferred type → async function returning typed promise.

---

## Summary Checklist

- ✓ TypeScript strict mode, no `any`
- ✓ Zod validation at all API boundaries
- ✓ Files named by purpose (components/, hooks/, lib/, etc.)
- ✓ Screen components as `{State}Screen.tsx`
- ✓ Tests co-located: `foo.ts` + `foo.test.ts`
- ✓ Imports organized: external → shared → relative
- ✓ Errors caught, logged with prefix, returned as JSON
- ✓ Functional components with Props interfaces
- ✓ useReducer for state machines, useState for simple state
- ✓ Tailwind v4 for styles, inline styles for computed values
- ✓ Constants in constants.ts, grouped by feature
- ✓ All state guarded in reducer switch statements
