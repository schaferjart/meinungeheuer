# Coding Conventions

**Analysis Date:** 2026-03-08

## Naming Patterns

**Files:**
- Source files: `camelCase.ts` / `camelCase.tsx` (e.g., `useConversation.ts`, `buildWordTimestamps.ts`)
- Screen components: `PascalCase.tsx` in `components/screens/` directory, named `{StateName}Screen.tsx` (e.g., `ConversationScreen.tsx`, `SleepScreen.tsx`)
- Top-level components: `PascalCase.tsx` (e.g., `KaraokeReader.tsx`, `CameraDetector.tsx`, `ScreenTransition.tsx`)
- Test files: co-located, same name with `.test.ts` / `.test.tsx` suffix (e.g., `cache.ts` -> `cache.test.ts`)
- Index/barrel files: `index.ts` for re-exports

**Functions:**
- React components: `PascalCase` named exports (e.g., `export function ConversationScreen()`)
- Hooks: `camelCase` prefixed with `use` (e.g., `useInstallationMachine`, `useAudioSync`, `useFaceDetection`)
- Utility functions: `camelCase` (e.g., `buildWordTimestamps`, `computeCacheKey`, `splitTextIntoChunks`)
- Service functions: `camelCase` (e.g., `advanceChain`, `generateEmbedding`, `getActiveChainContext`)
- Factory/builder functions: `build` or `create` prefix (e.g., `buildSystemPrompt`, `createSupabaseClient`, `createMemoryCache`)

**Variables:**
- Local variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for config objects and standalone values (e.g., `FACE_DETECTION`, `TIMERS`, `DEFAULT_TERM`)
- Environment variables accessed via bracket notation: `process.env['VARIABLE_NAME']` (NOT `process.env.VARIABLE_NAME`)
- Vite env vars: `import.meta.env['VITE_VARIABLE_NAME']`

**Types:**
- Interfaces and type aliases: `PascalCase` (e.g., `InstallationState`, `TranscriptEntry`, `WordTimestamp`)
- Zod schemas: `PascalCase` suffixed with `Schema` (e.g., `SessionSchema`, `ModeSchema`, `PrintPayloadSchema`)
- Inferred types from Zod: same name without `Schema` suffix (e.g., `type Session = z.infer<typeof SessionSchema>`)
- Insert types: prefixed with `Insert` (e.g., `InsertSession`, `InsertDefinition`)
- Props interfaces: `{ComponentName}Props` (e.g., `ConversationScreenProps`, `KaraokeReaderProps`)
- Hook params/returns: `Use{Name}Params` / `Use{Name}Return` (e.g., `UseConversationParams`, `UseKaraokeReaderReturn`)

## Code Style

**Formatting:**
- Biome v2 in `packages/karaoke-reader/` (`packages/karaoke-reader/biome.json`)
  - Indent: 2 spaces
  - Line width: 100
  - Import organization enabled
- No global Prettier or ESLint config at root
- Other packages rely on TypeScript strict mode and editor defaults
- Use 2-space indentation consistently across all files
- Single quotes for strings

**Linting:**
- TypeScript strict mode in all packages via `tsconfig.base.json`:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
- Tablet app relaxes unused checks: `noUnusedLocals: false`, `noUnusedParameters: false` in `apps/tablet/tsconfig.json`
- No `any` type allowed (enforced by strict mode)
- Use optional chaining (`?.`) consistently for nullable access

## Import Organization

**Order:**
1. External packages (React, Hono, Zod, Supabase, etc.)
2. Workspace packages (`@meinungeheuer/shared`, `karaoke-reader`)
3. Relative imports (local modules)

**Path Aliases:**
- Workspace packages: `@meinungeheuer/shared`, `@meinungeheuer/tablet`, `@meinungeheuer/backend`, `@meinungeheuer/printer-bridge`
- Karaoke reader sub-exports: `karaoke-reader/utils`, `karaoke-reader/hooks`, `karaoke-reader/elevenlabs`
- No path aliases within individual apps (use relative imports)

