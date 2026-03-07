# MeinUngeheuer Directory & File Structure

## Monorepo Layout

```
/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/
├── .claude/                         # Claude Code configuration & memory
├── .git/                            # Git repository
├── .planning/                       # Planning documents (this folder)
│   └── codebase/                    # Architecture & structure docs
├── apps/                            # Monorepo workspaces (pnpm)
│   ├── backend/                     # Hono server
│   ├── printer-bridge/              # Local printer service
│   └── tablet/                      # React web app
├── packages/                        # Shared libraries
│   ├── core/                        # (unused in current version)
│   └── shared/                      # Types, constants, Supabase client
├── supabase/                        # Database migrations
│   └── migrations/                  # SQL migration files
├── docs/                            # Project documentation
│   ├── PRD.md                       # Product requirements
│   ├── PROMPTS.md                   # Agent build specifications
│   └── SOCRATIC-AGENT-RESEARCH.md   # Background research
├── CLAUDE.md                        # Claude Code project instructions
├── package.json                     # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml              # Workspace configuration
├── tsconfig.base.json               # Base TypeScript config
└── README.md                        # Project overview
```

---

## Workspace Details

### apps/tablet — React Kiosk App

**Purpose**: Browser-based visitor interface for text reading, voice conversation, and definition display.

