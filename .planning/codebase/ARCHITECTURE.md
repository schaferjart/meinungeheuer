# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Event-driven pipeline with a centralized finite state machine at the core

**Key Characteristics:**
- Single React reducer (`useInstallationMachine`) drives all screen transitions — no routing library
- Programs are static TypeScript objects that configure the full pipeline behavior per mode
- All Supabase writes are fire-and-forget from the tablet; no write blocks the UI
- Printer is fully decoupled: tablet enqueues to `print_queue`, bridge polls/subscribes independently
- Voice pipeline (STT + LLM + TTS) runs entirely inside ElevenLabs Conversational AI WebSocket

## Layers

**Tablet UI Layer:**
- Purpose: Kiosk display, visitor interaction, face detection, audio conversation
- Location: `apps/tablet/src/`
- Contains: React screens, state machine hook, conversation hook, persist utilities
- Depends on: ElevenLabs SDK, `@meinungeheuer/shared`, `@meinungeheuer/karaoke-reader`, Supabase anon client
- Used by: Visitor directly

**Backend API Layer:**
- Purpose: Config serving, session creation, voice chain processing, ElevenLabs webhook relay
- Location: `apps/backend/src/`
- Contains: Hono routes (`config.ts`, `session.ts`, `voiceChain.ts`, `webhook.ts`), services (`chain.ts`, `embeddings.ts`, `voiceChain.ts`)
- Depends on: Supabase service role client, ElevenLabs REST API, OpenRouter API
- Used by: Tablet on startup (config), during conversation (session start, voice chain submit)

**Print Renderer Layer:**
- Purpose: Cloud image rendering of thermal card layouts (Python/FastAPI)
- Location: `apps/print-renderer/`
- Contains: `main.py` (FastAPI endpoints), `templates.py` (card layout rendering), `pipeline.py` (portrait face detection + style transfer + dithering), `dithering.py`, `supabase_config.py`
- Depends on: PIL/Pillow, MediaPipe (optional), n8n webhook (optional style transfer), Supabase Storage
- Used by: Printer bridge (for text cards), tablet (for portrait upload via `/process/portrait`)

**Printer Bridge Layer:**
- Purpose: Local Node.js daemon that listens for print jobs and relays to POS server
- Location: `apps/printer-bridge/src/`
- Contains: `index.ts` (Supabase Realtime subscriber + poller), `printer.ts` (HTTP relay to POS server + renderer), `config.ts`
- Depends on: `@meinungeheuer/shared`, cloud print-renderer, local POS server
- Used by: Runs on Pi/laptop near the physical printer; never deployed to cloud

**POS Server Layer:**
- Purpose: Minimal local HTTP server that accepts pre-rendered PNG images and sends ESC/POS commands to thermal printer
- Location: `apps/pos-server/`
- Contains: `print_server.py` (Flask server), `printer_core.py` (ESC/POS driver), fonts
- Depends on: python-escpos, PIL, Flask
- Used by: Printer bridge sends POST to `/print/image` or `/print/batch`

**Shared Package:**
- Purpose: Types, Zod schemas, Supabase client factory, program definitions, constants
- Location: `packages/shared/src/`
- Contains: `types.ts` (all Zod schemas + TypeScript types), `programs/` (program objects), `constants.ts`, `voiceChainConfig.ts`, `supabase.ts`
- Used by: All TypeScript apps

**Karaoke Reader Package:**
- Purpose: Standalone library for audio-synchronized text highlighting with TTS timestamps
- Location: `packages/karaoke-reader/src/`
- Contains: `hooks/useKaraokeReader.ts` (orchestrator), `hooks/useAudioSync.ts` (rAF sync loop), `hooks/useAutoScroll.ts`, `components/KaraokeReader.tsx`, `adapters/elevenlabs/` (timestamp format conversion), `utils/buildWordTimestamps.ts`, `utils/splitTextIntoChunks.ts`
- Used by: `apps/tablet` TextDisplayScreen for Mode A text reading

**Config App:**
- Purpose: Admin dashboard for configuring installation, previewing print layouts, workbench tools
- Location: `apps/config/src/`
- Contains: `main.ts` (entry, auth, tab switching), `tabs/programs.ts` (program pipeline config), `tabs/workbench.ts` (print preview tools), `tabs/system.ts` (system settings), `lib/render-api.ts`, `lib/tablet-preview.ts`, `lib/forms.ts`
- Used by: Operator/curator via browser; authenticated via Supabase email auth

