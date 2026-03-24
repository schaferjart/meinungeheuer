# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**ElevenLabs Conversational AI:**
- Service: WebSocket-based voice conversation (speech-to-text, LLM routing, text-to-speech)
- What it's used for: Real-time visitor dialogue with configurable agent system prompts
- SDK/Client: `@elevenlabs/react` (0.14.1) in `apps/tablet/`
- SDK/Client: `@elevenlabs/client` (0.15.0) in `apps/backend/`
- Auth: `VITE_ELEVENLABS_API_KEY` (tablet, browser-safe) and `ELEVENLABS_API_KEY` (backend, server-side)
- Agent ID: `agent_7201kjt1wgyqfjp8zkr68r3ngas6` (stored in `VITE_ELEVENLABS_AGENT_ID`)
- Config: System prompt overridden at session start from `packages/shared/src/programs/` via `useConversation.ts`
- Voice override: Custom voice clones via voice chain (ID in `VITE_ELEVENLABS_VOICE_ID`)
- Webhook: ElevenLabs can POST `save_definition` tool calls to backend `/webhook/save-definition` (optional; client-side tool handling in `useConversation.ts`)

**OpenRouter (LLM Proxy):**
- Service: OpenAI-compatible API for embeddings (proxies to OpenAI backend)
- What it's used for: Semantic embeddings of definitions for similarity search / archive
- Client: `openai` npm package (4.82.0) with custom baseURL in `apps/backend/src/services/embeddings.ts`
- Auth: `OPENROUTER_API_KEY` (backend only, server-side)
- Model: `openai/text-embedding-3-small`
- Dimensions: 1536-dimensional vectors
- Trigger: Fire-and-forget from `/webhook/save-definition` route

**Thermal Printer (Local Network):**
- Service: ESC/POS protocol via HTTP (custom POS server in `apps/pos-server/`)
- What it's used for: Printing personalized glossary definitions on thermal paper cards
- URL: `POS_SERVER_URL` env var (default: `http://localhost:9100`)
- Implementation: Printer bridge subscribes to Supabase `print_queue` table (Realtime), POSTs job payloads to `/print` and `/portrait` endpoints
- Health check: `curl http://192.168.1.65:9100/health`
- Render dependency: Print jobs first POST to `PRINT_RENDERER_URL` (Python Flask render service) to get ESC/POS bytes

## Data Storage

**Databases:**

- **Supabase (PostgreSQL)**
  - Connection: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (tablet), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (backend/bridge)
  - Client: `@supabase/supabase-js` (2.49.1) across all Node apps
  - Tables:
    - `sessions` - One row per visitor interaction (mode, term, context_text, parent_session_id for chain)
    - `turns` - Conversation transcript (role: visitor/agent, content, turn_number)
    - `definitions` - Generated output (term, definition_text, citations[], language, **embedding: VECTOR(1536)**)
    - `print_queue` - Print jobs (payload: JSONB, status: pending/printing/done/error)
    - `chain_state` - Active chain tracking for Mode C
    - `installation_config` - Operator settings (mode, active_term, active_text_id)
    - `texts` - Curated source texts for Mode A (content_de, content_en, terms[])
    - `render_config` - Print template configuration (JSONB columns per template)
    - `voice_chain_profiles` - Visitor speech profiles for voice chain
  - Extensions: pgvector (for semantic search)
  - RLS: Public read on most tables, INSERT/UPDATE restricted to authenticated or service role
  - Realtime: Enabled on `print_queue` (printer bridge subscribes to INSERT events)
  - Migrations: `supabase/migrations/001-013_*.sql` (incremental schema)

**File Storage:**
- Supabase Storage bucket: `portraits-blurred`
  - Stores JPEG portraits (blurred via MediaPipe) as `/portraits-blurred/{uuid}.jpg`
  - Public read access (returns signed URLs or public URLs)
  - Uploaded from tablet via `uploadBlurredPortrait()` in `apps/tablet/src/lib/persist.ts`

**Caching:**
- TTS timestamp cache in Supabase `tts_cache` table
  - Key: hash of text + voice config
  - Value: character-level timestamps from ElevenLabs TTS with-timestamps API
  - Hydrated in `useTextToSpeechWithTimestamps.ts`

## Authentication & Identity

**Auth Provider:**
- Custom (RLS + WEBHOOK_SECRET)
  - Tablet uses Supabase anon key (browser-safe, restricted by RLS policies)
  - Backend uses service role key (full DB access)
  - Webhook calls verified via `WEBHOOK_SECRET` (query param or Authorization header)
  - No user login/signup — visitor interactions are anonymous sessions