**Location**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/`

**Entry point**: `src/main.tsx` → React 18 mount to DOM

**Build**: Vite, runs on port 3000 (`pnpm dev:tablet`)

**Package config**: `package.json`
- Dependencies: React 18, ElevenLabs SDK (`@11labs/react`), Supabase JS, MediaPipe, Tailwind v4
- Build command: `vite build`
- TypeScript: strict mode via base config

**Directory structure**:

```
apps/tablet/
├── public/                          # Static assets (favicon, etc.)
├── src/
│   ├── main.tsx                     # React entry point
│   ├── App.tsx                      # Main component (routing: admin check)
│   │
│   ├── components/                  # React components
│   │   ├── CameraDetector.tsx       # MediaPipe face detection overlay
│   │   ├── ScreenTransition.tsx     # Animated screen transitions
│   │   ├── TextReader.tsx           # Karaoke text reader (word highlight sync)
│   │   └── screens/                 # 9 screen components
│   │       ├── SleepScreen.tsx      # Idle state (face/tap detection)
│   │       ├── WelcomeScreen.tsx    # Welcome message (3s timer)
│   │       ├── TextDisplayScreen.tsx # Text display with TTS sync
│   │       ├── TermPromptScreen.tsx # Show term (Mode B/C)
│   │       ├── ConversationScreen.tsx # Live conversation UI
│   │       ├── SynthesizingScreen.tsx # Waiting for definition
│   │       ├── DefinitionScreen.tsx # Display definition result
│   │       ├── PrintingScreen.tsx   # Print confirmation
│   │       └── FarewellScreen.tsx   # Goodbye (15s timer)
│   │
│   ├── hooks/                       # React hooks
│   │   ├── useInstallationMachine.ts # Central state machine (useReducer)
│   │   ├── useInstallationMachine.test.ts # Tests for state transitions
│   │   ├── useConversation.ts       # ElevenLabs SDK wrapper
│   │   ├── useFaceDetection.ts      # MediaPipe integration
│   │   └── useTextToSpeechWithTimestamps.ts # TTS→word-level sync
│   │
│   ├── lib/                         # Utility functions & API
│   │   ├── systemPrompt.ts          # Build EL system prompt (mode-specific)
│   │   ├── firstMessage.ts          # Build opening message
│   │   ├── api.ts                   # Fetch config from backend
│   │   ├── supabase.ts              # Supabase client instance
│   │   ├── persist.ts               # Save definition & transcript to DB
│   │   ├── ttsCache.ts              # Cache layer for TTS audio
│   │   └── fullscreen.ts            # Kiosk mode helpers
│   │
│   ├── pages/                       # Full-page components
│   │   └── Admin.tsx                # Admin dashboard (mode/term/text management)
│   │
│   ├── vite-env.d.ts                # Vite environment types
│   └── index.css                    # Tailwind v4 directives
│
├── index.html                       # HTML entry point
├── vite.config.ts                   # Vite configuration
├── tsconfig.json                    # TypeScript config (extends base)
├── package.json                     # App-specific dependencies
├── .env.example                     # Environment variable template
└── .env                             # (local; not committed)
```

**Key files**:
- `src/App.tsx`: Router; checks `?admin=true` URL param
- `src/hooks/useInstallationMachine.ts`: 9-screen state machine (9 screens, 12 action types)
- `src/hooks/useConversation.ts`: ElevenLabs SDK integration
- `src/lib/systemPrompt.ts`: Dynamic system prompt builder (mode-specific logic)
- `src/components/screens/*`: Screen renderers (pure, no state — all state comes from parent)

**Styling**: Tailwind CSS v4 (CSS-first, no modules)

**Testing**: Vitest, tests next to source (`useInstallationMachine.test.ts`)

---

### apps/backend — Hono REST API Server

**Purpose**: Webhooks, config management, chain state, definition storage, print queue orchestration.

**Location**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/backend/`

**Entry point**: `src/index.ts` → Hono server on port 3001

**Build**: TypeScript → JavaScript; `pnpm build` outputs to `dist/`

**Package config**: `package.json`
- Dependencies: Hono, @hono/node-server, Supabase JS, OpenAI (embeddings), Zod
- Dev command: `tsx watch --env-file=.env src/index.ts`
- Build command: `tsc`
- Start command: `node dist/index.js`

**Directory structure**:

```
apps/backend/
├── src/
│   ├── index.ts                     # Server bootstrap (loads .env, starts Hono)
│   ├── app.ts                       # Hono app definition (middleware, route mounts)
│   │
│   ├── routes/                      # Route handlers
│   │   ├── webhook.ts               # POST /webhook/definition (EL agent tool calls)
│   │   ├── config.ts                # GET /api/config, POST /api/config/update, etc.
│   │   └── session.ts               # (if needed) Session lifecycle
│   │
│   └── services/                    # Business logic
│       ├── supabase.ts              # Supabase client singleton + helper queries
│       ├── embeddings.ts            # generateEmbedding(text) → OpenAI
│       └── chain.ts                 # getActiveChainContext(), advanceChain()
│
├── dist/                            # Compiled JavaScript (generated by tsc)
├── tsconfig.json                    # TypeScript config (extends base)
├── package.json                     # App-specific dependencies
├── .env.example                     # Environment variable template
├── .env                             # (local; not committed)
└── vercel.json                      # Vercel deployment config (if deployed)
```

**Key files**:
- `src/app.ts`: Hono app + middleware (CORS, logging); route mounts
- `src/routes/webhook.ts`: `POST /webhook/definition` — receives tool call from EL agent
  - Validates body (Zod)
  - Saves to definitions table
  - Async: generates embedding, advances chain, creates print job
- `src/routes/config.ts`: `GET /api/config` — tablet startup fetch
  - Returns current mode, term, text content, chain context
- `src/services/supabase.ts`: Supabase client + helper functions (getLatestDefinition, etc.)
- `src/services/embeddings.ts`: Calls OpenAI to generate pgvector embedding
- `src/services/chain.ts`: Chain state logic (query active context, increment depth)

**Error handling**: No crashes; all errors caught, logged, HTTP error responses returned

**Authentication**: Webhook & config endpoints optionally protected by `WEBHOOK_SECRET` (query param or Bearer token)

---

### apps/printer-bridge — Local Thermal Printer Service

**Purpose**: Subscribes to print_queue jobs, formats ESC/POS, sends to local USB/serial printer.

**Location**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/printer-bridge/`

**Entry point**: `src/index.ts` → Node.js standalone service

**Build**: TypeScript → JavaScript; runs via `pnpm dev:printer` (tsx watch) or `node dist/index.js`

**Package config**: `package.json`
- Dependencies: Supabase JS, Zod, `usb` (USB printer), `serialport` (serial printer), ESC/POS utilities
- Dev command: `tsx watch --env-file=.env src/index.ts`
- Build command: `tsc`

**Directory structure**:

```
apps/printer-bridge/
├── src/
│   ├── index.ts                     # Main orchestrator (config, connection, Realtime loop)
│   ├── config.ts                    # Load config from .env (connection, paper width)
│   ├── printer.ts                   # Low-level printer I/O (USB, serial, mock)
│   ├── printer.test.ts              # (if tests exist)
│   ├── layout.ts                    # ESC/POS command builder (formatting, text wrapping)
│   ├── layout.test.ts               # Unit tests for layout engine
│   └── test-print.ts                # Manual test script (if used)
│
├── dist/                            # Compiled JavaScript (generated by tsc)
├── tsconfig.json                    # TypeScript config (extends base)
├── package.json                     # App-specific dependencies
├── .env.example                     # Environment variable template
└── .env                             # (local; not committed)
```

**Key files**:
- `src/index.ts`: Main loop
  - Boots config & printer connection
  - Subscribes to Supabase Realtime: `print_queue where status='pending'`
  - On job: claim → validate → format → print → update status
  - Heartbeat: every 30s, check printer, reconnect if needed
  - Graceful shutdown on SIGINT/SIGTERM
- `src/printer.ts`: I/O abstraction
  - `createPrinter(config)`: USB or serial connection
  - `printCard(handle, escCommands)`: Send bytes to printer
  - `getStatus(handle)`: Check connectivity
  - `reconnect(handle, attempts, delay)`: Exponential backoff
- `src/layout.ts`: ESC/POS formatting
  - `formatDefinitionCard(definition, config)`: Build command array
  - Text wrapping, centering, bold, underline, line breaks
  - Paper width: 58mm (32 chars) or 80mm (48 chars)
- `src/config.ts`: Load from `.env`
  - Connection string (USB port, serial port, or mock mode)
  - Paper width, max char width
  - Printer vendor (Epson, Star, etc.)

**Error resilience**: Never crashes; all errors caught, logged, marked in DB

---

### packages/shared — Shared Types & Utilities

**Purpose**: Centralized types, constants, and Supabase client factory. Used by all apps.

**Location**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/packages/shared/`

**Build**: TypeScript → JavaScript; `pnpm build` outputs to `dist/`

**Package config**: `package.json`
- Type: `module` (ESM)
- Main export: `./dist/index.js`
- Exports via `package.json` `"exports"` field (modern)
- Dependencies: Supabase JS, Zod
- Build command: `tsc`

**Directory structure**:

```
packages/shared/
├── src/
│   ├── index.ts                     # Main export (re-exports from below)
│   ├── types.ts                     # Zod schemas + TypeScript types
│   ├── constants.ts                 # App-wide constants (timers, defaults)
│   ├── supabase.ts                  # createSupabaseClient(url, key)
│   └── (other utilities as needed)
│
├── dist/                            # Compiled JavaScript (generated by tsc)
├── tsconfig.json                    # TypeScript config (extends base)
└── package.json
```

**Key exports**:

**types.ts**:
```typescript
// Schemas
export const ModeSchema = z.enum(['text_term', 'term_only', 'chain']);
export const StateNameSchema = z.enum(['sleep', 'welcome', ..., 'farewell']);
export const RoleSchema = z.enum(['visitor', 'agent']);
export const PrintStatusSchema = z.enum(['pending', 'printing', 'done', 'error']);

// Table schemas (mirror SQL exactly)
export const SessionSchema = z.object({ ... });
export const TurnSchema = z.object({ ... });
export const DefinitionSchema = z.object({ ... });
export const PrintQueueRowSchema = z.object({ ... });
export const TextSchema = z.object({ ... });
export const TTSCacheRowSchema = z.object({ ... });

// TypeScript types (inferred from Zod)
export type Mode = z.infer<typeof ModeSchema>;
export type StateName = z.infer<typeof StateNameSchema>;
export type Session = z.infer<typeof SessionSchema>;
// ... etc.

// Insert variants (omit id, created_at for DB writes)
export type SessionInsert = Omit<Session, 'id' | 'created_at'>;
export type DefinitionInsert = Omit<Definition, 'id' | 'created_at'>;
// ... etc.
```

**constants.ts**:
```typescript
export const DEFAULT_TERM = 'KREATIVITÄT';
export const DEFAULT_MODE = 'text_term';

export const FACE_DETECTION = {
  WAKE_THRESHOLD_MS: 3000,
  SLEEP_THRESHOLD_MS: 30000,
  // ...
};

export const TIMERS = {
  WELCOME_DURATION_MS: 3000,
  // ...
};

export const PRINTER = {
  HEARTBEAT_INTERVAL_MS: 30000,
  // ...
};
```

**supabase.ts**:
```typescript
export function createSupabaseClient(url: string, key: string): SupabaseClient {
  // Factory function used by tablet, backend, printer-bridge
}
```

**Import pattern** (all apps):
```typescript
import { Mode, Definition, createSupabaseClient } from '@meinungeheuer/shared';
```

---

## Database Schema (supabase/migrations/)

**Location**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/supabase/migrations/`

**Files**:
1. `001_extensions.sql` — Enable pgvector, uuid, etc.
2. `002_tables.sql` — Create all tables (installation_config, sessions, turns, definitions, print_queue, texts, tts_cache)
3. `003_indexes.sql` — Create indexes (composite, pgvector)
4. `004_rls.sql` — Row-level security policies
5. `005_seed.sql` — Initial config row
6. `006_kreativitaetsrant_and_tts_cache.sql` — Seeded texts (Kleist essay, Kreativitätsrant)
7. `007_anon_insert_definitions.sql` — Grant anon INSERT on definitions

**Tables** (detailed in ARCHITECTURE.md):
- `installation_config`: mode, active_term, active_text_id (single row, mutable by admin)
- `sessions`: visitor journey metadata
- `turns`: conversation lines (visitor/agent)
- `definitions`: distilled term + definition + embedding
- `print_queue`: printer jobs (status: pending → printing → done/error)
- `texts`: seeded content (Kleist, Kreativitätsrant, etc.)
- `tts_cache`: cached TTS audio (SHA-256 keyed)

---

## Key File Locations Quick Reference

### Tablet
| File | Purpose |
|------|---------|
| `apps/tablet/src/main.tsx` | React entry point |
| `apps/tablet/src/App.tsx` | Main app component & router |
| `apps/tablet/src/hooks/useInstallationMachine.ts` | Central state machine (9 screens) |
| `apps/tablet/src/hooks/useConversation.ts` | ElevenLabs SDK wrapper |
| `apps/tablet/src/lib/systemPrompt.ts` | System prompt builder (mode-specific) |
| `apps/tablet/src/lib/persist.ts` | Save definition & transcript |
| `apps/tablet/src/components/screens/*.tsx` | 9 screen components |
| `apps/tablet/src/components/TextReader.tsx` | Karaoke text with TTS sync |

### Backend
| File | Purpose |
|------|---------|
| `apps/backend/src/index.ts` | Server bootstrap |
| `apps/backend/src/app.ts` | Hono app & middleware |
| `apps/backend/src/routes/webhook.ts` | `POST /webhook/definition` |
| `apps/backend/src/routes/config.ts` | Config endpoints |
| `apps/backend/src/services/supabase.ts` | DB client & helpers |
| `apps/backend/src/services/embeddings.ts` | OpenAI embedding generation |
| `apps/backend/src/services/chain.ts` | Chain state logic |

### Printer Bridge
| File | Purpose |
|------|---------|
| `apps/printer-bridge/src/index.ts` | Main orchestrator |
| `apps/printer-bridge/src/printer.ts` | Low-level I/O (USB, serial) |
| `apps/printer-bridge/src/layout.ts` | ESC/POS formatting |
| `apps/printer-bridge/src/config.ts` | Config loading |

### Shared
| File | Purpose |
|------|---------|
| `packages/shared/src/types.ts` | All Zod schemas & types |
| `packages/shared/src/constants.ts` | App-wide constants |
| `packages/shared/src/supabase.ts` | Supabase client factory |

### Database
| File | Purpose |
|------|---------|
| `supabase/migrations/002_tables.sql` | Table definitions |
| `supabase/migrations/003_indexes.sql` | Indexes (composite, pgvector) |
| `supabase/migrations/004_rls.sql` | Row-level security |
| `supabase/migrations/005_seed.sql` | Initial installation_config |

### Documentation
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Claude Code project instructions |
| `README.md` | Project overview |
| `docs/PRD.md` | Product requirements |
| `docs/PROMPTS.md` | Agent build specifications |

---

## Naming Conventions

### React Components
- **Screen components**: `/components/screens/{StateName}Screen.tsx`
  - Example: `TextDisplayScreen.tsx` (renders the text_display state)
  - Always match the state name (e.g., conversation → ConversationScreen)
- **Utility components**: `/components/{Name}.tsx` (lowercase first letter if internal)
  - Example: `CameraDetector.tsx`, `ScreenTransition.tsx`
- **Component exports**: Named exports, named same as filename
  ```typescript
  // TextDisplayScreen.tsx
  export function TextDisplayScreen(props: Props) { ... }
  ```

### Hooks
- File: `/hooks/use{Name}.ts`
- Export: `export function use{Name}(params) { ... }`
- Example: `useInstallationMachine.ts` exports `useInstallationMachine()`

### Styles
- Tailwind v4 (CSS-first); all styles inline via `className=`
- No CSS modules, no styled-components
- Global CSS in `index.css` (Tailwind directives)

### Types
- All in `packages/shared/src/types.ts`
- Zod schemas + TypeScript inferred types
- Naming: Base type (e.g., Definition), Insert variant (DefinitionInsert)
- Example:
  ```typescript
  export const DefinitionSchema = z.object({ ... });
  export type Definition = z.infer<typeof DefinitionSchema>;
  export type DefinitionInsert = Omit<Definition, 'id' | 'created_at'>;
  ```

### Constants
- File: `/lib/constants.ts` or `packages/shared/src/constants.ts`
- UPPERCASE_SNAKE_CASE for primitives
- camelCase for objects
- Example:
  ```typescript
  export const DEFAULT_TERM = 'KREATIVITÄT';
  export const FACE_DETECTION = { ... };
  ```

### Database Tables
- snake_case (SQL convention)
- Example: `installation_config`, `print_queue`, `tts_cache`

### Zod Schemas
- File: `packages/shared/src/types.ts`
- Naming: `{EntityName}Schema` and `{EntityName}InsertSchema`
- Example: `SessionSchema`, `DefinitionInsertSchema`

### State Machine
- States: snake_case (StateNameSchema enum values: 'sleep', 'welcome', 'text_display', etc.)
- Actions: UPPERCASE (e.g., `SET_CONFIG`, `DEFINITION_RECEIVED`, `FACE_LOST`)
- Example:
  ```typescript
  export type InstallationAction =
    | { type: 'WAKE' }
    | { type: 'SET_CONFIG'; mode: Mode; ... }
    | { type: 'DEFINITION_RECEIVED'; definition: Definition };
  ```

### Routes (Backend)
- REST routes follow REST conventions
- Example:
  - `GET /api/config` — fetch current config
  - `POST /api/config/update` — update config (admin-only)
  - `GET /api/definitions?term=...` — query definitions
  - `POST /webhook/definition` — EL agent tool call

### Environment Variables
- Tablet: `VITE_` prefix (Vite build-time substitution)
  - `VITE_BACKEND_URL`, `VITE_ELEVENLABS_AGENT_ID`, `VITE_SUPABASE_URL`
- Backend: No prefix (loaded via tsx --env-file=.env)
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_SECRET`, `OPENAI_API_KEY`
- Printer: No prefix
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PRINTER_PORT`, `PAPER_WIDTH_MM`

### Import Paths
- Shared exports: `import { ... } from '@meinungeheuer/shared'`
- Relative imports: Use relative paths within same app (e.g., `../hooks/useConversation`)
- Absolute paths: Use `@meinungeheuer/` for workspace packages

---

## Testing

**Framework**: Vitest (all apps)

**Location**: Tests next to source files (`.test.ts` suffix)

**Examples**:
- `apps/tablet/src/hooks/useInstallationMachine.test.ts` — State machine transitions
- `apps/printer-bridge/src/layout.test.ts` — ESC/POS formatting

**Commands**:
```bash
pnpm test                  # Run all tests
pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts  # Single file
pnpm --filter @meinungeheuer/tablet exec vitest src/hooks/useInstallationMachine.test.ts     # Watch mode
```

---

## Build Artifacts

After `pnpm build`:

**Shared** (`packages/shared/dist/`):
- `index.js` — ESM module
- `index.d.ts` — TypeScript declarations
- Source maps

**Tablet** (`apps/tablet/dist/`):
- `index.html` — Entry point
- `assets/` — JS & CSS bundles (hashed)
- Static assets (fonts, images)

**Backend** (`apps/backend/dist/`):
- `index.js` — Main entry point
- `*.js` files for each `.ts` source
- Source maps

**Printer Bridge** (`apps/printer-bridge/dist/`):
- `index.js` — Main entry point
- `*.js` files for each `.ts` source

---

## Deployment Targets

- **Tablet**: Docker → Nginx SPA (Coolify, Vercel, or custom)
- **Backend**: Vercel (via `vercel.json`)
- **Printer Bridge**: Local machine only (not deployed to cloud; runs on Pi/laptop near printer)

---

## Summary

MeinUngeheuer is a well-structured monorepo with clear separation of concerns:
- **Tablet**: React UI (state machine-driven)
- **Backend**: REST API + webhook receiver
- **Printer Bridge**: Event-driven local service
- **Shared**: Centralized types & utilities

All code is TypeScript strict; data flow is unidirectional (tablet → backend → Supabase ← printer bridge). No global state managers; single reducer per service.