**Archive App:**
- Purpose: Public-facing display of all generated definitions with conversation transcripts
- Location: `apps/archive/src/`
- Contains: `main.ts` (single-file vanilla TS SPA, hash-based routing, Supabase reads)
- Used by: Audience via browser; QR code on printed card links to individual definition

## State Machine

**States (in order of flow):**

`sleep` → `welcome` → `consent`* → `text_display`* → `term_prompt`* → `conversation` → `synthesizing` → `definition` → (implicitly `printing`) → `farewell` → (RESET to `sleep`)

*Optional stages — controlled by `StageConfig` from the active program.

**Actions and transitions:**
- `WAKE` → `sleep` → `welcome`
- `TIMER_3S` → `welcome` → `consent` (if `stages.consentRequired`) OR `text_display` (if `stages.textReading`) OR `term_prompt` (if `stages.termPrompt`) OR `conversation`
- `CONSENT_ACCEPTED` / `CONSENT_DECLINED` → `consent` → follows same stage routing as `TIMER_3S`
- `READY` → `text_display` → `term_prompt` (if enabled) OR `conversation`
- `TIMER_2S` → `term_prompt` → `conversation`
- `DEFINITION_RECEIVED` → `conversation` → `synthesizing` (also sets `definition` in state)
- `DEFINITION_READY` → `synthesizing` → `definition`
- `TIMER_10S` → `definition` → `farewell`
- `PRINT_DONE` → `printing` → `farewell`
- `TIMER_15S` or `FACE_LOST` → `farewell` → RESET (preserves config, clears session)
- `SET_CONFIG` — applies from any state (updates mode, term, contextText, stages)
- `SET_SESSION_ID` — set after ElevenLabs session starts and backend creates row
- `SET_LANGUAGE` — visitor can set language during welcome

**State file:** `apps/tablet/src/hooks/useInstallationMachine.ts`

## Programs

Programs are the central abstraction that wires the entire pipeline together. Each is a TypeScript object implementing `ConversationProgram` from `packages/shared/src/programs/types.ts`.

**Fields each program defines:**
- `id` — stored in `installation_config.program` column
- `stages: StageConfig` — which pipeline screens are active (`textReading`, `termPrompt`, `portrait`, `printing`, `consentRequired`)
- `buildSystemPrompt(params)` — full ElevenLabs agent system prompt text
- `buildFirstMessage(params)` — agent's opening spoken line
- `printLayout` — which print-renderer template to use (`dictionary`, `dictionary_portrait`, `portrait_only`, `message`)
- `resultDisplay` — how the tablet displays the result (`aphorism`, `definition`, `raw_transcript`)
- `sessionMode` — the `Mode` value stored in Supabase session rows

**Registry:** `packages/shared/src/programs/index.ts` — `getProgram(id)` resolves by string ID

**Three programs:**

| Program | ID | textReading | termPrompt | portrait | consent | Print layout | First message |
|---|---|---|---|---|---|---|---|
| Aphorism | `aphorism` | yes | no | yes | no | `dictionary` | "Du hast gerade einen Text gelesen." |
| Free Association | `free_association` | no | no | no | no | `dictionary` | "Was geht dir gerade durch den Kopf?" |
| Voice Chain | `voice_chain` | no | no | yes | yes | `dictionary` | icebreaker from previous visitor |

## Data Flow

### Mode A (aphorism program) — Full Flow

1. Tablet boots, `App.tsx` calls `fetchConfig(BACKEND_URL)` → `GET /api/config`
2. Backend reads `installation_config` row, fetches associated `texts` row, returns full config including `text.content_de`
3. `App.tsx` dispatches `SET_CONFIG` with `contextText = text.content_de`, sets `programRef = aphorism`
4. Face detected (or tap) → `WAKE` → screen: `sleep` → `welcome`
5. After 3s timer (`TIMER_3S`) → screen: `text_display` (because `stages.textReading = true`)
6. `TextDisplayScreen` uses `KaraokeReader` from `@meinungeheuer/karaoke-reader`: fetches TTS audio + character timestamps from ElevenLabs TTS API, builds word-level timestamps, plays audio, highlights words in sync via `requestAnimationFrame`
7. Visitor taps "Ready" → `READY` → screen: `conversation`
8. `App.tsx` calls `startConversation()` from `useConversation.ts`:
   - Calls `program.buildSystemPrompt({ term, contextText, language })` — injects paragraph-numbered text
   - Calls `program.buildFirstMessage({ language })` — "Du hast gerade einen Text gelesen..."
   - Opens ElevenLabs WebSocket via `conversation.startSession({ agentId, overrides: { agent: { prompt, firstMessage, language } } })`
