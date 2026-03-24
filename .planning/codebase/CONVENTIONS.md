# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

**Files:**
- Screen components: `{StateName}Screen.tsx` (e.g., `TextDisplayScreen.tsx`, `ConversationScreen.tsx`)
- Custom hooks: `use{Name}.ts` (e.g., `useInstallationMachine.ts`, `useConversation.ts`, `useKaraokeReader.ts`)
- Utilities: lowercase with hyphens (e.g., `buildWordTimestamps.ts`, `mock-audio.ts`)
- Test files colocated with source: `{name}.test.ts` or `{name}.test.tsx` in same directory

**Functions:**
- camelCase for all functions and methods
- Utility functions often prefixed with verb: `build*`, `make*`, `load*`, `fetch*`, `persist*`
- Helper functions inside tests: `make{Type}()` for creating test fixtures (e.g., `makeDefinition()`, `makeTimestamps()`)

**Variables:**
- camelCase for all variables and properties
- Constants in UPPER_SNAKE_CASE (e.g., `DEFAULT_MODE`, `DEFAULT_TERM`)
- React state variables: descriptive names like `transcript`, `isSpeaking`, `status`, `activeWordIndex`
- Booleans often prefixed with `is` or `has`: `isSpeaking`, `voiceCloneConsent`

**Types:**
- PascalCase for all types and interfaces
- Suffixes for categorized types:
  - `*Schema` for Zod schemas (e.g., `ModeSchema`, `SessionSchema`)
  - `*Response` for API response types (e.g., `ConfigResponse`)
  - `*Params` for function parameter interfaces (e.g., `UseConversationParams`)
  - `*Return` for hook return types (e.g., `UseConversationReturn`)
  - `*Action` for reducer action union types (e.g., `InstallationAction`)
  - `*State` for reducer state types (e.g., `InstallationState`)

## Code Style

**Formatting:**
- Prettier handles all formatting (runs via `pnpm lint`)
- No `.prettierrc` configured — uses Prettier defaults
- No linting config file detected (ESLint not explicitly configured)

**Comments:**
- Use block comments (`/** ... */`) for JSDoc/TSDoc documentation
- Describe intent and behavior, not obvious code
- Place descriptive comments above implementations:
  ```typescript
  /**
   * Build the system prompt for the ElevenLabs Conversational AI agent.
   * The prompt is constructed dynamically based on the current mode...
   */
  export function buildSystemPrompt(...) { ... }
  ```
- Section dividers use lines of `=` or `-` to organize code blocks:
  ```typescript
  // ============================================================
  // State
  // ============================================================
  ```

**TypeScript:**
- Strict mode enforced (`"strict": true` in `tsconfig.base.json`)
- No `any` types allowed
- Config settings:
  - `noUncheckedIndexedAccess: true` — require type guards on object index access
  - `noUnusedLocals: true` — error on unused variables
  - `noUnusedParameters: true` — error on unused function parameters
  - `declaration: true` — emit `.d.ts` files for packages

## Import Organization

**Order:**
1. External library imports (React, third-party packages)
2. Type-only imports from external libraries
3. Local absolute imports from `@meinungeheuer/shared` or named packages
4. Local relative imports (hooks, components, utilities)
5. Type-only imports from local modules

**Examples:**
```typescript
import { useCallback, useRef, useState } from 'react';
import type { Status, DisconnectionDetails, Role as ElevenLabsRole } from '@elevenlabs/react';
import { DEFAULT_MODE, DEFAULT_TERM, getProgram } from '@meinungeheuer/shared';
import type { ConversationProgram, Definition } from '@meinungeheuer/shared';
import { useInstallationMachine } from './hooks/useInstallationMachine';
import { fetchConfig } from './lib/api';
import type { ConfigResponse } from './lib/api';
```

**Path Aliases:**
- Monorepo workspace imports use package names: `@meinungeheuer/shared`, `@meinungeheuer/tablet`, `karaoke-reader`
- Relative imports used within same package
- No path aliases configured in TypeScript — imports use full workspace paths

**Barrel Files:**
- Not extensively used in codebase
- Prefer direct imports to specific modules

