# Architecture

**Analysis Date:** 2026-03-08

## Pattern Overview

**Overall:** Event-driven monorepo with a linear pipeline: Tablet (React SPA) -> ElevenLabs Conversational AI (external WebSocket) -> Custom LLM (via OpenRouter) -> Cloud Backend (Hono REST API) -> Supabase (PostgreSQL) -> Printer Bridge (local Node.js service) -> ESC/POS Thermal Printer

**Key Characteristics:**
- Monorepo with pnpm workspaces: 3 apps + 3 packages (shared, karaoke-reader, core)
- State machine-driven UI (explicit reducer, not a library)
- Shared types package (`@meinungeheuer/shared`) is the single source of truth for DB schemas, Zod validators, and constants
- Fire-and-forget pattern for non-critical operations (embeddings, TTS cache writes, transcript persistence)
- Dual persistence paths: tablet writes directly to Supabase (anon key), backend writes via service role key (webhook flow)
- Realtime-driven print pipeline: backend INSERT into `print_queue` -> Supabase Realtime -> printer bridge picks up the job

## Layers

**Presentation Layer (Tablet):**
- Purpose: Visitor-facing React SPA running in kiosk mode on a tablet browser
- Location: `apps/tablet/src/`
- Contains: Screen components, state machine, ElevenLabs conversation hook, face detection, admin dashboard
- Depends on: `@meinungeheuer/shared` (types, constants, Supabase client factory), `karaoke-reader` (TTS text highlighting), ElevenLabs SDK (`@11labs/react`), Supabase JS client (direct writes)
- Used by: Visitors and operators (admin mode via `?admin=true`)

**API Layer (Backend):**
- Purpose: REST API for config, session management, webhook handling, chain state, embeddings
- Location: `apps/backend/src/`
- Contains: Hono route handlers, service modules (Supabase, chain, embeddings)
- Depends on: `@meinungeheuer/shared` (types, Supabase client factory), Hono framework, OpenAI SDK (via OpenRouter for embeddings)
- Used by: Tablet (config fetch, session start), ElevenLabs (webhook callbacks), Admin dashboard

**Print Bridge (Printer Bridge):**
- Purpose: Local service that listens for print jobs via Supabase Realtime and relays them to a POS thermal printer server
- Location: `apps/printer-bridge/src/`
- Contains: Realtime subscription, job processor, HTTP relay to POS server
- Depends on: `@meinungeheuer/shared` (types, Supabase client factory)
- Used by: Triggered by Supabase Realtime INSERT events on `print_queue`

**Shared Types (Package):**
- Purpose: Single source of truth for TypeScript types, Zod schemas, constants, and typed Supabase client factory
- Location: `packages/shared/src/`
- Contains: `types.ts` (all DB table schemas + insert variants + payload shapes), `constants.ts` (timers, thresholds), `supabase.ts` (typed client factory with full Database interface)
- Depends on: `@supabase/supabase-js`, `zod`
- Used by: All three apps import from `@meinungeheuer/shared`

**Karaoke Reader (Package):**
- Purpose: Standalone, publishable React component library for word-by-word text highlighting synced to audio playback
- Location: `packages/karaoke-reader/src/`
- Contains: `KaraokeReader` component, `useKaraokeReader` / `useAudioSync` / `useAutoScroll` hooks, ElevenLabs TTS adapter, text chunking/timestamp utilities, cache adapters (memory, localStorage)
- Depends on: React (peer dep)
- Used by: Tablet's `TextReader` component via `import { KaraokeReader } from 'karaoke-reader'`

## Data Flow

**Main Visitor Flow (Mode A: text_term):**

1. Tablet boots -> fetches config from `GET /api/config` (backend reads `installation_config` + `texts` from Supabase)
2. State machine starts at `sleep` -> auto-wakes to `welcome` -> transitions to `text_display`
3. `TextDisplayScreen` renders `TextReader` which uses `karaoke-reader/elevenlabs` adapter to fetch TTS audio+timestamps from ElevenLabs API (with Supabase-backed cache)
4. `KaraokeReader` component plays audio with word-by-word highlighting; on complete -> dispatches `READY` -> state transitions to `conversation`
5. `App` starts ElevenLabs conversation session via `useConversation` hook with dynamic system prompt (built by `buildSystemPrompt()`)
6. ElevenLabs SDK handles STT + LLM + TTS over WebSocket; transcript displayed in `ConversationScreen`
7. AI agent calls `save_definition` tool -> received by client tool handler in `useConversation` AND by webhook `POST /webhook/definition` on backend
8. Client-side: dispatches `DEFINITION_RECEIVED` -> state to `synthesizing` -> `definition` -> `printing` -> `farewell`
9. Backend webhook: saves definition to Supabase `definitions` table, inserts `print_queue` job, advances chain (Mode C), fire-and-forget embedding generation
10. Printer bridge picks up `print_queue` INSERT via Supabase Realtime, claims job, POSTs to POS server, marks done

