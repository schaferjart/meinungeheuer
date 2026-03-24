# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Monorepo with distributed event-driven architecture. Tablet (React) drives the conversation loop; visitor interactions trigger ElevenLabs voice AI WebSocket session; definitions flow to backend for storage and routing; printer bridge listens to Supabase Realtime for print jobs.

**Key Characteristics:**
- Client-side state machine coordinates all transitions (9 screens)
- Fire-and-forget persistence — tablet writes directly to Supabase
- ElevenLabs SDK handles full voice pipeline (STT + LLM + TTS)
- Backend serves config, webhooks, and chain state — not in hot path
- Printer bridge is event-driven subscriber to print_queue table
- Multiple conversation "programs" (aphorism, free-association, voice-chain) — pluggable via registry

## Layers

**Presentation (Tablet):**
- Purpose: Visitor-facing React interface; 9-screen state machine; real-time UI state
- Location: `apps/tablet/src/`
- Contains: Screen components, hooks (state machine, ElevenLabs integration, face detection), UI utilities
- Depends on: @meinungeheuer/shared (types, constants), ElevenLabs React SDK, Supabase JS client
- Used by: Visitors (kiosk mode); admins (?admin=true URL param)

**Conversation Engine:**
- Purpose: ElevenLabs WebSocket integration; prompt building; agent configuration
- Location: `apps/tablet/src/hooks/useConversation.ts`; `apps/backend/src/routes/`
- Contains: ElevenLabs SDK wrapper, system prompt injection, tool handling (save_definition)
- Depends on: ElevenLabs @elevenlabs/react SDK, backend API for voice chain overrides
- Used by: Tablet state machine to manage voice interaction lifecycle

**Persistence Layer:**
- Purpose: Fire-and-forget writes to Supabase; avoids blocking UI
- Location: `apps/tablet/src/lib/persist.ts`; `apps/backend/src/routes/session.ts`
- Contains: Definition inserts, print job enqueues, transcript storage, portrait uploads
- Depends on: Supabase JS client, Supabase Storage
- Used by: App.tsx (after conversation milestones), tablet persistence functions

**Backend API (Hono):**
- Purpose: Configuration delivery, session creation, webhook handling, voice chain state
- Location: `apps/backend/src/`
- Contains: 4 route groups (config, session, webhook, voice-chain), shared services
- Depends on: Supabase service role client, OpenAI (embeddings), PostgreSQL
- Used by: Tablet (config fetch, session persist, voice chain apply-voice), ElevenLabs (webhooks)

**Print Bridge (Local Service):**
- Purpose: Event-driven print job processor; connects Supabase to thermal printer
- Location: `apps/printer-bridge/src/`
- Contains: Supabase Realtime listener, print payload validator, POS server HTTP client
- Depends on: Supabase (Realtime + service role client), print-renderer (cloud), POS server (local HTTP)
- Used by: Nobody calls it directly; it subscribes to print_queue table autonomously

**Shared Types & Constants:**
- Purpose: Single source of truth for types, Supabase client factory, program registry
- Location: `packages/shared/src/`
- Contains: Zod schemas (Session, Turn, Definition, PrintQueueRow, etc.), type exports, constants (DEFAULT_MODE, PORTRAIT config, etc.), program registry
- Depends on: Zod (runtime validation), Supabase JS client
- Used by: All apps (tablet, backend, printer-bridge)

**Conversation Programs (Registry):**
- Purpose: Define prompt logic, screen stages, print layout per installation mode
- Location: `packages/shared/src/programs/`
- Contains: aphorism.ts, free-association.ts, voice-chain.ts (each implements ConversationProgram interface)
- Depends on: Shared types
- Used by: Tablet (to route screens and build prompts), backend (to fetch agent config)

## Data Flow

**Startup Flow:**

1. Tablet mounts App.tsx
2. CameraDetector subscribes to face detection (MediaPipe) — runs regardless of screen
3. InstallationMachine initializes to 'sleep' screen
4. useEffect fires: fetchConfig(backend) → resolves mode, term, contextText, program, runtime config
5. RuntimeConfigContext provides merged config to all screens

**Visitor Interaction Flow (Happy Path):**

1. Face detected or tap → WAKE action → welcome screen (3s auto)
2. TIMER_3S → conditional routing based on program stages:
   - If consent required: consent screen
   - Else if textReading: text_display (karaoke reader synced to TTS)
   - Else if termPrompt: term_prompt (show the term to explore)
   - Else: conversation
