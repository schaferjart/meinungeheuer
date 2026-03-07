# MeinUngeheuer Architecture

## System Overview

MeinUngeheuer is a distributed art installation system that orchestrates voice conversations between visitors and an AI agent, distilling their dialogue into personalized glossary definitions printed on thermal cards.

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          VISITOR                                │
│                    (Tablet Kiosk Mode)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              1. Reads text with karaoke TTS
              2. Taps to start conversation
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TABLET (React/Vite)                          │
│  • useInstallationMachine: 9-screen state machine               │
│  • useConversation: ElevenLabs Conversational AI SDK            │
│  • useTextToSpeechWithTimestamps: TTS → word-level sync         │
│  • useFaceDetection: MediaPipe for auto-wake/sleep              │
│  • Screens: Welcome → TextDisplay → TermPrompt → Conversation   │
│            → Synthesizing → Definition → Printing → Farewell    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          WebSocket (STT + LLM + TTS combined)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ELEVENLABS CONVERSATIONAL AI                   │
│  • Agent ID from .env (VITE_ELEVENLABS_AGENT_ID)               │
│  • Handles: speech-to-text, LLM inference, text-to-speech      │
│  • System prompt injected per-session from tablet               │
│  • Calls save_definition tool when concept is crystallized      │
│  • Custom LLM: google/gemini-2.0-flash-001 via OpenRouter      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          HTTP POST tool call webhook (save_definition)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Hono Server)                        │
│  Routes:                                                         │
│  • POST /webhook/definition: Receives definition from EL agent  │
│    → saves to Supabase.definitions                             │
│    → generates embedding (async via OpenAI)                     │
│    → advances chain (if Mode C)                                │
│    → creates print_queue job                                   │
│  • GET  /api/config: Returns installation config & mode        │
│  • GET  /api/definitions: Query definitions by term            │
│  • GET  /api/chain: Retrieve chain context for next visitor    │
│  • POST /api/session: Create/end sessions                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          Realtime subscriptions + REST queries
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL + pgvector)            │
│  Tables:                                                         │
│  • installation_config: mode, active_term, active_text_id      │
│  • sessions: visitor journey metadata (duration, turns, etc.)   │
│  • turns: individual conversation messages (visitor/agent)      │
│  • definitions: distilled term + definition + embedding         │
│  • print_queue: jobs for printer bridge (status: pending→done)  │
│  • texts: seeded content (Kleist, Kreativitätsrant, Netzwerke) │
│  • tts_cache: cached TTS audio keyed by SHA-256(text+voiceId)   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          Realtime INSERT subscription on print_queue
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              PRINTER BRIDGE (Node.js Local Service)             │
│  • Subscribes to Supabase Realtime print_queue insertions      │
│  • On new job: claim → validate payload → format ESC/POS       │
│  • Layouts definition & metadata on thermal paper              │
│  • Sends raw bytes to local USB/serial printer                 │
│  • Updates status: pending → printing → done / error           │
│  • Heartbeat: checks printer connectivity every 30s            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ESC/POS thermal printer (58mm or 80mm paper)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VISITOR RECEIVES CARD                        │
│  Printed definition, citations, session metadata, term          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Detail

### Mode A (text_term) — Default

1. **Tablet startup**: Fetches config from backend; discovers active text (Kleist essay)
2. **Welcome screen**: Auto-wake via face detection or tap
3. **Text display**: User reads highlighted text; TTS synced via `useTextToSpeechWithTimestamps`
   - ElevenLabs TTS-with-timestamps API returns character-level timing
   - Converted to word-level timing in `useTextToSpeechWithTimestamps.ts`
   - Highlight position updated every animation frame
4. **Conversation**: User taps screen; ElevenLabs agent opens WebSocket
   - System prompt injected: asks visitor what stayed with them in the text
   - Agent does NOT have a predefined term; concept emerges from dialogue
   - Agent listens for the thread with energy, follows it, finds tension
5. **Definition extraction**: When concept crystallizes, agent calls `save_definition` tool
   - Tool call webhook sent to backend: `POST /webhook/definition`
   - Backend validates, saves to `definitions` table, generates embedding
6. **Print queue**: Backend creates job in `print_queue` table (status: pending)
7. **Printer bridge**: Realtime subscription triggers; picks up job, claims it, formats & prints
8. **Farewell**: Tablet displays farewell screen (15s), returns to sleep

### Mode B (term_only) — Predefined Term

1. Tablet displays naked term (e.g., "BIRD")
2. Skips text display entirely
3. Agent receives predefined term in system prompt; guides conversation around that term
4. Definition saved; printed; same flow as Mode A from step 5 onwards

### Mode C (chain) — Exquisite Corpse

