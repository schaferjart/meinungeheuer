# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

**Files:**
- React screen components: `PascalCase` with `Screen` suffix — `ConversationScreen.tsx`, `SleepScreen.tsx`
- React hooks: `camelCase` with `use` prefix — `useInstallationMachine.ts`, `useConversation.ts`, `usePortraitCapture.ts`
- Utility/lib files: `camelCase` — `persist.ts`, `systemPrompt.ts`, `fullscreen.ts`, `api.ts`
- Test files: co-located, same name with `.test.ts` / `.test.tsx` suffix
- Program files: `kebab-case` — `free-association.ts`, `voice-chain.ts`

**Functions:**
- Hooks: `useXxx` — exported named functions
- Programs: `xxxProgram` for the program object itself (e.g. `aphorismProgram`, `voiceChainProgram`)
- Utility functions: `camelCase` — `buildSystemPrompt`, `loadConfig`, `renderAndPrint`, `buildTestPayload`
- Async operations that return `void` and swallow errors: `persistXxx` — `persistDefinition`, `persistPrintJob`, `persistTranscript`
- API layer: `fetchXxx` / `startXxx` / `submitXxx` pattern in `apps/tablet/src/lib/api.ts`

**Variables:**
- `camelCase` throughout
- State properties use `snake_case` only when mirroring Supabase column names exactly

**Types/Interfaces:**
- Interfaces: `PascalCase` with descriptive noun — `InstallationState`, `BridgeConfig`, `UseConversationParams`
- Zod schemas: `PascalCase` + `Schema` suffix — `ModeSchema`, `PrintPayloadSchema`, `SessionSchema`
- Types inferred from Zod: `type Foo = z.infer<typeof FooSchema>` — always paired with their schema
- Action union types: `PascalCase` — `InstallationAction`
- Action type strings: `SCREAMING_SNAKE_CASE` — `'WAKE'`, `'TIMER_3S'`, `'DEFINITION_RECEIVED'`

**Directories:**
- Screen components: `components/screens/`
- Hooks: `hooks/`
- Library functions: `lib/`
- API routes: `routes/`
- Services: `services/`
- Program modules: `programs/`

## Code Style

**Formatting:**
- 2-space indentation (Biome config in `packages/karaoke-reader/biome.json`, inferred from code in other packages)
- Line width: 100 characters (`packages/karaoke-reader/biome.json`)
- Single quotes for strings

**Linting:**
- Biome used in `packages/karaoke-reader/` — recommended rules + import organization
- No ESLint config found at root; TypeScript strict mode enforces most quality rules
- One documented `eslint-disable` comment exists: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` in `useConversation.test.ts` — only in test code

**TypeScript:**
- Strict mode everywhere — `tsconfig.base.json` sets `"strict": true`
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`, requires explicit null checks
- `noUnusedLocals: true`, `noUnusedParameters: true`
- `no any` rule enforced — the one `any` in tests is explicitly suppressed
- Target: ES2022, module: ESNext, moduleResolution: bundler

## Import Organization

**Order (Biome enforces in karaoke-reader; pattern followed everywhere):**
1. Node built-ins (if applicable)
2. External packages (`@elevenlabs/react`, `hono`, `zod`, `react`)
3. Workspace packages (`@meinungeheuer/shared`, `karaoke-reader`)
4. Local relative imports

**Import style:**
- Always use named imports, not default imports for internal code
- Type-only imports use `import type { ... }` syntax — consistently used throughout
- Packages exports use `.js` extension even for TypeScript source (ESM interop): `import { ... } from './aphorism.js'`
- Workspace imports: `@meinungeheuer/shared` for types and constants; `karaoke-reader` for the reader package

## Zod Validation Patterns

**Schema definition (in `packages/shared/src/types.ts`):**
```typescript
// 1. Define schema with z.object() / z.enum()
export const ModeSchema = z.enum(['text_term', 'term_only', 'chain']);
// 2. Infer type from schema — never write type manually
export type Mode = z.infer<typeof ModeSchema>;
```

**Insert shapes (omit server-generated fields):**
```typescript
export const InsertSessionSchema = SessionSchema.omit({ id: true, created_at: true });
export type InsertSession = z.infer<typeof InsertSessionSchema>;
```

**At API boundaries — always use `safeParse` with explicit error return:**
```typescript
const parsed = SaveDefinitionWebhookSchema.safeParse(body);
if (!parsed.success) {
  return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
}
```

**For response validation — use `schema.parse()` (throws on failure):**
```typescript
// In api.ts apiFetch helper
return schema.parse(json);
```

**Zod `.default()` used sparingly for backward-compatible fields:**
```typescript
program: z.string().default('aphorism'),
```

## Error Handling

**Fire-and-forget pattern (all persistence functions):**
All `persist*.ts` functions in `apps/tablet/src/lib/persist.ts` are `async`, return `Promise<void>`, wrap the entire body in `try/catch`, log with `console.warn`, and never rethrow. Comments label them explicitly as "Fire-and-forget."
```typescript
export async function persistDefinition(...): Promise<void> {
  try {
    const { error } = await supabase.from('definitions').insert({...});
    if (error) {
      if (error.code === '23505') {
        console.log('[Persist] Definition already exists');  // Duplicate is fine
      } else {
        console.warn('[Persist] Definition insert error:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Persist] Definition error:', err);
  }
}
```