**Definition Persistence (Dual Path):**

1. **Client-side (immediate):** `persistDefinition()` in `apps/tablet/src/lib/persist.ts` inserts directly to Supabase `definitions` table using anon key. Handles duplicate (23505 error code) gracefully since webhook may also insert.
2. **Server-side (webhook):** `POST /webhook/definition` inserts via service role key, also handles session creation, print queue insertion, chain advancement, and embedding generation.

**State Management:**
- Tablet state is a single `useReducer`-based state machine in `apps/tablet/src/hooks/useInstallationMachine.ts`
- 9 screens: `sleep` -> `welcome` -> `text_display` -> `term_prompt` -> `conversation` -> `synthesizing` -> `definition` -> `printing` -> `farewell`
- Actions are explicit discriminated unions (`InstallationAction`). Screen transitions are guarded: each action only fires from the expected screen.
- No external state management library (no Redux, Zustand, etc.)
- Conversation state (transcript, connection status) is managed by `useConversation` hook wrapping `@11labs/react`'s `useConversation`

## Key Abstractions

**Installation State Machine:**
- Purpose: Controls the entire visitor journey through 9 sequential screens
- File: `apps/tablet/src/hooks/useInstallationMachine.ts`
- Pattern: `useReducer` with typed actions and guarded transitions. Each `case` checks `state.screen` before allowing transition.
- State shape: `InstallationState` holds screen, mode, term, contextText, definition, language, sessionId

**ElevenLabs Conversation Wrapper:**
- Purpose: Wraps the ElevenLabs SDK's `useConversation` hook, adding role mapping (user/ai -> visitor/agent), transcript accumulation, system prompt injection, and client-side tool handling for `save_definition`
- File: `apps/tablet/src/hooks/useConversation.ts`
- Pattern: Composition hook. Builds system prompt dynamically from `apps/tablet/src/lib/systemPrompt.ts` and first message from `apps/tablet/src/lib/firstMessage.ts`. Injects both into ElevenLabs session via `overrides` at start time.

**Supabase Client Factory:**
- Purpose: Provides a fully typed Supabase client with the entire `Database` interface
- File: `packages/shared/src/supabase.ts`
- Pattern: `createSupabaseClient(url, key)` returns `SupabaseClient<Database>`. Backend uses service role key (bypasses RLS). Tablet uses anon key. Printer bridge uses either.

**Zod Schema / Type System:**
- Purpose: Runtime validation at all API boundaries, shared type definitions for all DB tables
- File: `packages/shared/src/types.ts`
- Pattern: Each DB table has a full Zod schema (e.g., `SessionSchema`), an inferred TypeScript type (e.g., `Session`), and an insert variant (e.g., `InsertSessionSchema` omitting `id`, `created_at`). API routes validate with `.safeParse()`.

**KaraokeReader Component:**
- Purpose: Renders text with word-by-word karaoke highlighting synced to audio playback
- File: `packages/karaoke-reader/src/components/KaraokeReader.tsx`
- Pattern: Composes `useKaraokeReader` (audio lifecycle + word sync) and `useAutoScroll` (scrolls to active word). Uses direct DOM manipulation via `data-kr-state` attributes for 60fps performance. Supports markdown (headers, strikethrough, lists).

**Cache Adapter Interface:**
- Purpose: Pluggable TTS cache storage
- File: `packages/karaoke-reader/src/types.ts` (interface), `packages/karaoke-reader/src/cache.ts` (memory + localStorage), `apps/tablet/src/lib/supabaseCacheAdapter.ts` (Supabase-backed)
- Pattern: `CacheAdapter` interface with `get(key)` and `set(key, value)`. Implementations never throw. The tablet uses a Supabase adapter backed by the `tts_cache` table.