3. At conversation screen:
   - useConversation hook: startConversation() → ElevenLabs WebSocket connect
   - After ElevenLabs 'connected': startSession(backend) → Supabase insert + SET_SESSION_ID action
   - useAudioCapture: if voice_chain program, startRecording() when EL connected
   - usePortraitCapture: 5s into conversation, captureFrame() → portraitBlobRef
   - ElevenLabs receives audio → STT → LLM (with injected system prompt) → TTS
   - Transcript updates in real-time via onMessage callback
   - Agent calls save_definition (client tool) → SDK delivers payload → handleDefinitionReceived callback
4. handleDefinitionReceived:
   - Creates Definition object (client-side ID)
   - persistDefinition() → Supabase (fire-and-forget, no await)
   - If portrait captured and program.stages.portrait: uploadPortrait() → POS server
   - setTimeout 2s → DEFINITION_READY action
5. DEFINITION_READY → synthesizing screen
6. Screen transitions to definition (displays the definition)
7. When screen === 'definition': persistPrintJob() → Supabase print_queue INSERT (fire-and-forget)
8. Print bridge Realtime listener detects new row → renderAndPrint() → POS server
9. User reads definition, taps to continue (or timeout) → printing screen
10. Print bridge updates print_queue status → printing screen notices and auto-transitions to farewell
11. Farewell screen (15s) → RESET action → back to sleep, CameraDetector running

**Voice Chain Mode Variation:**

- Before conversation: if program.id === 'voice_chain' and config.voice_chain provided:
  - voiceChainRef.current has { voice_clone_id, speech_profile, icebreaker }
  - useConversation receives voiceId, speechProfile, voiceChainIcebreaker as overrides
  - ElevenLabs uses cloned voice + injected icebreaker for first message
- During conversation: audioCapture records visitor separately (mic, not WebSocket)
- After conversation (handleConversationEnd): if consent === true and audioBlob.size > 50KB:
  - submitVoiceChainData(backend) → backend /api/voice-chain endpoint
  - Backend: extract speech profile, submit audio to ElevenLabs cloning API
  - Backend: compute embeddings, store in voice_chain_states table
- On next visitor: fetchConfig re-fetches voice_chain state with cloned voice ID ready

**Definition Persistence (Fire-and-Forget):**

1. Tablet calls persistDefinition() (no await in UI code)
2. Function catches all errors, logs, never throws
3. If duplicate (RLS blocks exist): silently returns
4. Backend webhook (optional) may also insert same definition via ElevenLabs callback
5. Backend `/webhook/definition` endpoint receives definition from ElevenLabs agent
6. Backend inserts and computes embeddings (OpenAI)

**Print Job Flow (Supabase Realtime):**

1. persistPrintJob() → print_queue INSERT with payload: { term, definition_text, citations, language, session_number, template, timestamp }
2. Printer bridge subscribed to `print_queue` table, filter: `status=eq.pending`
3. On INSERT event: processJob() → claim row (update status='printing'), validate payload via Zod
4. For definition (type='text'): POST to print-renderer (cloud) → get rendered image → POST to POS server
5. For portrait (type='portrait'): download pre-rendered from Storage → POST to POS server
6. Update print_queue: status='done', printed_at=now
7. Error case: catch, log, update status='error'
8. Bridge never throws; logs all errors and continues

**Config Fetch Fallback:**

- If backend /api/config returns error or timeout:
  - Tablet logs warning, uses DEFAULT_RUNTIME_CONFIG
  - contextText becomes null
  - AI has no text reference but program still runs
  - This is intentional: installation should never crash on network failure

## Key Abstractions

**InstallationMachine (State Machine):**
- Purpose: Single reducer managing all tablet state transitions
- Examples: `apps/tablet/src/hooks/useInstallationMachine.ts`
- Pattern: useReducer with 9 states (sleep, welcome, consent, text_display, term_prompt, conversation, synthesizing, definition, printing, farewell)
- Invariant: screen can only transition via specific actions (WAKE, TIMER_3S, READY, etc.)

**ConversationProgram (Program Registry):**
- Purpose: Pluggable installation modes with different prompt logic, stages, and output formats
- Examples: `packages/shared/src/programs/{aphorism,free-association,voice-chain}.ts`
- Pattern: Static TypeScript objects implementing ConversationProgram interface; registered in REGISTRY
- Usage: getProgram(id) looks up by string ID; falls back to 'aphorism' with warning

**PromptParams (Dependency Injection for Prompts):**
- Purpose: Pass dynamic values (term, contextText, language, speechProfile, voiceChainIcebreaker) to prompt builders
- Pattern: All programs receive same params object; build system prompt and first message deterministically
- Benefit: System prompt never hardcoded in ElevenLabs dashboard; always injected at session start via SDK callback