## Zod Runtime Validation

**Pattern:**
- All external API boundaries use Zod schemas for runtime validation
- Schemas live in `packages/shared/src/types.ts`
- Schemas named with `Schema` suffix (e.g., `SessionSchema`, `DefinitionSchema`)
- Types inferred from schemas: `type Mode = z.infer<typeof ModeSchema>`

**Example:**
```typescript
export const ModeSchema = z.enum(['text_term', 'term_only', 'chain']);
export type Mode = z.infer<typeof ModeSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  // ... other fields
});
export type Session = z.infer<typeof SessionSchema>;
```

## Error Handling

**Strategy:** Never crash long-running services (backend, printer-bridge). Catch, log, continue.

**Patterns:**
- Async functions wrap try-catch at top level:
  ```typescript
  try {
    const result = await someOperation();
    // handle success
  } catch (error) {
    console.error('Operation failed:', error);
    // continue or return default
  }
  ```

- Silent failures documented: `persistDefinition()`, `persistTranscript()`, `persistPrintJob()` swallow errors silently and are followed by comments explaining behavior

- RLS (Row Level Security) policy failures are silent in the browser — no visible error logs. Check Supabase schema directly if data doesn't appear

- Network errors in components dispatch state machine actions for graceful fallback (e.g., `FACE_LOST` triggers reset)

**No error types exported:**
- Custom error classes not used
- Rely on JavaScript Error type and `.instanceof Error` checks
- Defensive type assertions in tests: `as any` when testing edge cases

## Logging

**Framework:** `console` only (no dedicated logging library)

**Patterns:**
- `console.log()` for general output and debug info
- `console.warn()` for warnings or recoverable issues
- `console.error()` for errors (but don't throw in services)
- `console.error('message:', error)` standard format
- Example: `console.error('Failed to persist definition:', err);`

**When to Log:**
- Network request failures (with retry hints)
- State transitions for debugging (mainly in tests)
- Configuration loading and validation
- Service startup/shutdown (backend, printer-bridge)
- External API failures (ElevenLabs, Supabase)

## Reducer Pattern

**Used in:** `useInstallationMachine.ts`

**Patterns:**
- State interface: `InstallationState` with all mutable fields
- Action union type: discriminated union with `type` field
- Reducer function: pure function `(state, action) => newState`
- No mutations — always return new object with spread operator: `{ ...state, field: newValue }`
- Guard clauses check current state before transitioning:
  ```typescript
  case 'TIMER_3S':
    if (state.screen !== 'welcome') return state;  // no-op if invalid
    // then proceed with transition
  ```
- Default: return state unchanged for invalid transitions

## React Component Design

**Functional components only** — no class components

**Props interface pattern:**
```typescript
interface TextDisplayScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  contextText: string | null;
  language: 'de' | 'en';
}

export function TextDisplayScreen({ dispatch, contextText, language }: TextDisplayScreenProps) {
  // ...
}
```

**Hooks:**
- Custom hooks return either simple values or objects with named properties
- Hook parameter is usually a single options object:
  ```typescript
  interface UseConversationParams { ... }
  export function useConversation(params: UseConversationParams): UseConversationReturn { ... }
  ```

**Component organization:**
- Screen components: `apps/tablet/src/components/screens/{StateName}Screen.tsx`
- Reusable components: `apps/tablet/src/components/`
- Hooks: `apps/tablet/src/hooks/` or `packages/{pkg}/src/hooks/`
- Utilities: `apps/{app}/src/lib/` or `packages/{pkg}/src/utils/`

## Module Design

**Exports:**
- Named exports preferred for functions and types
- Default exports rare — used only for components in some cases

**Package structure:**
- `packages/shared/src/types.ts` — all shared types and Zod schemas
- `packages/shared/src/programs/` — conversation program definitions and builders
- `packages/karaoke-reader/` — self-contained package for TTS with karaoke highlighting
- Each app has own `src/` directory with no shared state

**Re-exports and Declarations:**
- Test-only exports hidden in comments at bottom of test files
- Helper functions for testing often defined inline in test files, not in separate fixtures

---

*Convention analysis: 2026-03-24*