## Entry Points

**Tablet App:**
- Location: `apps/tablet/src/main.tsx`
- Triggers: Browser loads the SPA (served by nginx in Docker, or Vite dev server)
- Responsibilities: Mounts `<App />` which either renders `<Admin />` (if `?admin=true`) or `<InstallationApp />` (the visitor experience)

**Backend Server:**
- Location: `apps/backend/src/index.ts`
- Triggers: Node.js process start (`tsx watch` in dev, `node dist/index.js` in prod)
- Responsibilities: Creates Hono app from `apps/backend/src/app.ts`, starts HTTP server on port 3001 (configurable via `PORT` env var)

**Printer Bridge:**
- Location: `apps/printer-bridge/src/index.ts`
- Triggers: Node.js process start, runs continuously on a local machine near the printer
- Responsibilities: Drains pre-existing pending jobs, subscribes to Supabase Realtime for new `print_queue` INSERTs, processes each job by POSTing to POS server

**Backend Route Definitions:**
- `apps/backend/src/app.ts`: Mounts route groups: `/webhook` (ElevenLabs webhooks), `/api/session` (session management), `/api/config` (config + definitions + chain)
- `apps/backend/src/routes/webhook.ts`: `POST /webhook/definition`, `POST /webhook/conversation-data`
- `apps/backend/src/routes/session.ts`: `POST /api/session/start`
- `apps/backend/src/routes/config.ts`: `GET /api/config`, `POST /api/config/update`, `GET /api/definitions`, `GET /api/chain`

## Error Handling

**Strategy:** Never crash long-running services. Catch, log, continue. Non-critical failures are fire-and-forget.

**Patterns:**
- **Backend webhook:** Each step (session lookup, definition insert, print queue insert, chain advance, embedding) is individually try/caught. A failure in one step does not prevent the next. Print queue insert failure is logged but does not fail the webhook response.
- **Tablet persistence:** `persistDefinition()` and `persistTranscript()` in `apps/tablet/src/lib/persist.ts` are fire-and-forget (`void persistDefinition(...)`) -- errors logged, never block UI.
- **Printer bridge:** `processJob()` never throws. Claim failures, validation failures, and print failures are all caught and logged. Job status updated to `error` in Supabase.
- **Cache adapters:** All cache implementations swallow errors. `get()` returns null on failure. `set()` is fire-and-forget.
- **ElevenLabs conversation:** `startConversation().catch()` and `endConversation().catch()` are caught at the call site in `App.tsx`. Connection errors logged via `onError` callback.
- **Face detection:** Camera permission denial logs a warning and renders nothing. The tap-to-start fallback on SleepScreen remains functional.
- **Zod validation:** API routes use `.safeParse()` and return 400 with structured error details on validation failure.

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.warn` / `console.error` everywhere with bracketed prefixes: `[App]`, `[bridge]`, `[webhook/definition]`, `[chain]`, `[embeddings]`, `[MeinUngeheuer]`, `[Persist]`, `[TTS Cache]`. No external logging framework.

**Validation:** Zod schemas at all API boundaries. Request bodies validated with `.safeParse()` in webhook and session routes. Config responses validated client-side in `apps/tablet/src/lib/api.ts`. Print payloads validated in printer bridge before processing.

**Authentication:**
- Webhook routes: Protected by `WEBHOOK_SECRET` (query param or Bearer token). Skipped in dev (no secret configured).
- Admin config mutation: Same `WEBHOOK_SECRET` via `adminMiddleware` in `apps/backend/src/routes/config.ts`.
- Supabase: Backend uses service role key (full access, bypasses RLS). Tablet uses anon key with RLS policies.
- ElevenLabs: Agent ID passed as config, API key for TTS via `VITE_ELEVENLABS_API_KEY` (client-side).

**Three Operating Modes:**
- **Mode A (text_term):** Visitor reads a text -> karaoke highlighting -> AI conversation about the text -> aphorism emerges from conversation (not predefined)
- **Mode B (term_only):** A predefined term is shown -> AI conversation about the term -> definition produced
- **Mode C (chain):** Previous visitor's definition is the starting text -> AI picks a concept -> conversation -> new definition -> becomes next visitor's context. Chain state managed in `chain_state` table.

---

*Architecture analysis: 2026-03-08*
