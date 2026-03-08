# External Integrations

**Analysis Date:** 2026-03-08

## APIs & External Services

### ElevenLabs (Voice AI Pipeline)

The primary external integration. Handles the entire voice conversation loop: speech-to-text, LLM reasoning (via Custom LLM on OpenRouter), and text-to-speech in a single WebSocket connection.

**Conversational AI (WebSocket):**
- SDK: `@11labs/react` (React hook), `@11labs/client` (low-level)
- Used in: `apps/tablet/src/hooks/useConversation.ts`
- Auth: `VITE_ELEVENLABS_AGENT_ID` (agent configured in ElevenLabs dashboard)
- Connection: WebSocket via `useConversation` from `@11labs/react`
- System prompts injected at session start via SDK `overrides.agent.prompt.prompt`
- Client tools: `save_definition` registered as a client tool to capture definitions in real-time
- Role mapping: SDK uses "user"/"ai" -- mapped to "visitor"/"agent" in `mapRole()` function

**Text-to-Speech REST API (with timestamps):**
- SDK: `@elevenlabs/client` ^0.15.0
- Used in: `packages/karaoke-reader/src/adapters/elevenlabs/index.ts`
- Auth: `VITE_ELEVENLABS_API_KEY` (via `xi-api-key` header)
- Endpoint: `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/with-timestamps`
- Returns: base64 audio + character-level alignment data (`alignment.character_start_times_seconds`, `character_end_times_seconds`)
- Model: `eleven_multilingual_v2` (default)
- Output format: `mp3_44100_128`
- Voice settings: stability 0.35, similarity_boost 0.65, style 0.6

**ElevenLabs Dashboard Configuration (external, not in code):**
- Agent has a Custom LLM configured pointing to OpenRouter
- LLM model: `google/gemini-2.0-flash-001` (configured in dashboard, not in code)
- `save_definition` tool configured as webhook tool pointing to `POST /webhook/definition`
- Post-conversation webhook configured to `POST /webhook/conversation-data`

### OpenRouter (Embeddings)

- SDK: `openai` ^4.82.0 (OpenAI-compatible SDK with custom `baseURL`)
- Used in: `apps/backend/src/services/embeddings.ts`
- Auth: `OPENROUTER_API_KEY`
- Base URL: `https://openrouter.ai/api/v1`
- Model: `openai/text-embedding-3-small` (1536 dimensions)
- Purpose: Generates vector embeddings for definitions (stored in pgvector column)
- Pattern: Fire-and-forget (`void generateEmbedding(definitionId)` -- never blocks the webhook response)

### MediaPipe (Face Detection)

