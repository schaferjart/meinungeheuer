# Codebase Structure

**Analysis Date:** 2026-03-08

## Directory Layout

```
meinungeheuer/
├── apps/
│   ├── tablet/              # React SPA — visitor-facing UI + admin dashboard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── screens/ # One component per state machine screen
│   │   │   │   ├── CameraDetector.tsx
│   │   │   │   ├── ScreenTransition.tsx
│   │   │   │   └── TextReader.tsx
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── lib/         # Pure utility functions (API client, prompts, persistence)
│   │   │   ├── pages/       # Full-page views (Admin)
│   │   │   ├── App.tsx      # Root component, orchestrates state machine + conversation
│   │   │   ├── main.tsx     # Entry point, mounts App
│   │   │   └── index.css    # Tailwind v4 imports
│   │   ├── public/          # Static assets
│   │   └── package.json
│   │
│   ├── backend/             # Hono REST API server
│   │   ├── src/
│   │   │   ├── routes/      # Route handlers (webhook, session, config)
│   │   │   ├── services/    # Business logic (supabase client, chain, embeddings)
│   │   │   ├── app.ts       # Hono app with middleware + route mounting
│   │   │   └── index.ts     # HTTP server entry point
│   │   └── package.json
│   │
│   └── printer-bridge/      # Local Node.js service near printer
│       ├── src/
│       │   ├── config.ts    # POS server URL config
│       │   ├── printer.ts   # HTTP relay to POS server + console fallback
│       │   ├── index.ts     # Entry: Supabase Realtime subscription + job processing
│       │   └── test-print.ts # CLI test script
│       └── package.json
│
├── packages/
│   ├── shared/              # Types, Supabase client, constants — imported by all apps
│   │   ├── src/
│   │   │   ├── types.ts     # Zod schemas + TS types for all DB tables + payloads
│   │   │   ├── supabase.ts  # Database interface + typed client factory
│   │   │   ├── constants.ts # APP_NAME, defaults, timer values, face detection config
│   │   │   └── index.ts     # Barrel re-export
│   │   └── package.json
│   │
│   ├── karaoke-reader/      # Standalone publishable React component library
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   └── elevenlabs/
│   │   │   │       └── index.ts  # ElevenLabs TTS API fetch + useElevenLabsTTS hook
│   │   │   ├── components/
│   │   │   │   └── KaraokeReader.tsx  # Main component — word highlighting
│   │   │   ├── hooks/
│   │   │   │   ├── useAudioSync.ts    # requestAnimationFrame word tracking
│   │   │   │   ├── useAutoScroll.ts   # Smooth scroll to active word
│   │   │   │   ├── useKaraokeReader.ts # Orchestrator: audio lifecycle + status machine
│   │   │   │   └── index.ts
│   │   │   ├── utils/
│   │   │   │   ├── buildWordTimestamps.ts # Character-level -> word-level timestamps
│   │   │   │   ├── splitTextIntoChunks.ts # Long text chunking for TTS API
│   │   │   │   ├── computeCacheKey.ts     # SHA-256 cache key from text+voiceId
│   │   │   │   ├── markdown.ts            # Markdown parsing for display
│   │   │   │   └── index.ts
│   │   │   ├── test-utils/
│   │   │   │   ├── setup.ts       # Vitest setup (happy-dom, jest-dom matchers)
│   │   │   │   └── mock-audio.ts  # HTMLAudioElement mock for tests
│   │   │   ├── types.ts     # WordTimestamp, CacheAdapter, TtsStatus, parsed text types
│   │   │   ├── cache.ts     # Memory + localStorage cache adapter implementations
│   │   │   └── index.ts     # Barrel export (types, utils, hooks, components)
│   │   └── package.json
│   │
│   └── core/                # Empty — only contains dist/ and node_modules/
│       └── (no source files)
│
├── supabase/
│   └── migrations/          # SQL migration files (001-007)
│       ├── 001_extensions.sql
│       ├── 002_tables.sql   # Core schema: sessions, turns, definitions, print_queue, chain_state, installation_config, texts
│       ├── 003_indexes.sql
│       ├── 004_rls.sql
│       ├── 005_seed.sql
│       ├── 006_kreativitaetsrant_and_tts_cache.sql
│       └── 007_anon_insert_definitions.sql
│
├── docs/
│   ├── PRD.md               # Full product requirements document
│   └── PROMPTS.md           # Agent build prompts per component
│
├── CLAUDE.md                # AI assistant instructions
├── Dockerfile               # 2-stage: node build -> nginx SPA (tablet only)
├── package.json             # Root workspace scripts
├── pnpm-workspace.yaml      # Workspace definition
├── pnpm-lock.yaml
└── tsconfig.base.json       # Shared TypeScript config (strict, ES2022, bundler resolution)
```