9. ElevenLabs WebSocket established → `App.tsx` calls `startSession(BACKEND_URL, ...)` → `POST /api/session/start` → Supabase inserts `sessions` row → returns `session_id`
10. Visitor speaks → ElevenLabs STT → Gemini 2.0 Flash → ElevenLabs TTS → audio output via WebSocket
11. Each message updates `transcript` state in `useConversation.ts` via `onMessage` callback
12. 5 seconds into conversation, `App.tsx` captures portrait frame from shared `videoRef` via `captureFrame()`, stores blob in `portraitBlobRef`
13. Agent calls `save_definition` tool → `clientTools.save_definition` in `useConversation.ts` fires → `onDefinitionReceived` → `App.tsx.handleDefinitionReceived`:
    - Dispatches `DEFINITION_RECEIVED` → screen: `synthesizing`
    - Calls `persistDefinition()` → fire-and-forget Supabase INSERT to `definitions`
    - Calls `uploadPortrait(portraitBlobRef)` → POST to `VITE_PRINT_RENDERER_URL/process/portrait` → print-renderer runs style transfer + face detection + dithering → uploads PNGs to Supabase Storage → inserts `portrait` type row into `print_queue`
    - After 2s: dispatches `DEFINITION_READY` → screen: `definition`
14. Screen: `definition` triggers `persistPrintJob()` → Supabase INSERT to `print_queue` with `PrintPayload`
15. Printer bridge (Realtime INSERT event or 5s poll) picks up `pending` row → claims it → POSTs to print-renderer `/render/dictionary` → gets PNG → sends PNG to POS server `/print/image` → ESC/POS to thermal printer
16. Portrait print job processed separately (bridge picks up `portrait` type row → downloads PNGs from Storage → sends to POS server `/print/batch`)
17. After `TIMER_10S` → screen: `farewell` → `TIMER_15S` → `RESET`
18. `App.tsx` calls `persistTranscript()` on conversation end → Supabase INSERT to `turns`

### Voice Chain Program — Additional Steps

After step 13 (conversation ends):
- `App.tsx.handleConversationEnd()` calls `stopRecording()` (mic audio recorded since `connected` state)
- If `voiceCloneConsent === true` and audio > 50KB: calls `submitVoiceChainData(BACKEND_URL, { audio, sessionId, transcript })`
- Backend `POST /api/voice-chain/process` runs `processVoiceChain()` fire-and-forget:
  1. Parallel: `cloneVoice(audioBuffer)` → POST to ElevenLabs `/v1/voices/add` → returns `voice_id`
  2. Parallel: `extractSpeechProfile(transcript)` → OpenRouter Gemini call → structured `SpeechProfile` JSON
  3. Parallel: `generateIcebreaker(transcript)` → OpenRouter Gemini call → 1-2 sentence opener
  4. Deactivates all existing `voice_chain_state` rows
  5. Inserts new row with `voice_clone_id`, `speech_profile`, `icebreaker`, `chain_position`
  6. Cleans up voice clones older than retention window
- Before next visitor's conversation: `useConversation.startConversation()` calls `POST /api/voice-chain/apply-voice` → backend PATCHes ElevenLabs agent's TTS voice to the cloned `voice_id`
- System prompt includes `STYLE_INFLUENCE` block built from previous visitor's `SpeechProfile`

### Print Rendering Pipeline

**Text card flow:**
`persistPrintJob()` in tablet → `print_queue INSERT (status=pending)` → printer bridge detects → `renderAndPrint()`:
1. `POST /render/dictionary` to print-renderer with `{ word, definition, citations, template, definition_id }` → returns PNG
2. `POST /print/image` to POS server with PNG file → printer outputs ESC/POS → thermal print + cut

**Portrait flow:**
`uploadPortrait()` in tablet → `POST /process/portrait` to print-renderer → print-renderer:
1. Style transfer via n8n webhook (optional)
2. MediaPipe face detection → 4 crop zones (full, face close-up, eyes, strip)
3. Dithering (Bayer or Floyd-Steinberg) → PNG images
4. Upload to Supabase Storage bucket `prints/portraits/{job_id}/`
5. INSERT to `print_queue` with `{ type: "portrait", image_urls: [...] }`
→ Printer bridge picks up → downloads PNGs from Storage → `POST /print/batch` to POS server → all images printed with single cut