- SDK: `@mediapipe/tasks-vision` ^0.10.18
- Used in: `apps/tablet/src/hooks/useFaceDetection.ts`
- WASM runtime: loaded from CDN `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm`
- Model: BlazeFace Short Range (float16) from `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
- Runs entirely in-browser (no external API calls after model download)
- Detection loop: 2 fps (every 500ms), CPU delegate
- Debounce: 3s presence for wake, 30s absence for sleep
- Min confidence: 0.5

## Data Storage

### Supabase (PostgreSQL + pgvector + Realtime)

The sole database. Used by all three apps with different access levels.

**Connection:**
- Client library: `@supabase/supabase-js` ^2.49.1
- Client factory: `packages/shared/src/supabase.ts` -- `createSupabaseClient(url, key)` returns typed `SupabaseClient<Database>`
- Full type safety via `Database` interface in `packages/shared/src/supabase.ts`

**Access patterns:**
| App | Key Type | RLS |
|-----|----------|-----|
| tablet | anon key (`VITE_SUPABASE_ANON_KEY`) | Subject to RLS policies |
| backend | service role key (`SUPABASE_SERVICE_ROLE_KEY`) | Bypasses RLS |
| printer-bridge | anon key or service role key (`SUPABASE_ANON_KEY`) | Subject to RLS if anon |

**Database tables (8 total):**

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `sessions` | One row per visitor interaction | `mode`, `term`, `elevenlabs_conversation_id` |
| `turns` | Conversation transcript turns | `session_id`, `turn_number`, `role`, `content` |
| `definitions` | AI-generated aphorisms/definitions | `term`, `definition_text`, `embedding` (vector 1536) |
| `print_queue` | Print job queue | `payload` (JSONB), `status` (pending/printing/done/error) |
| `chain_state` | Active chain tracking for Mode C | `definition_id`, `is_active` |
| `installation_config` | Operator settings (singleton row) | `mode`, `active_term`, `active_text_id` |
| `texts` | Source texts for Mode A | `content_de`, `content_en`, `terms[]` |
| `tts_cache` | Cached TTS audio + word timestamps | `cache_key`, `audio_base64_parts`, `word_timestamps` |

**Migrations:** `supabase/migrations/001_extensions.sql` through `007_anon_insert_definitions.sql`

**Extensions:**
- `pgvector` -- 1536-dimensional vector column on `definitions.embedding`

**Row Level Security:**
- Enabled on all tables (`supabase/migrations/004_rls.sql`)
- Anon key can: SELECT texts, installation_config, chain_state, definitions; INSERT sessions, turns
- Anon key for printer: SELECT/UPDATE print_queue (pending/printing status only)
- TTS cache: anon can SELECT and INSERT (`supabase/migrations/006_kreativitaetsrant_and_tts_cache.sql`)

**Supabase Realtime:**
- `print_queue` table published to Supabase Realtime (`ALTER PUBLICATION supabase_realtime ADD TABLE print_queue`)
- Printer bridge subscribes to INSERT events where `status=eq.pending` via `supabase.channel('print_queue_inserts').on('postgres_changes', ...)`
- Subscription in: `apps/printer-bridge/src/index.ts`

**File Storage:**
- Not used. TTS audio cached as base64 in `tts_cache` table, not in Supabase Storage.

**Caching:**
- TTS cache via `tts_cache` table (key: SHA-256 of text + voiceId)
- Cache adapter: `apps/tablet/src/lib/supabaseCacheAdapter.ts` implements generic `CacheAdapter` interface
- Cache errors silently swallowed (never block TTS playback)

## Authentication & Identity

**Auth Provider:** None (no user authentication)

The installation has no concept of user accounts. Visitors are anonymous.

**Webhook security:**
- Shared secret via `WEBHOOK_SECRET` env var
- Verified on `/webhook/*` and admin endpoints
- Accepted via `?secret=` query param or `Authorization: Bearer {secret}` header
- Skipped if `WEBHOOK_SECRET` is not set (dev mode)
- Implementation: middleware in `apps/backend/src/routes/webhook.ts` and `apps/backend/src/routes/config.ts`

**Supabase auth:**
- Uses anon key (public, client-side) and service role key (backend, bypasses RLS)
- No Supabase Auth users or sessions

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, no error tracking service)

**Logs:**
- `console.log` / `console.error` throughout
- Hono `logger()` middleware on all backend routes (`apps/backend/src/app.ts`)
- Structured log prefixes: `[bridge]`, `[webhook/definition]`, `[chain]`, `[embeddings]`, `[MeinUngeheuer]`, `[App]`, `[TTS Cache]`
- Printer bridge: logs every job lifecycle (claim, process, done/error)
- Backend: logs all DB errors with context objects

## CI/CD & Deployment

**Hosting:**
- Tablet: Docker on Coolify (self-hosted PaaS)
- Backend: Vercel serverless
- Printer bridge: local hardware (Raspberry Pi / laptop)

**CI Pipeline:**
- None detected (no GitHub Actions, no CI configuration files)

**Docker:**
- `Dockerfile` at project root -- builds tablet SPA only
- 2-stage: `node:20-slim` build + `nginx:alpine` serve
- SPA fallback configured in nginx (`try_files $uri $uri/ /index.html`)

## Webhooks & Callbacks

### Incoming Webhooks (backend receives)

**POST `/webhook/definition`:**
- Source: ElevenLabs (agent calls `save_definition` tool)
- Auth: `WEBHOOK_SECRET` (query param or Bearer token)
- Body schema: `SaveDefinitionWebhookSchema` (tool_call_id, tool_name, parameters: {term, definition_text, citations, language}, conversation_id)
- Actions: find/create session, insert definition, insert print_queue job, advance chain (Mode C), fire-and-forget embedding generation
- File: `apps/backend/src/routes/webhook.ts`

**POST `/webhook/conversation-data`:**
- Source: ElevenLabs (post-conversation webhook)
- Auth: `WEBHOOK_SECRET`
- Body schema: `ConversationDataWebhookSchema` (conversation_id, transcript[], metadata?)
- Actions: insert turn rows, update session with duration/turn_count/ended_at
- File: `apps/backend/src/routes/webhook.ts`

### Outgoing HTTP Calls

**Printer bridge to POS server:**
- Endpoint: `{POS_SERVER_URL}/print/dictionary`
- Method: POST
- Body: `{word, definition, citations, language, session_number, chain_ref, timestamp}`
- Timeout: 10 seconds (`AbortSignal.timeout(10_000)`)
- Retry: once on failure
- Console mode: if `POS_SERVER_URL` is empty or "console", logs to stdout instead
- File: `apps/printer-bridge/src/printer.ts`

**Tablet to backend:**
- `GET {VITE_BACKEND_URL}/api/config` -- fetch installation config on startup
- `POST {VITE_BACKEND_URL}/api/session/start` -- register new session
- File: `apps/tablet/src/lib/api.ts`

**Tablet to ElevenLabs TTS API:**
- `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/with-timestamps`
- Purpose: Generate audio + word-level timestamps for karaoke text reader
- File: `packages/karaoke-reader/src/adapters/elevenlabs/index.ts`

**Backend to OpenRouter:**
- `POST https://openrouter.ai/api/v1/embeddings`
- Purpose: Generate 1536-dim embeddings for definitions
- File: `apps/backend/src/services/embeddings.ts`

## API Routes Summary

All backend routes defined in `apps/backend/src/app.ts`:

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/health` | Health check | None |
| POST | `/webhook/definition` | ElevenLabs save_definition callback | WEBHOOK_SECRET |
| POST | `/webhook/conversation-data` | ElevenLabs post-conversation data | WEBHOOK_SECRET |
| POST | `/api/session/start` | Create new session | None |
| GET | `/api/config` | Get installation config | None |
| POST | `/api/config/update` | Update installation config | WEBHOOK_SECRET (admin) |
| GET | `/api/definitions` | List definitions (paginated, filterable) | None |
| GET | `/api/chain` | Get chain history for Mode C | None |

## Environment Configuration

**Required env vars:** See STACK.md for complete table per app.

**Secrets location:**
- Per-app `.env` files (not committed)
- `.env.example` files document required shape
- Docker build args for tablet deployment (Coolify injects these)
- Vercel environment variables for backend

## Data Flow Summary

```
Visitor speaks
  -> Tablet microphone
  -> ElevenLabs WebSocket (STT + LLM + TTS)
  -> Agent calls save_definition tool
  -> POST /webhook/definition (backend)
  -> Supabase: insert definition + print_queue job
  -> Supabase Realtime: notify printer-bridge
  -> printer-bridge: POST to POS server
  -> ESC/POS thermal printer
```

```
Text reading (Mode A):
  -> Tablet fetches text from Supabase (via backend /api/config)
  -> Tablet calls ElevenLabs TTS REST API with timestamps
  -> karaoke-reader syncs word highlighting to audio.currentTime
  -> TTS response cached in Supabase tts_cache table
```

---

*Integration audit: 2026-03-08*
