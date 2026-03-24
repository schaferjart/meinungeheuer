# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

### ElevenLabs — Conversational AI + TTS + Voice Cloning

**Conversational AI WebSocket:**
- Used in `apps/tablet` via `@elevenlabs/react` SDK (`useConversation` hook in `apps/tablet/src/hooks/useConversation.ts`)
- Agent ID: `agent_7201kjt1wgyqfjp8zkr68r3ngas6` (hardcoded default, overridable via `VITE_ELEVENLABS_AGENT_ID`)
- Connection: `useConversation.startSession({ agentId, connectionType: 'websocket', overrides })`
- Session overrides inject `agent.prompt.prompt` (system prompt), `agent.firstMessage`, and `agent.language` at session start — no need to redeploy agent
- Auth: `VITE_ELEVENLABS_API_KEY` env var (browser-side)

**Agent PATCH API (voice chain):**
- Used by `apps/backend` in `apps/backend/src/routes/voiceChain.ts`
- Endpoint: `PATCH https://api.elevenlabs.io/v1/convai/agents/{agent_id}`
- Payload: `{ conversation_config: { tts: { voice_id } } }`
- Auth header: `xi-api-key: ELEVENLABS_API_KEY`
- Called before each voice-chain conversation to apply the previous visitor's cloned voice
- After conversation ends, voice is restored to default (`DLsHlh26Ugcm6ELvS0qi`)

**Instant Voice Cloning:**
- Used by `apps/backend` in `apps/backend/src/services/voiceChain.ts` (`cloneVoice()`)
- Endpoint: `POST https://api.elevenlabs.io/v1/voices/add`
- Payload: multipart/form-data — `name`, `remove_background_noise`, `files` (webm audio blob)
- Auth header: `xi-api-key: ELEVENLABS_API_KEY`
- Input: visitor audio recording (webm/opus), max 10MB. Files above 10MB are trimmed.
- Returns `{ voice_id }` on success
- Clones are deleted after `VOICE_CLONE.retentionWindow` (default 10) chain positions via `DELETE https://api.elevenlabs.io/v1/voices/{voice_id}`