## Directory Purposes

**`apps/tablet/src/components/screens/`:**
- Purpose: One React component per state machine screen
- Contains: `SleepScreen.tsx`, `WelcomeScreen.tsx`, `TextDisplayScreen.tsx`, `TermPromptScreen.tsx`, `ConversationScreen.tsx`, `SynthesizingScreen.tsx`, `DefinitionScreen.tsx`, `PrintingScreen.tsx`, `FarewellScreen.tsx`
- Naming: `{StateName}Screen.tsx` where StateName matches the `StateName` union type exactly
- Each screen receives `dispatch` as a prop to trigger state transitions

**`apps/tablet/src/hooks/`:**
- Purpose: Custom React hooks for complex stateful behavior
- Contains: `useInstallationMachine.ts` (state machine), `useConversation.ts` (ElevenLabs wrapper), `useFaceDetection.ts` (MediaPipe camera detection)
- Naming: `use{Name}.ts`

**`apps/tablet/src/lib/`:**
- Purpose: Pure utility functions and configuration — no React hooks, no components
- Contains: `api.ts` (backend API client with Zod validation), `systemPrompt.ts` (builds LLM prompts), `firstMessage.ts` (builds agent opening line), `persist.ts` (Supabase write helpers), `supabase.ts` (singleton client), `fullscreen.ts` (fullscreen API wrapper), `supabaseCacheAdapter.ts` (TTS cache backed by Supabase)

**`apps/tablet/src/pages/`:**
- Purpose: Full-page views that are not screens in the state machine
- Contains: `Admin.tsx` — operator dashboard accessible via `?admin=true`

**`apps/backend/src/routes/`:**
- Purpose: Hono route group handlers
- Contains: `webhook.ts` (ElevenLabs callback handlers), `session.ts` (session start), `config.ts` (config read/write, definitions listing, chain history)
- Pattern: Each file exports a `Hono` instance that is mounted via `app.route()` in `app.ts`

**`apps/backend/src/services/`:**
- Purpose: Business logic separated from route handlers
- Contains: `supabase.ts` (singleton service-role client), `chain.ts` (chain state management), `embeddings.ts` (OpenRouter embedding generation)

**`packages/shared/src/`:**
- Purpose: Single source of truth for types and shared utilities
- Key files: `types.ts` (all Zod schemas + types), `supabase.ts` (Database interface + factory), `constants.ts` (all constants)
- Build output: `dist/` with `.js` + `.d.ts` files. Other packages import from `@meinungeheuer/shared`.

**`packages/karaoke-reader/src/adapters/elevenlabs/`:**
- Purpose: ElevenLabs-specific TTS fetching with chunking, caching, and timestamp extraction
- Contains: `index.ts` with `fetchElevenLabsTTS()` function and `useElevenLabsTTS()` React hook
- Exported via `karaoke-reader/elevenlabs` subpath