1. Backend queries `definitions` where `chain_depth` is highest
2. Tablet receives previous visitor's definition as context text
3. System prompt tells agent: "This is the previous visitor's understanding; ask THIS visitor what they would build on this"
4. New definition saved with `chain_depth = previous.chain_depth + 1`
5. Chain continues; later visitor sees this new definition as their context
6. Same print flow; metadata shows position in chain

---

## Layers & Abstractions

### 1. **Presentation Layer (Tablet)**

**Entry point**: `apps/tablet/src/main.tsx` → `App.tsx`

Components:
- `App.tsx`: Main router (admin check); delegates to `InstallationApp`
- `ScreenTransition.tsx`: Animated transitions between screen states
- `CameraDetector.tsx`: MediaPipe face detection (always mounted, zero-size video element)
- Screen components in `components/screens/`:
  - `SleepScreen.tsx`: Waiting for face/tap
  - `WelcomeScreen.tsx`: 3-second welcome message
  - `TextDisplayScreen.tsx`: Karaoke text reader
  - `TermPromptScreen.tsx`: Show term (Mode B/C only)
  - `ConversationScreen.tsx`: Live conversation with transcript
  - `SynthesizingScreen.tsx`: Waiting for definition
  - `DefinitionScreen.tsx`: Display synthesized definition
  - `PrintingScreen.tsx`: Waiting for print confirmation
  - `FarewellScreen.tsx`: Goodbye message

**Hooks** (in `hooks/`):
- `useInstallationMachine.ts`: Central state machine (useReducer)
  - 9 states: sleep → welcome → text_display → term_prompt → conversation → synthesizing → definition → printing → farewell
  - 12 actions: WAKE, TIMER_*, READY, DEFINITION_RECEIVED, FACE_LOST, SET_CONFIG, SET_SESSION_ID, SET_LANGUAGE, RESET
  - Single reducer function; no external state managers
- `useConversation.ts`: ElevenLabs SDK wrapper
  - Maps EL role "user"/"ai" to shared types "visitor"/"agent"
  - Manages WebSocket lifecycle
  - Injects system prompt per session
  - Captures tool calls (save_definition)
  - Builds transcript
- `useFaceDetection.ts`: MediaPipe face detection loop
  - 3-second debounce to wake; 30-second debounce to sleep
  - Fallback: tap-to-start on SleepScreen
- `useTextToSpeechWithTimestamps.ts`: TTS→word-level sync
  - Fetches TTS with timestamps from ElevenLabs API
  - Converts char-level timing to word-level bounding boxes
  - Syncs highlight position via requestAnimationFrame

**Styling**: Tailwind v4 (CSS-first config, no modules, no styled-components)

**Testing**: Vitest in `hooks/useInstallationMachine.test.ts`; core state machine logic covered

---

### 2. **Integration Layer (useConversation → ElevenLabs)**

**File**: `apps/tablet/src/hooks/useConversation.ts`

**Responsibilities**:
- Wraps `@11labs/react` SDK
- Injects system prompt per session (from `systemPrompt.ts`)
- Sends first message (from `firstMessage.ts`)
- Captures agent-initiated tool calls (save_definition)
- Maps EL WebSocket events to app callbacks (onDefinitionReceived, onConversationEnd)
- Maintains transcript in shared type format

**System Prompts**: Dynamic, constructed in `apps/tablet/src/lib/systemPrompt.ts`
- **Mode A (text_term)**: "Discover what is alive in this text for THIS person"
- **Mode B (term_only)**: "Guide conversation around the predefined term"
- **Mode C (chain)**: "Build on the previous visitor's understanding"

**First Message**: From `apps/tablet/src/lib/firstMessage.ts`
- Opens conversation with context (text excerpt or term)
- Language-aware (DE/EN)

---

### 3. **State Management (Tablet)**

**Single Source of Truth**: `useInstallationMachine.ts`

State shape:
```typescript
interface InstallationState {
  screen: StateName; // 'sleep' | 'welcome' | 'text_display' | ... | 'farewell'
  mode: Mode; // 'text_term' | 'term_only' | 'chain'
  term: string; // Active term (e.g., "KREATIVITÄT")
  contextText: string | null; // Text or previous definition
  parentSessionId: string | null; // For chain mode
  sessionId: string | null; // Current visitor session
  definition: Definition | null; // Synthesized result
  conversationId: string | null; // EL session ID
  language: 'de' | 'en'; // Auto-detected or set
}
```

Actions flow:
1. **Config actions** (anytime): `SET_CONFIG`, `SET_SESSION_ID`, `SET_LANGUAGE`, `RESET`
2. **Screen transitions** (sequential): `WAKE` → `TIMER_3S` → `READY` → etc.
3. **Conversation**: `DEFINITION_RECEIVED` (triggered by webhook callback)
4. **Teardown**: `FACE_LOST` (idle timeout → sleep)

---

### 4. **Backend (Hono Server)**