**TTS with Timestamps:**
- Used by `packages/karaoke-reader` in `packages/karaoke-reader/src/adapters/elevenlabs/index.ts`
- Endpoint: `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/with-timestamps`
- Payload: `{ text, model_id, output_format, voice_settings }`
- Auth header: `xi-api-key: apiKey` (tablet's `VITE_ELEVENLABS_API_KEY`)
- Default model: `eleven_multilingual_v2`, default format: `mp3_44100_128`
- Returns `{ audio_base64, alignment, normalized_alignment }` — character-level timing converted to word timestamps
- Long text is split into chunks (default 200 words) and stitched together with time offsets
- Results cached in-memory by SHA-256 of `text + voiceId`

**Webhooks (incoming to backend):**
- `POST /webhook/definition` — called by ElevenLabs when agent invokes the `save_definition` tool (`apps/backend/src/routes/webhook.ts`)
  - Body: `{ tool_call_id, tool_name, parameters: { term, definition_text, citations, language }, conversation_id }`
  - Also handled client-side as a `clientTools` callback in `useConversation.ts` for immediate UI update
- `POST /webhook/conversation-data` — called by ElevenLabs post-conversation with full transcript
  - Body: `{ conversation_id, transcript: [{ role, message }], metadata: { duration_seconds } }`
  - All webhook endpoints verify `WEBHOOK_SECRET` via Bearer token or query param `?secret=`

---

### OpenRouter — LLM and Embeddings Proxy

**Embeddings:**
- Used by `apps/backend` in `apps/backend/src/services/embeddings.ts`
- Client: `openai` npm package with `baseURL: 'https://openrouter.ai/api/v1'`
- Model: `openai/text-embedding-3-small`, 1536 dimensions
- Auth: `OPENROUTER_API_KEY` env var
- Called fire-and-forget after each definition is saved; result stored in `definitions.embedding` (pgvector column)

**Chat Completions (voice chain LLM tasks):**
- Used by `apps/backend` in `apps/backend/src/services/voiceChain.ts`
- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions` (raw fetch, not OpenAI SDK)
- Auth header: `Authorization: Bearer OPENROUTER_API_KEY`
- Two tasks:
  1. Speech profile extraction: model `google/gemini-2.0-flash-001`, temperature 0.3, returns structured JSON
  2. Icebreaker generation: model `google/gemini-2.0-flash-001`, temperature 0.9, returns plain text
- Both prompts defined in `packages/shared/src/voiceChainConfig.ts`

**Style transfer (print-renderer, optional):**
- Used by `apps/print-renderer` in `apps/print-renderer/pipeline.py`
- Via n8n webhook (see n8n section below), not direct OpenRouter API call

---

### Supabase — Database, Realtime, Storage, Auth

**Database (PostgreSQL + pgvector):**
- Tables: `sessions`, `turns`, `definitions` (with `embedding VECTOR(1536)`), `print_queue`, `chain_state`, `installation_config`, `texts`, `voice_chain_state`, `render_config`, `prompts`
- Migrations: `supabase/migrations/` (13 files; applied manually via MCP or dashboard — NOT auto-applied)
- pgvector extension enabled via `001_extensions.sql`

**Client usage:**
- Tablet (`apps/tablet/src/lib/supabase.ts`): uses anon key via `createSupabaseClient` from shared
- Backend (`apps/backend/src/services/supabase.ts`): uses service role key
- Printer bridge (`apps/printer-bridge/src/index.ts`): uses service role key (or anon key fallback)
- Print renderer (`apps/print-renderer/supabase_config.py`): Python `supabase` client, service role key
- Config app (`apps/config/src/lib/supabase.ts`): anon key + Supabase Auth (email+password sign-in)
- Archive app (`apps/archive/src/supabase.ts`): anon key

**Tablet direct writes (fire-and-forget):**
- `definitions.insert` — in `apps/tablet/src/lib/persist.ts` (`persistDefinition()`)
- `print_queue.insert` — in `apps/tablet/src/lib/persist.ts` (`persistPrintJob()`)
- `turns.insert` — in `apps/tablet/src/lib/persist.ts` (`persistTranscript()`)
- Storage upload to `portraits-blurred` bucket (`uploadBlurredPortrait()`)

**Realtime:**
- Printer bridge subscribes to `INSERT` on `print_queue` where `status=eq.pending` via `supabase.channel('print_queue_inserts').on('postgres_changes', ...)` in `apps/printer-bridge/src/index.ts`
- Fallback: polling every 5 seconds when Realtime is unavailable
- `turns` table requires a public SELECT policy for the archive to read conversations (noted in CLAUDE.md)

**Storage:**
- Bucket `portraits-blurred`: tablet uploads blurred JPEG portraits (public read)
- Bucket `prints`: print-renderer uploads dithered portrait PNGs for printing

**Auth:**
- Used only in `apps/config` (admin app) via `supabase.auth.signInWithPassword()` and `supabase.auth.signOut()`

**Render config:**
- `render_config` table stores JSONB per-template config with 5s TTL cache in `apps/print-renderer/supabase_config.py`
- Falls back to `apps/print-renderer/config.yaml` when Supabase is unreachable

---

### MediaPipe — In-Browser Face Detection

- Used in `apps/tablet/src/hooks/useFaceDetection.ts`
- Package: `@mediapipe/tasks-vision` ^0.10.18
- WASM runtime loaded from CDN: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm`
- Model loaded from CDN: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
- Also used in `apps/print-renderer/pipeline.py` for face landmark detection (portrait crops); optional with ratio-based fallback
- Detection runs at 2fps (500ms interval), CPU delegate

---

### n8n — Portrait Style Transfer Webhook (optional)

- Used in `apps/print-renderer/main.py` (`process_portrait` endpoint)
- Config: `N8N_WEBHOOK_URL` env var (default: `https://n8n.baufer.beauty/webhook/portrait-statue`)
- Sends portrait JPEG to n8n for style-transfer-to-statue transformation
- Stage skipped if `N8N_WEBHOOK_URL` is not set or `skip_transform=true` is passed
- No SDK; raw HTTP POST via `requests` library

---

## Data Storage

**Databases:**
- Supabase managed PostgreSQL
  - Connection: `SUPABASE_URL` + `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
  - Client: `@supabase/supabase-js` ^2.49.x (TypeScript apps), `supabase` Python package (print-renderer)
  - pgvector extension for `definitions.embedding` (1536 dimensions)

**File Storage:**
- Supabase Storage
  - `portraits-blurred` bucket: blurred visitor portrait JPEGs (public read, tablet writes)
  - `prints` bucket: dithered print-ready portrait PNGs (print-renderer writes, printer bridge reads)

**Caching:**
- `packages/karaoke-reader`: in-memory LRU-style cache for TTS audio (`computeCacheKey` uses `crypto.subtle.digest` SHA-256)
- `apps/print-renderer`: 5-second in-memory TTL cache for `render_config` Supabase fetch

## Authentication & Identity

**ElevenLabs API:**
- Browser-side: `VITE_ELEVENLABS_API_KEY` (public, anon key scoped to TTS + Conversational AI)
- Server-side: `ELEVENLABS_API_KEY` (used in backend for voice cloning + agent PATCH)

**Supabase:**
- Browser (tablet, archive): anon key — limited by RLS policies
- Server (backend, printer bridge, print-renderer): service role key — bypasses RLS
- Config app: anon key + Supabase email/password Auth

**Backend webhook protection:**
- `WEBHOOK_SECRET` verified on all `/webhook/*` routes and `POST /api/config/update`
- Accepts via `Authorization: Bearer <secret>` header OR `?secret=<secret>` query param
- If `WEBHOOK_SECRET` is unset, all requests are allowed (dev mode)

**Print renderer:**
- `RENDER_API_KEY` verified via `X-Api-Key` header (constant-time `hmac.compare_digest`)
- If `RENDER_API_KEY` is unset, all requests are allowed

## Monitoring & Observability

**Error Tracking:**
- Not detected — no Sentry, Datadog, or similar

**Logs:**
- `apps/backend`: Hono's built-in `logger()` middleware (request/response logging) + `console.error/warn`
- All apps: `console.log/warn/error` with `[service/function]` prefix pattern
- Python apps: Python standard `logging` module

## CI/CD & Deployment

**Hosting:**
- Tablet: Coolify, Docker (2-stage: node build → nginx SPA), from GitHub `main` branch
- Backend: Coolify, Docker
- Print renderer: Coolify, Docker (`apps/print-renderer/Dockerfile`)
- Printer bridge: local Pi/laptop, manual `pnpm dev:printer`
- POS server: local Pi, manual `python print_server.py`

**CI Pipeline:**
- Not detected — no GitHub Actions, CircleCI, or similar

**Deployment notes:**
- Coolify requires Base Directory `/` for apps with workspace dependencies (`apps/tablet`, `apps/backend`, `apps/print-renderer`)
- `VITE_*` build args injected only for Vite apps; disabled for runtime-only services
- `pnpm-lock.yaml` must be committed after any dependency change (Coolify uses `--frozen-lockfile`)
- `packages/shared/dist/` must be committed to git for Pi deployment (Pi cannot run `tsc` due to RAM limits)

## Webhooks & Callbacks

**Incoming (from ElevenLabs → backend):**
- `POST /webhook/definition` — agent `save_definition` tool call; saves definition + enqueues print job
- `POST /webhook/conversation-data` — post-conversation transcript + metadata

**Outgoing (backend → ElevenLabs):**
- `PATCH https://api.elevenlabs.io/v1/convai/agents/{id}` — apply voice clone before each voice-chain conversation
- `POST https://api.elevenlabs.io/v1/voices/add` — create instant voice clone
- `DELETE https://api.elevenlabs.io/v1/voices/{id}` — delete stale clones

**Outgoing (tablet → backend):**
- `GET /api/config` — on startup, fetches mode/term/program/voice-chain state
- `POST /api/session/start` — after ElevenLabs session connects
- `POST /api/voice-chain/process` — multipart/form-data with audio + transcript + portrait URL
- `POST /api/voice-chain/apply-voice` — before starting voice-chain conversation (triggers agent PATCH)

**Outgoing (tablet → Supabase directly):**
- INSERT to `definitions`, `print_queue`, `turns` tables (fire-and-forget)
- PUT to `portraits-blurred` storage bucket

**Outgoing (printer bridge → print renderer):**
- `POST {PRINT_RENDERER_URL}/render/dictionary` — render text card as PNG
- Falls back to legacy `POST {POS_SERVER_URL}/print/dictionary` if renderer unavailable

**Outgoing (printer bridge → POS server):**
- `POST {POS_SERVER_URL}/print/image` — send pre-rendered PNG for printing
- `POST {POS_SERVER_URL}/print/batch` — send multiple portrait PNGs for printing

**Outgoing (print-renderer → n8n):**
- `POST {N8N_WEBHOOK_URL}` — portrait-to-statue style transfer (optional)

---

*Integration audit: 2026-03-24*