**`supabase/migrations/`:**
- Purpose: SQL migration files defining the database schema
- Contains: Extensions (pgvector, uuid), table definitions, indexes, RLS policies, seed data, and incremental schema additions (tts_cache table, anon insert policies)

## Key File Locations

**Entry Points:**
- `apps/tablet/src/main.tsx`: Browser entry point (React root mount)
- `apps/backend/src/index.ts`: Backend HTTP server start
- `apps/printer-bridge/src/index.ts`: Printer bridge main (Supabase Realtime subscription)

**Configuration:**
- `tsconfig.base.json`: Base TypeScript config inherited by all packages
- `pnpm-workspace.yaml`: Workspace package locations (`apps/*`, `packages/*`)
- `package.json` (root): Workspace scripts (`dev`, `build`, `typecheck`, `test`, `lint`)
- `Dockerfile`: Multi-stage build for tablet SPA (Coolify deployment)

**Core Logic:**
- `apps/tablet/src/hooks/useInstallationMachine.ts`: State machine (9 screens, 13 actions)
- `apps/tablet/src/hooks/useConversation.ts`: ElevenLabs SDK wrapper + role mapping + tool handling
- `apps/tablet/src/lib/systemPrompt.ts`: Dynamic LLM system prompt builder (different per mode)
- `apps/tablet/src/lib/firstMessage.ts`: Agent first-message builder (language-aware)
- `apps/backend/src/routes/webhook.ts`: Definition save + print queue + chain advance orchestration
- `apps/backend/src/services/chain.ts`: Chain state management (getActive, advance, reset, history)
- `apps/backend/src/services/embeddings.ts`: Fire-and-forget OpenRouter embedding generation
- `packages/karaoke-reader/src/adapters/elevenlabs/index.ts`: TTS API integration with chunking + caching

**Type Definitions:**
- `packages/shared/src/types.ts`: All Zod schemas, TypeScript types, insert variants, payload shapes
- `packages/shared/src/supabase.ts`: Full `Database` interface (Row/Insert/Update for every table)
- `packages/karaoke-reader/src/types.ts`: WordTimestamp, CacheAdapter, TtsStatus, parsed text types

**Testing:**
- `apps/tablet/src/hooks/useInstallationMachine.test.ts`: State machine unit tests
- `packages/karaoke-reader/src/**/*.test.{ts,tsx}`: Component, hook, and utility tests (7 test files)

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `KaraokeReader.tsx`, `ConversationScreen.tsx`, `TextReader.tsx`)
- Hooks: `use{Name}.ts` (e.g., `useInstallationMachine.ts`, `useConversation.ts`, `useAudioSync.ts`)
- Pure utilities/lib: `camelCase.ts` (e.g., `systemPrompt.ts`, `firstMessage.ts`, `persist.ts`)
- Test files: `{source}.test.ts` or `{source}.test.tsx` co-located next to source
- Route files: `camelCase.ts` (e.g., `webhook.ts`, `session.ts`, `config.ts`)
- SQL migrations: `NNN_{description}.sql` (e.g., `002_tables.sql`)

**Directories:**
- App directories: `kebab-case` (e.g., `printer-bridge`, `karaoke-reader`)
- Source directories: `camelCase` or `kebab-case` (e.g., `test-utils`, `screens`)

**Exports:**
- Components: named exports, no default exports (e.g., `export function KaraokeReader`)
- Hooks: named exports (e.g., `export function useConversation`)
- Route groups: named exports of Hono instances (e.g., `export const webhookRoutes = new Hono()`)
- Barrel files: `index.ts` re-exports everything (`export * from './types.js'`)

## Where to Add New Code

**New Screen:**
- Create: `apps/tablet/src/components/screens/{StateName}Screen.tsx`
- Add to state machine: Add the new `StateName` to `StateNameSchema` in `packages/shared/src/types.ts`
- Add transitions: Update reducer in `apps/tablet/src/hooks/useInstallationMachine.ts`
- Render: Add case in `renderScreen()` switch in `apps/tablet/src/App.tsx`
- Pattern: Receive `dispatch: React.Dispatch<InstallationAction>` as prop. Use `dispatch({ type: 'ACTION_NAME' })` to trigger transitions.