**Session Tracking:**
- ElevenLabs conversation ID stored in `sessions.elevenlabs_conversation_id`
- Session UUID generated per interaction (stored in `sessions.id`)
- Chain mode: `sessions.parent_session_id` links to previous visitor's session

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, Rollbar, or equivalent)

**Logs:**
- Console.log/console.error across all apps
- Backend logs to stdout (via `tsx watch`)
- Printer bridge logs to stdout
- POS server logs to stdout (Flask)
- No centralized log aggregation

**Debugging Patterns:**
- Supabase admin dashboard for data inspection
- `mcp__supabase__execute_sql` for direct schema/data queries (documented in CLAUDE.md)

## CI/CD & Deployment

**Hosting:**
- **Tablet**: Coolify (Docker, 2-stage build)
  - Repository: GitHub `main` branch
  - Build args: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ELEVENLABS_*`, `VITE_BACKEND_URL`, `VITE_PRINT_RENDERER_URL`
  - Output: Nginx SPA server

- **Backend**: Coolify (Docker, Node.js)
  - Repository: GitHub `main` branch
  - Port: 3001
  - Env vars: `SUPABASE_*`, `OPENROUTER_API_KEY`, `WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`

- **Printer Bridge**: Local service (Pi/laptop), manual start
  - No CI/CD deployment
  - Git pull + `sudo systemctl restart printer-bridge` (systemd service)

- **POS Server**: Local service (Pi/laptop), manual start
  - Python Flask + systemd service (`pos-server.service`)
  - Git pull + `sudo systemctl restart pos-server`

**CI Pipeline:**
- Not detected (no GitHub Actions, GitLab CI, or equivalent)
- Manual build/test via `pnpm` commands

**Lockfile Strategy:**
- `pnpm-lock.yaml` must be committed after any dependency change
- Coolify uses `--frozen-lockfile` and will fail if lockfile is stale

## Environment Configuration

**Required env vars (Tablet):**
```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ELEVENLABS_API_KEY=sk_...
VITE_ELEVENLABS_AGENT_ID=agent_7201...
VITE_ELEVENLABS_VOICE_ID=xyz... (optional, for voice chain)
VITE_BACKEND_URL=http://localhost:3001 (or https://... in prod)
VITE_PRINT_RENDERER_URL=http://... (cloud render service)
```

**Required env vars (Backend):**
```
PORT=3001
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG... (service role, NOT anon key)
OPENROUTER_API_KEY=sk-or-... (for embeddings)
WEBHOOK_SECRET=your-shared-secret (verified on webhook calls)
ELEVENLABS_API_KEY=... (for voice cloning / agent config)
```

**Required env vars (Printer Bridge):**
```
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=eyJ... (or SERVICE_ROLE_KEY)
POS_SERVER_URL=http://localhost:9100 (or IP of Pi)
PRINT_RENDERER_URL=http://localhost:8000
RENDER_API_KEY=... (API key for render service)
```

**Secrets location:**
- Local dev: `.env` files per app (gitignored)
- Coolify: Environment variable secrets configured in UI
- Pi: Systemd service files with env vars (not committed to git)

## Webhooks & Callbacks

**Incoming:**
- `/webhook/save-definition` (POST) — ElevenLabs agent calls `save_definition` tool
  - Optional: Can be webhook (POST from ElevenLabs) or client-side tool (SDK handles in-browser)
  - Payload schema: `SaveDefinitionWebhookSchema` (Zod)
  - Verification: `WEBHOOK_SECRET` (query param or Authorization header)
  - Response: Triggers embedding generation (fire-and-forget)

- `/webhook/voice-chain` (POST) — Advance voice chain state
  - Payload: `voiceChainPayloadSchema` (definitions, speech profiles, icebreakers)

- `/api/config` (GET) — Tablet fetches mode/text/program on startup
  - No auth (public read)
  - Falls back to defaults if offline

**Outgoing:**
- Tablet → `/webhook/*` (POST via `fetch()`) — Define client-side tools (e.g., `save_definition`)
- Printer bridge → `POS_SERVER_URL/print` (POST) — Send ESC/POS bytes
- Printer bridge → `PRINT_RENDERER_URL/render` (POST) — Render definition to ESC/POS

## Third-Party SDKs & Libraries

**Voice Pipeline:**
- ElevenLabs Conversational AI: WebSocket transport, automatic STT/LLM/TTS orchestration
- No custom speech recognition or TTS — fully delegated to ElevenLabs

**Computer Vision:**
- MediaPipe Face Detection: In-browser, 2 fps (3s wake delay, 30s sleep debounce)
- No cloud vision API (entirely local)

**QR Codes:**
- `qrcode` (npm) on tablet
- `qrcode` (Python) on POS server

**Data Validation:**
- Zod: Runtime schema validation at all API boundaries
- No GraphQL

---

*Integration audit: 2026-03-24*