**Entry point**: `apps/backend/src/index.ts` → runs Hono server (port 3001)

**Structure**:
```
apps/backend/src/
├── app.ts              # Hono app + middleware setup
├── index.ts            # Server bootstrap
├── routes/
│   ├── webhook.ts      # POST /webhook/definition (EL agent calls this)
│   ├── config.ts       # GET /api/config, POST /api/config/update, GET /api/definitions
│   └── session.ts      # Session CRUD (if needed)
└── services/
    ├── supabase.ts     # DB client singleton
    ├── embeddings.ts   # Generate embedding via OpenAI
    └── chain.ts        # Get active chain context & advance chain
```

**Webhooks**:
- `POST /webhook/definition` (called by EL agent via tool call):
  1. Receives: term, definition_text, citations, language, conversation_id
  2. Saves to `definitions` table
  3. Async: generates embedding, stores in pgvector column
  4. Async: if Mode C, advances chain (updates chain_depth)
  5. Creates `print_queue` job (status: pending)
  6. Returns success to EL agent

  Authentication: Query param `secret` OR Bearer token (shared secret from `WEBHOOK_SECRET` env)

**Config routes**:
- `GET /api/config`: Returns `{ mode, term, text?, chain_context?, parentSessionId }`
- `POST /api/config/update`: Admin-only; updates mode/term/active_text_id
- `GET /api/definitions`: Query definitions by term (pagination: limit, offset)

**Error handling**: No crashing; all errors caught, logged, HTTP error responses returned

---

### 5. **Data Layer (Supabase)**

**Tables** (in `supabase/migrations/`):

1. **installation_config**
   - Single row; mutable via admin endpoint
   - Fields: `id`, `mode`, `active_term`, `active_text_id`, `updated_at`
   - Tablet queries on startup

2. **sessions**
   - One row per visitor journey
   - Fields: `id`, `created_at`, `ended_at`, `mode`, `term`, `context_text`, `parent_session_id`, `language_detected`, `duration_seconds`, `turn_count`, `card_taken`, `elevenlabs_conversation_id`, `audio_url`
   - Indexed by created_at, parent_session_id (for chain discovery)

3. **turns**
   - Conversation message lines
   - Fields: `id`, `session_id`, `turn_number`, `role` (visitor/agent), `content`, `language`, `created_at`
   - Indexed by session_id, turn_number

4. **definitions**
   - Synthesized terms + definitions
   - Fields: `id`, `session_id`, `term`, `definition_text`, `citations[]`, `language`, `chain_depth`, `created_at`, `embedding` (pgvector)
   - Indexed by created_at; pgvector index for semantic search

5. **print_queue**
   - Printer bridge jobs
   - Fields: `id`, `session_id`, `payload`, `printer_config`, `status` (pending/printing/done/error), `created_at`, `printed_at`, `error_message`
   - Realtime subscription: `print_queue where status='pending'`

6. **texts**
   - Seeded content (Kleist, Kreativitätsrant, Netzwerke)
   - Fields: `id`, `slug`, `title_de`, `title_en`, `content_de`, `content_en`, `author`, `created_at`
   - Tablet selects by `active_text_id` from config

7. **tts_cache**
   - Cached TTS audio
   - Fields: `id`, `text_hash` (SHA-256), `voice_id`, `audio_base64`, `created_at`
   - Tablet checks before requesting TTS; stores after fetch

**Row-Level Security (RLS)**:
- `definitions`: anon can INSERT (from tablet)
- `print_queue`: service role only (created by backend)
- `sessions`, `turns`: tablet can INSERT; service role can read
- `tts_cache`: anon can SELECT/INSERT
- `texts`: anon can SELECT

**Indexes**:
- sessions: (created_at, parent_session_id) for chain queries
- definitions: (created_at), pgvector index on embedding
- print_queue: (status, created_at) for bridge subscriptions
- turns: (session_id, turn_number)

---

### 6. **Printer Bridge (Local Service)**

**Entry point**: `apps/printer-bridge/src/index.ts`

**Lifecycle**:
1. Load config (USB port, serial port, or mock mode)
2. Connect to printer (or enter test/console mode)
3. Subscribe to Supabase Realtime: `print_queue where status='pending'`
4. On each new job:
   - Claim it (update status → 'printing')
   - Validate payload (Zod)
   - Format via ESC/POS layout engine
   - Send raw bytes to printer
   - Update status → 'done' or 'error'
5. Heartbeat every 30s: check printer connectivity, reconnect if needed
6. Graceful shutdown: SIGINT/SIGTERM → close printer, disconnect Supabase

**Modules**:
- `printer.ts`: Low-level printer I/O (USB via `usb` npm, serial via `serialport`)
- `layout.ts`: ESC/POS command builder
  - Formats definition text into thermal paper width (58mm or 80mm)
  - Adds metadata: term, language, date, session ID
  - Text wrapping, centering, bold, underline
  - Tested via `layout.test.ts`