**New API Route:**
- Create route group: `apps/backend/src/routes/{name}.ts` exporting a `new Hono()` instance
- Mount: Add `app.route('/path', nameRoutes)` in `apps/backend/src/app.ts`
- Validate: Use Zod schemas for request body/query validation with `.safeParse()`
- Pattern: Follow existing routes. Use `supabase` from `../services/supabase.js`. Return JSON responses.

**New Backend Service:**
- Create: `apps/backend/src/services/{name}.ts`
- Pattern: Export async functions. Import `supabase` from `./supabase.js`. Log with `[{name}]` prefix. Never throw from fire-and-forget operations.

**New Shared Type:**
- Add Zod schema: `packages/shared/src/types.ts`
- Add insert variant if DB table: `export const Insert{Name}Schema = {Name}Schema.omit({ id: true, created_at: true })`
- Add to Database interface: `packages/shared/src/supabase.ts` (Row, Insert, Update shapes)
- Rebuild: `pnpm --filter @meinungeheuer/shared build` (other apps import compiled output)

**New Database Table:**
- Add migration: `supabase/migrations/NNN_{description}.sql`
- Add types: `packages/shared/src/types.ts` (Zod schema) + `packages/shared/src/supabase.ts` (Database interface)
- Add RLS: Include policy in migration or add to `004_rls.sql`

**New Tablet Hook:**
- Create: `apps/tablet/src/hooks/use{Name}.ts`
- Tests: `apps/tablet/src/hooks/use{Name}.test.ts` (co-located)

**New Tablet Utility:**
- Create: `apps/tablet/src/lib/{name}.ts`
- Pattern: Pure functions, no React dependencies. Export individual functions (not default).

**New Karaoke Reader Feature:**
- Utility: `packages/karaoke-reader/src/utils/{name}.ts` + test
- Hook: `packages/karaoke-reader/src/hooks/use{Name}.ts` + test
- Re-export in barrel: `packages/karaoke-reader/src/hooks/index.ts` and/or `packages/karaoke-reader/src/index.ts`
- New adapter: `packages/karaoke-reader/src/adapters/{provider}/index.ts`, add subpath export in `package.json`

## Special Directories

**`packages/core/`:**
- Purpose: Appears to be an empty/placeholder package
- Generated: Has `dist/` and `node_modules/` but no source files
- Committed: Yes, but no functional code

**`.planning/`:**
- Purpose: GSD planning documents (codebase analysis, milestones, phases)
- Generated: By Claude Code mapping commands
- Committed: Yes

**`.planning-karaoke-reader/`:**
- Purpose: Planning documents specific to the karaoke-reader package development
- Generated: By Claude Code during karaoke-reader development
- Committed: Yes

**`.entire/`:**
- Purpose: Metadata/logs from the Entire tool
- Generated: Yes
- Committed: Check `.gitignore`

**`dist/` directories (in each package/app):**
- Purpose: TypeScript compilation output
- Generated: Yes, by `pnpm build`
- Committed: Yes for `packages/shared/dist/` (other apps depend on it at build time). Typically `.gitignore`d for apps.

## Build Dependencies

Build order is critical due to workspace dependencies:

1. `packages/shared` must build first (other packages/apps import its compiled output)
2. `packages/karaoke-reader` must build before `apps/tablet` (tablet imports it)
3. Apps can build in parallel after their dependencies

The root `pnpm build` script enforces this:
```bash
pnpm --filter @meinungeheuer/shared build && pnpm -r --filter '!@meinungeheuer/shared' build
```

The Dockerfile explicitly sequences: shared -> karaoke-reader -> tablet.

---

*Structure analysis: 2026-03-08*