**Module extensions:**
- Always include `.js` extension in relative imports for ESM compatibility (e.g., `import { supabase } from '../services/supabase.js'`)
- Exception: tablet app (Vite bundler resolves without extensions)

**Type-only imports:**
- Use `import type` for type-only imports (e.g., `import type { Mode, Definition } from '@meinungeheuer/shared'`)
- Use `type` keyword inline in mixed imports (e.g., `import { z, type ZodType } from 'zod'` is NOT used -- separate them)

## Error Handling

**Patterns:**
- **Never crash long-running services.** Backend and printer-bridge catch all errors, log, and continue. See `apps/backend/src/app.ts` global error handler and `apps/printer-bridge/src/index.ts` processJob.
- **Zod safeParse at API boundaries.** All incoming request bodies are validated with `schema.safeParse(body)`. On failure, return `{ error, details: parsed.error.flatten() }` with 400 status. See `apps/backend/src/routes/webhook.ts`.
- **Fire-and-forget with void.** Non-critical async operations (embeddings, persist, cache writes) use `void functionCall()` to suppress unhandled-promise warnings without blocking. See `apps/backend/src/routes/webhook.ts` line 253: `void generateEmbedding(definitionId)`.
- **Try-catch at function boundaries.** Service functions wrap entire body in try-catch, log errors with context objects, and return gracefully:
  ```typescript
  // Pattern from apps/backend/src/services/embeddings.ts
  try {
    // ... operation
  } catch (err) {
    console.error('[embeddings] Unexpected error:', { definitionId, error: err });
  }
  ```
- **Non-fatal errors: log and continue.** When a secondary operation fails (e.g., print queue insert after definition save), log the error but still return success for the primary operation.
- **Client-side error swallowing.** Tablet persist functions (`apps/tablet/src/lib/persist.ts`) never throw -- they catch, `console.warn`, and return. UI must never block on persistence.
- **Retry pattern.** Used in printer bridge (`apps/printer-bridge/src/printer.ts`): retry once on network error, then throw.

**Request body parsing pattern (Hono routes):**
```typescript
let body: unknown;
try {
  body = await c.req.json();
} catch {
  return c.json({ error: 'Invalid JSON body' }, 400);
}

const parsed = SomeSchema.safeParse(body);
if (!parsed.success) {
  return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
}
```

## Logging

**Framework:** `console` (console.log, console.error, console.warn)

**Patterns:**
- Use bracketed prefixes for log context: `[component/action]` format
  - Backend routes: `[webhook/definition]`, `[session/start]`, `[config/GET]`
  - Services: `[chain]`, `[embeddings]`
  - Printer bridge: `[bridge]`
  - Tablet: `[App]`, `[MeinUngeheuer]`, `[Persist]`
- Log structured context objects for errors:
  ```typescript
  console.error('[webhook/definition] Session fetch error:', {
    conversation_id,
    error: sessionFetchError,
  });
  ```
- Use `console.warn` for non-critical issues (duplicate inserts, fallback behavior)
- Use `console.log` for lifecycle events (startup, connection, job completion)

## Comments

**When to Comment:**
- Section headers use `// ============================================================` separator bars with centered titles
- Subsection headers use `// ---------------------------------------------------------------------------` with left-aligned titles
- Printer bridge uses `// ---` with Unicode box-drawing chars for section dividers
- JSDoc blocks on exported functions that need context (especially "fire-and-forget" and "never throws" contracts)
- Inline comments for non-obvious type assertions or workarounds

**JSDoc/TSDoc:**
- Used on exported service functions and hook factories
- Focus on behavioral contracts: "Never throws; all errors are logged", "Fire-and-forget", "Returns null if..."
- Not used on React components (props interfaces are self-documenting)
- Not used on simple utility functions where the name is descriptive enough

## Function Design