**Fire-and-Forget Persistence:**
- Purpose: Never block UI on database writes; accept eventual consistency
- Pattern: persistDefinition(), persistPrintJob(), persistTranscript() all catch errors internally, log, and return void
- Benefit: Tablet never waits for Supabase; definitions and print jobs queue asynchronously
- Risk: Errors silently swallowed; must debug via Supabase direct SQL query

**Supabase Realtime (Event-Driven Bridge):**
- Purpose: Decouple printer bridge from tablet; bridge runs on local Pi, subscribes autonomously
- Pattern: Realtime subscription on print_queue; on INSERT → processJob()
- Benefit: Print bridge doesn't need API; tablet doesn't need to know about printer
- Constraint: Print bridge must be running; no print without it (design choice, not architecture)

**ElevenLabs Tool Handling (save_definition):**
- Purpose: Agent calls client-side tool; SDK delivers JSON payload to browser; tablet handles side effects
- Pattern: onDisconnect callback with details.toolData → handleDefinitionReceived() → persistDefinition() + dispatch DEFINITION_RECEIVED
- Benefit: AI doesn't wait for database; definition flows immediately from agent → tablet → Supabase
- Constraint: Tool result discarded by ElevenLabs (doesn't wait for tablet response)

## Entry Points

**Tablet:**
- Location: `apps/tablet/src/main.tsx` → `src/App.tsx`
- Triggers: Browser load (kiosk mode) or ?admin=true (admin dashboard)
- Responsibilities: Mount React app, initialize state machine, subscribe to config, render screens

**Backend:**
- Location: `apps/backend/src/index.ts` → `src/app.ts`
- Triggers: Node process start (docker, pm2, or manual)
- Responsibilities: Listen on port 3001, serve /api/* routes, webhook receiver

**Printer Bridge:**
- Location: `apps/printer-bridge/src/index.ts`
- Triggers: Node process start (local service on Pi, manually started)
- Responsibilities: Load config, connect to Supabase, subscribe to print_queue, process jobs forever

**ElevenLabs Webhooks:**
- Location: `apps/backend/src/routes/webhook.ts` (POST /webhook/definition)
- Triggers: ElevenLabs agent triggers save_definition tool
- Responsibilities: Insert definition, compute embeddings, optionally update voice_chain state

## Error Handling

**Strategy:** Defensive; never crash a service; log errors; retry where sensible; accept silent failures for non-critical paths.

**Patterns:**

**Tablet (UI never crashes):**
- All async operations wrapped in .catch() with console.warn
- useConversation fails gracefully: if EL disconnects without definition, synthesize fallback
- Config fetch failure: fall back to defaults (contextText = null, mode = 'term_only')
- Persistence failures (Supabase): logged but never block state transitions
- Face detection failure: fallback to tap-to-start on sleep screen

**Backend (Services stay alive):**
- Global error handler: app.onError() logs and returns 500 JSON
- Route handlers wrapped in try-catch; all errors caught and converted to HTTP responses
- Supabase query failures: return appropriate HTTP status (404, 500) without throwing
- ElevenLabs webhook: catch parse errors, log, return 400 with error message

**Printer Bridge (Print job never crashes bridge):**
- processJob() never throws; all errors caught in try-catch
- Zod validation failure: log and mark job 'error' (don't retry)
- POS server unreachable: catch and mark 'error'
- Supabase Realtime disconnect: re-subscribe automatically (built into SDK)
- Bridge continues listening for next job regardless of previous job outcome

## Cross-Cutting Concerns

**Logging:**
- Console.log/warn/error throughout with [ComponentName] prefixes (e.g., [App], [bridge], [MeinUngeheuer])
- Structured logging for debugging; no log aggregation configured
- Backend uses Hono logger middleware for HTTP request logging

**Validation:**
- Zod schemas at API boundaries: `configRoutes`, webhook handler, print job processor
- PromptParams passed as plain object (not validated) — caller responsible
- Database row types validated via Zod after fetch (PrintPayloadSchema, PortraitPrintPayloadSchema)

**Authentication:**
- Tablet: Anonymous (Supabase anon key); RLS policies enforce read/write scopes
- Backend: WEBHOOK_SECRET env var for mutation endpoints (Bearer token or query param)
- Printer bridge: Service role key (trusted local service)
- ElevenLabs: API key in .env (VITE_ELEVENLABS_API_KEY on tablet, retrieved at session init)

**Configuration:**
- Tablet: Runtime config from backend /api/config merged with defaults
- Backend: Supabase installation_config table + environment variables
- Printer bridge: config.yaml + environment variables
- Programs: Static TypeScript objects; not database-driven

---

*Architecture analysis: 2026-03-24*