- `config.ts`: Load config from `.env` (connection string, paper width, etc.)
- `index.ts`: Main orchestrator (subscription, job processing, heartbeat)

**Error resilience**:
- All errors caught; marked in print_queue as error
- Printer disconnection: attempts reconnect via exponential backoff
- Never crashes; continues polling for new jobs

---

### 7. **Shared Package**

**Location**: `packages/shared/src/`

**Exports** (via `index.ts`):
- `types.ts`: Zod schemas + TypeScript types
  - Mode, StateName, Role, PrintStatus
  - Session, Turn, Definition, PrintQueueRow, Text, etc.
  - Insert variants (omitting id/created_at for DB writes)
- `constants.ts`: App-wide constants
  - DEFAULT_MODE, DEFAULT_TERM
  - FACE_DETECTION timings (3s wake, 30s sleep)
  - TIMERS (welcome 3s, farewell 15s, etc.)
  - PRINTER constants (heartbeat, reconnect)
- `supabase.ts`: Factory function `createSupabaseClient(url, key)`
  - Used by backend, printer-bridge, and tablet
- Built once; used by all apps (dependency order: shared → apps)

---

## Entry Points

### Tablet (React)
- **Main**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/main.tsx`
- **App component**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/tablet/src/App.tsx`
  - Mounts `InstallationApp` (or Admin dashboard if `?admin=true`)
  - Initializes `useInstallationMachine`, `useConversation`, `useFaceDetection`
  - Renders screen based on state

### Backend (Hono)
- **Main**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/backend/src/index.ts`
- **App**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/backend/src/app.ts`
  - Defines Hono app, middleware (CORS, logging), route mounts
  - Routes: `/webhook/*`, `/api/session/*`, `/api/config/*`, `/api/*`

### Printer Bridge
- **Main**: `/Users/janos/Desktop/VAKUNST/code/mein.ung/meinungeheuer/apps/printer-bridge/src/index.ts`
  - Boots config, connects printer, subscribes to Realtime
  - Job processing loop
  - Graceful shutdown handlers

---

## State Management Summary

**Single reducer per app**:
- Tablet: `useInstallationMachine.ts` (useReducer hook)
- Backend: None; request/response pattern
- Printer: None; event-driven via Supabase Realtime

**Data persistence**:
- Tablet: Session state lost on page reload (acceptable for kiosk)
- Backend: Supabase is source of truth
- Printer: Job state in Supabase; bridge is stateless

**Async coordination**:
- Tablet → EL: WebSocket (duplex, real-time)
- Tablet → Backend: REST GET (config fetch on startup)
- EL → Backend: HTTP POST (webhook tool call)
- Backend → Supabase: REST + async embedding generation
- Printer ← Supabase: Realtime subscription (event-driven)

---

## Build Order

`pnpm build` executes in order:
1. **shared**: `tsc` (builds dist/)
2. **tablet**: Vite build (outputs dist/)
3. **backend**: `tsc` (outputs dist/)
4. **printer-bridge**: `tsc` (outputs dist/)

Tablets and backend can run in parallel (step 2, 3); printer must complete before integration tests.

---

## Environment & Secrets

Each app has a `.env` file (tracked via `.env.example`):

**Tablet** (`apps/tablet/.env`):
- `VITE_BACKEND_URL`: Backend API base URL (e.g., http://localhost:3001)
- `VITE_ELEVENLABS_AGENT_ID`: EL agent ID (created in EL dashboard)
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Anon key (for INSERT definitions, SELECT texts, etc.)

**Backend** (`apps/backend/.env`):
- `SUPABASE_URL`: Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (for full DB access)
- `WEBHOOK_SECRET`: Shared secret for webhook + admin endpoints (optional; skipped if not set)
- `OPENAI_API_KEY`: For embedding generation
- `OPENROUTER_API_KEY`: For custom LLM (if using OpenRouter; EL dashboard is the source of truth)

**Printer Bridge** (`apps/printer-bridge/.env`):
- `SUPABASE_URL`: Supabase URL
- `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`: For Realtime subscription
- Printer connection config (port, baud rate, etc.)

---

## Type Safety & Validation

**TypeScript strict mode** everywhere; no `any` type.

**Zod validation** at API boundaries:
- Backend webhook routes validate request bodies
- Backend config routes validate query params
- Tablet lib/api.ts validates config responses
- Printer-bridge validates print_queue payloads

**Shared types** in `packages/shared/src/types.ts`:
- All apps import from `@meinungeheuer/shared`
- Single source of truth for Session, Definition, Turn, etc.
- Insert variants for DB writes (omit id, created_at)

**No untracked types**:
- ElevenLabs SDK type mismatches noted in MEMORY.md (pre-existing; not our fault)
- All custom types are explicit