**Size:** Functions are kept focused. Route handlers are long (50-100 lines) but linear -- numbered step comments break them into sections. Utility functions are short (10-30 lines).

**Parameters:**
- Hooks accept a single params object: `function useConversation(params: UseConversationParams)`
- Simple functions use positional params: `function buildWordTimestamps(text: string, alignment: AlignmentData, timeOffset?: number)`
- Config/options objects for anything with 3+ optional parameters

**Return Values:**
- Hooks return named objects: `{ state, dispatch, wake, reset }`
- Service functions return `Promise<void>` for side effects, `Promise<T | null>` for queries
- Supabase queries use destructured `{ data, error }` pattern consistently

## Module Design

**Exports:**
- Named exports exclusively. No default exports anywhere in the codebase.
- Components: `export function ComponentName()`
- Hooks: `export function useHookName()`
- Types: `export interface` / `export type`

**Barrel Files:**
- `packages/shared/src/index.ts`: re-exports all from `types.js`, `supabase.js`, `constants.js`
- `packages/karaoke-reader/src/index.ts`: explicit named re-exports of all public API
- `packages/karaoke-reader/src/hooks/index.ts`: barrel for hooks sub-package
- `packages/karaoke-reader/src/utils/index.ts`: barrel for utils sub-package
- Apps do NOT use barrel files -- direct imports to specific modules

**Singleton Pattern:**
- Supabase client: lazy singleton in tablet (`apps/tablet/src/lib/supabase.ts`) and module-level in backend (`apps/backend/src/services/supabase.ts`)
- OpenRouter client: lazy singleton with null check (`apps/backend/src/services/embeddings.ts`)

## React Patterns

**State Machine:**
- Central `useReducer` pattern for app state in `apps/tablet/src/hooks/useInstallationMachine.ts`
- Discriminated union actions: `type InstallationAction = { type: 'WAKE' } | { type: 'TIMER_3S' } | ...`
- State guards prevent invalid transitions (each case checks `state.screen` before transitioning)
- Exhaustiveness guard in switch: `const _: never = screen; void _;`

**Callback Refs:**
- Use `useRef` to hold callback references that change frequently, avoiding re-initialization of external SDKs:
  ```typescript
  const onDefinitionReceivedRef = useRef(onDefinitionReceived);
  onDefinitionReceivedRef.current = onDefinitionReceived;
  ```

**Component Props:**
- Screen components receive `dispatch` as a prop for state machine actions
- Props interfaces defined above the component in the same file
- Use `React.Dispatch<InstallationAction>` type for dispatch props

**CSS / Styling:**
- Tailwind v4 in tablet app via `@tailwindcss/vite` plugin. CSS-first config (NOT `tailwind.config.js`).
- Import: `@import "tailwindcss"` in `apps/tablet/src/index.css`
- Mix of Tailwind utility classes and inline `style` objects in components
- Inline styles used for dynamic values and complex responsive sizing (`clamp()`)
- Inline `<style>` tags for CSS keyframe animations
- Karaoke-reader uses BEM-like CSS class naming: `.kr-root`, `.kr-scroll-container`, `.kr-controls`, `.kr-loading-indicator`
- Data attributes for state: `data-kr-index`, `data-kr-state`, `data-kr-status`

## Shared Type Pattern

**Zod-first type definitions** in `packages/shared/src/types.ts`:
1. Define Zod schema: `export const SessionSchema = z.object({...})`
2. Infer TypeScript type: `export type Session = z.infer<typeof SessionSchema>`
3. Derive insert types: `export const InsertSessionSchema = SessionSchema.omit({ id: true, created_at: true })`

**Database type interface** in `packages/shared/src/supabase.ts`:
- Manual `Database` interface mirroring SQL schema with `Row`, `Insert`, `Update` shapes
- Used to produce typed Supabase client: `SupabaseClient<Database>`
- Each table includes `Relationships: []`

---

*Convention analysis: 2026-03-08*