**Backend webhook routes:** All routes check `safeParse` before business logic. DB errors return HTTP 500 with descriptive JSON. Non-fatal errors (print queue insert failure, chain advance failure) are logged and continue — the primary operation (definition saved) is preserved.

**Long-running services:** `catch, log, continue` — printer bridge index.ts and backend index.ts never crash on individual job failures.

**Retry pattern (printer.ts):**
```typescript
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    // ... network call ...
    return;
  } catch (err) {
    if (attempt === 1) {
      console.warn(`[printer] First attempt failed, retrying…`);
      continue;
    }
    throw err;  // Only re-throw on second failure
  }
}
```

**Fallback chains:** `renderAndPrint` tries cloud render API, falls back to legacy POS rendering on error — wrapped in `try/catch` with `console.warn`.

**Error propagation in API layer:** `apiFetch` in `apps/tablet/src/lib/api.ts` throws `Error('API error ${status}: ...')`. Callers that are fire-and-forget wrap in their own `try/catch`.

## Logging

**Prefix pattern:** All log calls include a bracketed module prefix:
- `[Persist]` — persist.ts functions
- `[printer]` — printer.ts
- `[portrait]` — portrait printing
- `[MeinUngeheuer]` — useConversation.ts (ElevenLabs integration)
- `[Machine]` — useInstallationMachine.ts
- `[webhook/definition]` / `[webhook/conversation-data]` — backend route handlers
- `[programs]` — program registry

**Log levels:** `console.log` for success/info; `console.warn` for recoverable errors; `console.error` for serious failures.

## ConversationProgram Interface Pattern

Programs implement `ConversationProgram` from `packages/shared/src/programs/types.ts`. Each program is a `const` object literal, not a class:
```typescript
export const aphorismProgram: ConversationProgram = {
  id: 'aphorism',
  name: 'Aphorism',
  description: '...',
  stages: { textReading: true, termPrompt: false, portrait: true, printing: true },
  printLayout: 'dictionary',
  resultDisplay: 'aphorism',
  sessionMode: 'text_term',
  buildSystemPrompt(params: PromptParams): string { ... },
  buildFirstMessage(params: PromptParams): string { ... },
};
```
Programs are registered in `packages/shared/src/programs/index.ts` via a plain `Record<string, ConversationProgram>`. `getProgram()` falls back to `aphorismProgram` with a `console.warn` for unknown IDs — never throws.

## React/Component Patterns

**State machine:** Single `useReducer` reducer pattern. State transitions are pure functions guarded by current screen check (`if (state.screen !== 'conversation') return state`). Actions are discriminated unions with `SCREAMING_SNAKE_CASE` type strings. Located at `apps/tablet/src/hooks/useInstallationMachine.ts`.

**Screen components:** Pure presentational components in `apps/tablet/src/components/screens/{StateName}Screen.tsx`. Receive typed props; never manage their own conversation state.

**Inline CSS vs Tailwind:** Mixed pattern. Tailwind v4 utility classes (`className`) used for structural layout (`flex`, `flex-col`, `w-full`, `h-full`, `overflow-y-auto`, `items-center`). `style={{}}` inline objects used for dynamic values, typography (`fontFamily`, `fontSize`, `clamp()`), and fine-grained color control.

**Tailwind v4 config:** CSS-first — no `tailwind.config.js`. Configuration is in `apps/tablet/src/index.css` via `@import "tailwindcss"` directive. Plugin registered in `vite.config.ts` as `tailwindcss()` (from `@tailwindcss/vite`). Do NOT use v3-style `module.exports = { content: [...] }` config.

**Responsive sizing:** `clamp()` in inline styles for fluid typography and spacing (`clamp(1.5rem, 3vw, 2.5rem)`), not Tailwind responsive prefixes.

**Ref pattern for stable callbacks:** Refs used to stabilize callback access inside ElevenLabs hooks without triggering re-initialization:
```typescript
const onDefinitionReceivedRef = useRef(onDefinitionReceived);
onDefinitionReceivedRef.current = onDefinitionReceived;
```

## Comments

**When to comment:**
- File-level JSDoc for module purpose (printer.ts, config.ts, persist.ts)
- Section dividers with `// ===...===` banners for major logical groups
- Line comments for non-obvious behavior (`// Duplicate is fine — webhook may also insert`)
- `@deprecated` JSDoc when function is being superseded (`systemPrompt.ts`)

**What NOT to document:** Don't add comments explaining obvious TypeScript — the types are the docs.

## Module Design

**Exports:** Named exports only — no default exports anywhere.

**Barrel files:** `packages/shared/src/index.ts` and `packages/shared/src/programs/index.ts` are barrel re-exports. Individual modules import from the barrel via `@meinungeheuer/shared`.

**Function size:** Helper functions extracted when shared or complex (e.g. `addParagraphNumbers`, `buildModeBlock` in `aphorism.ts`). Main exported function stays readable without scrolling through internals.

---

*Convention analysis: 2026-03-24*
