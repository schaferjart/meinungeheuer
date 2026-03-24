# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
meinungeheuer/ (monorepo root)
├── apps/
│   ├── tablet/                 # React visitor interface (Vite)
│   ├── backend/                # Hono API server (Node.js)
│   ├── printer-bridge/         # Print job listener (Node.js, local Pi service)
│   ├── archive/                # Conversation history viewer (React)
│   ├── config/                 # Admin config dashboard (React)
│   ├── print-renderer/         # Thermal card layout engine (Python)
│   └── pos-server/             # Thermal printer HTTP bridge (Python)
├── packages/
│   ├── shared/                 # Types, Supabase client, constants, program registry
│   ├── core/                   # [Exploratory; minimal usage]
│   └── karaoke-reader/         # Text-to-speech with karaoke word highlighting
├── supabase/                   # Database migrations and configuration
├── scripts/                    # Build and deploy utilities
├── tools/                      # Utility scripts and helpers
├── docs/                       # Project documentation
│   ├── PRD.md                  # Product requirements
│   ├── PROMPTS.md              # Agent prompt specifications
│   └── ...
├── .planning/                  # GSD planning (orchestrator output)
├── .claude/                    # Claude context and memory
├── CLAUDE.md                   # Agent instructions (this repo's API)
└── package.json                # pnpm workspaces root
```

## Directory Purposes

**apps/tablet/**
- Purpose: Visitor-facing React interface; state machine; conversation UI
- Contains: Components (screens, UI), hooks (state, ElevenLabs, face detection), utilities (persist, API)
- Key files: `src/App.tsx` (main coordinator), `src/hooks/useInstallationMachine.ts` (state), `src/hooks/useConversation.ts` (EL SDK wrapper)

**apps/backend/**
- Purpose: Configuration API, session persistence, webhook receiver, voice chain processing
- Contains: Route handlers (config, session, webhook, voice-chain), services (Supabase, embeddings, chain state)
- Key files: `src/app.ts` (Hono setup), `src/index.ts` (server start), `src/routes/` (all endpoints)

**apps/printer-bridge/**
- Purpose: Event-driven print job processor; subscribes to Supabase; posts to thermal printer
- Contains: Supabase Realtime listener, print payload validation, printer integration
- Key files: `src/index.ts` (main loop), `src/printer.ts` (print logic), `src/config.ts` (env loading)

**apps/archive/**
- Purpose: Admin dashboard viewing conversations, definitions, session history
- Contains: React components for browsing Supabase data
- Key files: TBD (not analyzed in detail)

**apps/config/**
- Purpose: Admin panel for live configuration tweaks (modes, terms, programs, runtime settings)
- Contains: React controls for updating installation_config table
- Key files: TBD (not analyzed in detail)

**apps/print-renderer/**
- Purpose: Cloud HTTP service rendering thermal card images (JSONB config → PNG)
- Contains: Python Flask/FastAPI endpoint; ESC/POS image generation
- Key files: `supabase_config.py` (maps JSONB to config), `config.yaml` (template defaults)

**apps/pos-server/**
- Purpose: Local HTTP-to-ESC/POS bridge; translates HTTP requests to raw printer commands
- Contains: Python script listening on localhost:9100; sends bytes to thermal printer via USB/serial
- Key files: `print_server.py` (main loop), `setup.sh` (install deps)

**packages/shared/**
- Purpose: Single source of truth for types, constants, Supabase client, and conversation programs
- Contains: Zod schemas (Session, Turn, Definition, etc.), program registry (aphorism, free-association, voice-chain)
- Key files:
  - `src/types.ts` — All database table schemas
  - `src/programs/index.ts` — Program registry and lookup function
  - `src/programs/{aphorism,free-association,voice-chain}.ts` — Program implementations
  - `src/supabase.ts` — Supabase client factory
  - `src/constants.ts` — Installation defaults (DEFAULT_MODE, DEFAULT_TERM, PORTRAIT config, etc.)
  - `src/voiceChainConfig.ts` — Voice chain state shape

**packages/karaoke-reader/**
- Purpose: Text-to-speech with word-level timing for karaoke-style highlighting
- Contains: TTS integration (ElevenLabs with-timestamps), timestamp → word mapping, React hook
- Key files: `src/useTextToSpeechWithTimestamps.ts` (main hook)

**packages/core/**
- Purpose: [Exploratory package; minimal current usage; may hold core utilities in future]
- Contains: TBD
- Key files: TBD

**supabase/**
- Purpose: Database migrations and schema definition
- Contains: SQL migration files (numbered, ordered)
- Key files: `migrations/` (each file is one migration)

**scripts/**
- Purpose: Build orchestration, data import, utility tasks
- Contains: Bash/Node scripts for CI/CD, data import, etc.
- Key files: `import-conversations.mjs` (example)

**docs/**
- Purpose: Human-readable documentation and specifications
- Contains: PRD (product requirements), PROMPTS (agent prompt specs), architecture notes
- Key files: `PRD.md`, `PROMPTS.md`

## Key File Locations

**Entry Points:**
- Tablet: `apps/tablet/src/main.tsx` (React mount) → `src/App.tsx` (component tree)
- Backend: `apps/backend/src/index.ts` (server start) → `src/app.ts` (Hono setup)
- Printer Bridge: `apps/printer-bridge/src/index.ts` (boot, Realtime subscribe)

**Configuration:**
- Shared constants: `packages/shared/src/constants.ts`
- Backend env: `apps/backend/.env` (template: `.env.example`)
- Tablet env: `apps/tablet/.env` (VITE_* vars)
- Printer bridge env: `apps/printer-bridge/.env` (SUPABASE_URL, RENDER_API_KEY, etc.)
- Database: `packages/shared/src/types.ts` (source of truth for schema)

**Core Logic:**
- State machine: `apps/tablet/src/hooks/useInstallationMachine.ts`
- ElevenLabs integration: `apps/tablet/src/hooks/useConversation.ts`
- Program registry: `packages/shared/src/programs/index.ts`
- Persistence: `apps/tablet/src/lib/persist.ts`, `apps/backend/src/routes/session.ts`
- Print job processing: `apps/printer-bridge/src/index.ts`, `src/printer.ts`

**Testing:**
- Tablet tests: `apps/tablet/src/**/*.test.ts` (co-located with source)
- Backend tests: `apps/backend/src/**/*.test.ts` (co-located)
- Printer bridge tests: `apps/printer-bridge/src/**/*.test.ts` (co-located)
- Shared tests: `packages/shared/src/**/*.test.ts` (co-located)

## Naming Conventions

**Files:**
- Components: PascalCase (e.g., `TextDisplayScreen.tsx`, `CameraDetector.tsx`)
- Hooks: `use{Name}.ts` (e.g., `useInstallationMachine.ts`, `useConversation.ts`)
- Utilities: camelCase (e.g., `persist.ts`, `api.ts`, `portraitBlur.ts`)
- Tests: `{name}.test.ts` or `{name}.spec.ts` (co-located with source)
- Routes/services: camelCase (e.g., `config.ts`, `webhook.ts`, `embeddings.ts`)

**Directories:**
- Screens: `components/screens/` (always)
- Hooks: `hooks/` (always)
- Utilities: `lib/` (always)
- Routes: `routes/` (always)
- Services: `services/` (always)
- Pages: `pages/` (admin dashboard in tablet)

**Variables & Functions:**
- camelCase for all variables and functions
- React components (functions starting with capital letter)
- Types in TypeScript: PascalCase for type names; camelCase for variable declarations
- Enums: PascalCase (e.g., PrintStatusSchema values are 'pending', 'printing', 'done', 'error')

**Zod Schemas:**
- Pattern: `{Name}Schema` (e.g., SessionSchema, DefinitionSchema, PrintPayloadSchema)
- Export both schema and inferred type: `type {Name} = z.infer<typeof {Name}Schema>`
- Insert variants omit server fields: `InsertSessionSchema` (no id, created_at)

## Where to Add New Code

**New Feature (New Screen):**
1. Create component: `apps/tablet/src/components/screens/{FeatureName}Screen.tsx`
2. Create test: `apps/tablet/src/components/screens/{FeatureName}Screen.test.ts`
3. Add to state machine: update `useInstallationMachine.ts` with new StateName, action, and transition
4. Render in App.tsx switch statement
5. If needs API: add route to `apps/backend/src/routes/`

**New Hook:**
1. Create: `apps/tablet/src/hooks/use{Name}.ts`
2. Create test: `apps/tablet/src/hooks/use{Name}.test.ts`
3. Export from hook file; import where needed

**New Utility/Helper:**
1. Create: `apps/tablet/src/lib/{name}.ts` (tablet) or `apps/backend/src/services/{name}.ts` (backend)
2. Export and import as needed
3. Add tests co-located

**New Backend Endpoint:**
1. Create route handler: `apps/backend/src/routes/{resource}.ts`
2. Register route in `src/app.ts`: `app.route('/api/{resource}', {resource}Routes)`
3. Add tests in same file
4. Update `apps/tablet/src/lib/api.ts` if tablet calls it

**New Conversation Program:**
1. Create: `packages/shared/src/programs/{program-name}.ts`
2. Implement ConversationProgram interface (buildSystemPrompt, buildFirstMessage, stages, printLayout, resultDisplay)
3. Register in REGISTRY in `packages/shared/src/programs/index.ts`
4. Add tests: `packages/shared/src/programs/{program-name}.test.ts`

**New Database Type:**
1. Add Zod schema to `packages/shared/src/types.ts`
2. Export both schema and inferred type
3. Add Insert variant (omit id, created_at)
4. Create Supabase migration in `supabase/migrations/`
5. Update RLS policies as needed

**Shared Constants:**
- Add to `packages/shared/src/constants.ts`
- Export and import in `packages/shared/src/index.ts`

## Special Directories

**packages/shared/dist/:**
- Purpose: Compiled JavaScript output from TypeScript source
- Generated: Yes (via `pnpm build` in shared package)
- Committed: Yes (force-committed with `-f` flag on Pi to avoid recompilation)
- Note: On Pi with limited RAM, always commit dist/ so deployment doesn't trigger tsc

**apps/tablet/dist/:**
- Purpose: Vite production build output (SPA)
- Generated: Yes (via `pnpm build`)
- Committed: No (.gitignore)

**apps/backend/dist/:**
- Purpose: Compiled JavaScript from TypeScript
- Generated: Yes (via `pnpm build`)
- Committed: No (.gitignore)

**apps/pos-server/venv/:**
- Purpose: Python virtual environment for POS server dependencies
- Generated: Yes (via `bash setup.sh`)
- Committed: No (gitignored)

**supabase/.temp/:**
- Purpose: Temporary files (API response caches, etc.)
- Generated: Yes (at runtime)
- Committed: No

**Supabase Storage Buckets (in production):**
- `portraits-blurred` — Blurred portrait JPEGs (public read, anon write via RLS)
- `render-jobs` — Temporary files from print-renderer
- All URLs returned as public URLs (no auth needed to download)

---

*Structure analysis: 2026-03-24*