## Key Abstractions

**ConversationProgram:**
- Purpose: Encapsulates all behavior for one installation mode
- Examples: `packages/shared/src/programs/aphorism.ts`, `packages/shared/src/programs/voice-chain.ts`
- Pattern: Static object implementing `ConversationProgram` interface; registered in `REGISTRY` in `packages/shared/src/programs/index.ts`

**StageConfig:**
- Purpose: Boolean flags controlling which pipeline screens are active for a program
- Used by: State machine reducer to route transitions, App.tsx to gate side effects
- Definition: `packages/shared/src/programs/types.ts`

**PrintPayload / PortraitPrintPayload:**
- Purpose: Typed shapes stored as JSONB in `print_queue.payload`
- Both Zod-validated in printer bridge before processing
- Definition: `packages/shared/src/types.ts`

**VoiceChainState:**
- Purpose: Row in Supabase `voice_chain_state` table; exactly one `is_active = true` row at a time
- Contains: `voice_clone_id` (ElevenLabs IVC), `speech_profile` (LLM-extracted JSON), `icebreaker`, `chain_position`
- Fetched by backend's `GET /api/config` and returned to tablet as `voice_chain` field

## Entry Points

**Tablet:**
- Location: `apps/tablet/src/main.tsx`
- Triggers: Browser load; `App.tsx` renders either `<Admin>` (if `?admin=true`) or `<InstallationApp>`

**Backend:**
- Location: `apps/backend/src/index.ts`
- Triggers: Node.js process start; `app.ts` registers Hono routes

**Printer Bridge:**
- Location: `apps/printer-bridge/src/index.ts`
- Triggers: `pnpm dev:printer` or systemd `printer-bridge.service`; on startup polls pending jobs, then subscribes Supabase Realtime + sets 5s poll interval

**POS Server:**
- Location: `apps/pos-server/print_server.py`
- Triggers: `python print_server.py` or systemd `pos-server.service`; Flask listens on 0.0.0.0:9100

**Print Renderer:**
- Location: `apps/print-renderer/main.py`
- Triggers: Docker / Coolify deployment; FastAPI (uvicorn) handles rendering requests

**Config App:**
- Location: `apps/config/src/main.ts`
- Triggers: Browser load; checks Supabase auth session, shows login if unauthenticated

**Archive App:**
- Location: `apps/archive/src/main.ts`
- Triggers: Browser load; vanilla TS SPA, reads definitions from Supabase, hash-based routing

## Error Handling

**Strategy:** Never crash long-running services; catch, log, continue. Fire-and-forget for all Supabase writes from the tablet.

**Patterns:**
- `persistDefinition()`, `persistPrintJob()`, `persistTranscript()`, `uploadBlurredPortrait()` in `apps/tablet/src/lib/persist.ts` — all swallow errors silently (only console.warn)
- Printer bridge: job failure updates row to `status='error'` but never throws; bridge keeps running
- Voice chain processing: `processVoiceChain()` never throws; each step (clone, profile, icebreaker) is independently nullable
- Config fetch failure in `App.tsx`: falls back to defaults silently; `contextText` becomes null
- ElevenLabs disconnect with no definition: `App.tsx.handleConversationEnd()` synthesizes a fallback definition so the flow completes

## Cross-Cutting Concerns

**Logging:** `console.log/warn/error` with `[ComponentName]` prefix. No structured logging library.

**Validation:** Zod at all API boundaries. Tablet parses config response via `ConfigResponseSchema`. Bridge validates payloads before processing. Backend validates request bodies.

**Authentication:** Backend admin endpoints guarded by `WEBHOOK_SECRET` (Bearer or `?secret=` query param). Config app uses Supabase email auth. Archive and tablet use Supabase anon key.

**Camera sharing:** Single `videoRef` shared between `CameraDetector` (face detection) and `usePortraitCapture` (frame capture) to avoid double `getUserMedia()` which mutes audio on iOS Safari (WebKit bug #179363).

**Activity keepalive:** 15s `setInterval` fires `sendUserActivity()` on the ElevenLabs WebSocket to prevent 20s inactivity timeout during conversation.

---

*Architecture analysis: 2026-03-24*
