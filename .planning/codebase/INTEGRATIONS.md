# External Integrations

## External APIs

### ElevenLabs Conversational AI

**Usage:** Voice conversation loop (speech-to-text, LLM inference, text-to-speech)

**Client Libraries:**
- `@11labs/react@0.2.0` — React hook for WebSocket conversation
- `@11labs/client@0.2.0` — ElevenLabs SDK
- `@elevenlabs/client@0.15.0` — REST client for TTS with-timestamps API

**Integration Points:**

1. **Tablet app** (`apps/tablet/src/hooks/useConversation.ts`):
   - Hook: `useConversation()` wraps ElevenLabs `useConversation` hook
   - Establishes WebSocket connection to ElevenLabs agent
   - Maps roles: ElevenLabs "user"/"ai" → shared types "visitor"/"agent"
   - Configuration:
     - Agent ID: `VITE_ELEVENLABS_AGENT_ID` (env)
     - Voice ID: `VITE_ELEVENLABS_VOICE_ID` (env)
     - System prompt: Built dynamically per mode/term in `apps/tablet/src/lib/systemPrompt.ts`
     - Overrides passed to SDK at session start; agent dashboard prompt is a placeholder
   - Transcript collection: role + content + timestamp per turn
   - Handles `save_definition` tool call via webhook

2. **TTS with-timestamps** (`apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts`):
   - Calls ElevenLabs REST endpoint with `with_timestamps=true`
   - Response shape: `{ audio_base64, alignment, normalized_alignment }`
   - Character-level timestamps converted to word-level for karaoke highlighting
   - TTS cache stored in Supabase `tts_cache` table (SHA-256(text + voiceId) key)

3. **Voice settings** (configured in ElevenLabs dashboard, applied per-voice):
   - stability: 0.35
   - similarity_boost: 0.65
   - style: 0.6
   - For expressive reading of philosophical texts

4. **Webhook callback** (`apps/backend/src/routes/webhook.ts`):
   - Receives `POST /webhook/definition` when agent calls `save_definition` tool
   - Webhook secret verification: Bearer token or ?secret query param
   - Payload schema (Zod):
     ```typescript
     {
       tool_call_id: string,
       tool_name: "save_definition",
       parameters: { term, definition_text, citations, language },
       conversation_id: string
     }
     ```
   - Triggers definition save, embedding generation, chain advancement

5. **Mode-based system prompts** (`apps/tablet/src/lib/systemPrompt.ts`):
   - **text_term:** Open-ended exploration of concepts emerging from visitor's reading
   - **term_only:** Direct conversation about a predefined term
   - **chain:** Context set from previous visitor's definition
   - All prompts injected via SDK overrides; not stored on ElevenLabs dashboard

### OpenRouter (via OpenAI SDK)

**Usage:** Generate embeddings for definitions (semantic similarity, chain context)

**Configuration:**
- Base URL: `https://openrouter.ai/api/v1`
- Model: `openai/text-embedding-3-small`
- Dimensions: 1536
- API Key: `OPENROUTER_API_KEY` (backend env)

**Integration Point:**
- Backend service (`apps/backend/src/services/embeddings.ts`)
- Async function `generateEmbedding(definitionId)` called fire-and-forget from webhook
- Fetches definition text from Supabase
- Combines term + definition_text for richer embedding
- Stores 1536-dim vector in `definitions.embedding` (pgvector)
- Never throws; errors logged and non-blocking

**Client Library:**
- `openai@4.82.0` — OpenAI SDK (compatible with OpenRouter baseURL override)

### OpenAI (Embeddings Only)

Same as OpenRouter above — the OpenAI SDK is pointed to OpenRouter's API.

## Database: Supabase (PostgreSQL)

**Deployment Model:**
- Cloud PostgreSQL (Supabase free tier)
- **Service Role Key:** Full DB access (backend only, never exposed)
- **Anon Key:** Limited RLS access (tablet + printer-bridge)

**Client Libraries:**
- `@supabase/supabase-js@2.49.1` — All apps

**URL:** `SUPABASE_URL` (env)

### Schema Overview

**Core Tables:**

1. **sessions**
   ```sql
   id UUID PRIMARY KEY
   created_at, ended_at TIMESTAMPTZ
   mode TEXT ('text_term' | 'term_only' | 'chain')
   term TEXT
   context_text TEXT (for text_term / chain modes)
   parent_session_id UUID (chain parent link)
   language_detected TEXT
   duration_seconds INT
   turn_count INT
   card_taken BOOLEAN
   elevenlabs_conversation_id TEXT
   audio_url TEXT
   ```
   - One row per visitor interaction

2. **turns**
   ```sql
   id UUID PRIMARY KEY
   session_id UUID FOREIGN KEY → sessions
   turn_number INT
   role TEXT ('visitor' | 'agent')
   content TEXT
   language TEXT
   created_at TIMESTAMPTZ
   ```
   - Conversation transcript (many per session)

3. **definitions**
   ```sql
   id UUID PRIMARY KEY
   session_id UUID FOREIGN KEY → sessions (UNIQUE)
   term TEXT
   definition_text TEXT
   citations TEXT[] (array of strings)
   language TEXT
   chain_depth INT (default 0)
   created_at TIMESTAMPTZ
   embedding VECTOR(1536) (pgvector)
   ```
   - One definition per session
   - Embedding generated async (fire-and-forget)

4. **print_queue**
   ```sql
   id UUID PRIMARY KEY
   session_id UUID FOREIGN KEY → sessions
   payload JSONB (print layout + content)
   printer_config JSONB (printer settings)
   status TEXT ('pending' | 'printing' | 'done' | 'error')
   created_at, printed_at TIMESTAMPTZ
   ```
   - Jobs for thermal printer bridge
   - Printer-bridge subscribes via Realtime to `status='pending'` inserts

5. **chain_state**
   ```sql
   id UUID PRIMARY KEY
   definition_id UUID FOREIGN KEY → definitions
   is_active BOOLEAN (default true)
   created_at TIMESTAMPTZ
   ```
   - Tracks active definition in chain (Mode C)
   - Next visitor's context is previous definition

6. **installation_config**
   ```sql
   id UUID PRIMARY KEY
   mode TEXT (default 'term_only')
   active_term TEXT (default 'BIRD')
   active_text_id TEXT (for text_term mode)
   updated_at TIMESTAMPTZ
   ```
   - Operator-configurable settings
   - Fetched by tablet on startup via `GET /api/config`

7. **texts**
   ```sql
   id TEXT PRIMARY KEY
   title TEXT
   content_de TEXT (German version)
   content_en TEXT (English version)
   terms TEXT[] (extractable concepts)
   created_at TIMESTAMPTZ
   ```
   - Curated source texts for Mode A (text_term)
   - Currently seeded: Kleist (DE/EN), Netzwerke (DE), Kreativitätsrant (EN)

8. **tts_cache**
   ```sql
   cache_key TEXT PRIMARY KEY (SHA-256(text + voiceId))
   audio_base64 TEXT
   alignment JSON (character-level timing from ElevenLabs)
   created_at TIMESTAMPTZ
   ```
   - TTS responses cached to avoid re-generation
   - Tablet reads/writes via anon key

### Migrations

Located in `supabase/migrations/`:
1. `001_extensions.sql` — Enable pgvector
2. `002_tables.sql` — Create all tables (shown above)
3. `003_indexes.sql` — Performance indexes
4. `004_rls.sql` — Row-level security policies
5. `005_seed.sql` — Initial config + admin user
6. `006_kreativitaetsrant_and_tts_cache.sql` — Text seeding
7. `007_anon_insert_definitions.sql` — RLS rule for anon inserts

### Row-Level Security (RLS)

- Anon key: Can INSERT to `definitions`, `turns`, `sessions`
- Anon key: Can read `texts`, `tts_cache`
- Service role: Full access (backend webhooks, admin operations)
- Printer-bridge: Uses anon key for read + update `print_queue` (status transitions)

### Realtime Subscriptions

- **Printer-bridge** subscribes to `print_queue` table (`status='pending'` filter)
- **Admin dashboard** can subscribe to definitions feed
- Channel: `public:print_queue` with Realtime enabled in RLS policies

## Authentication & Access Control

### No User Authentication

- **Installation is public** — anyone can tap the tablet, no login required
- **Anon Supabase key** used by tablet + printer-bridge
- **Service role key** used by backend (never exposed to client)

### Webhook Secret Verification

- **Backend middleware** (`apps/backend/src/routes/webhook.ts`):
  - Expects ElevenLabs to send webhook secret in:
    - Query param: `?secret=...`
    - Header: `Authorization: Bearer ...`
  - Skipped in dev if `WEBHOOK_SECRET` not set
  - Returns 401 Unauthorized if mismatch

### Environment Variable Isolation

- Tablet (browser): `VITE_*` vars only (built into JS)
  - ElevenLabs API key visible to client (necessary for WebSocket)
  - Supabase anon key visible to client (necessary for DB access)
- Backend: Server env vars
  - Service role key (never sent to client)
  - OpenRouter API key (backend-only)
- Printer-bridge: Local env vars

## Webhooks & Event Flow

### ElevenLabs → Backend Webhook Flow

```
1. Visitor asks question in conversation
2. ElevenLabs agent invokes "save_definition" tool
3. ElevenLabs sends tool_call webhook to:
   POST https://YOUR_BACKEND/webhook/definition
   Payload: { tool_call_id, tool_name, parameters, conversation_id }
   Secret: Bearer token or query param

4. Backend webhook handler:
   - Verifies secret
   - Parses body (Zod schema)
   - Saves definition to Supabase.definitions
   - Calls generateEmbedding(definitionId) async (fire-and-forget)
   - Calls advanceChain() if mode='chain'
   - Inserts print_queue job
   - Returns 200 OK

5. Tablet waits for definition via:
   - Callback in useConversation: onDefinitionReceived(result)
   - OR watches Supabase Realtime (optional)

6. Definition screen displays result
   → Printing screen triggers print
   → Printer-bridge picks up from print_queue
```

### Async Tasks (Non-blocking)

All async operations in backend use fire-and-forget pattern with error logging:

1. **Embedding generation** (`generateEmbedding`)
   - Fetches definition, generates vector, stores in DB
   - Failure: logged, conversation continues

2. **Chain advancement** (`advanceChain`)
   - Updates chain_state for Mode C
   - Failure: logged, conversation continues

3. **Tablet definition persist** (`persistDefinition`)
   - Client-side: Supabase INSERT to definitions table
   - Awaited by tablet but non-blocking to UI

### Printer Bridge Realtime Subscription

```typescript
// In apps/printer-bridge/src/index.ts
const channel = supabase
  .channel('public:print_queue')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'print_queue' },
    async (payload) => {
      // Process new job
      await processJob(payload.new.id, payload.new.payload);
    }
  )
  .subscribe();

// Job lifecycle:
// 1. Webhook creates INSERT print_queue (status='pending')
// 2. Printer bridge receives INSERT event
// 3. Claims job (UPDATE status='printing')
// 4. Formats + prints
// 5. Marks done (UPDATE status='done') or error (status='error')
```

## Data Flow Summary

```
Tablet (browser)
    ↓ WebSocket (ElevenLabs SDK)
ElevenLabs Agent (Conversational AI)
    ↓ HTTP POST /webhook/definition
Backend (Hono server)
    ├→ Supabase: Save definition + insert print_queue
    ├→ OpenRouter: Generate embedding (async, fire-and-forget)
    └→ Supabase Realtime: Notify printer-bridge of new job
        ↓
    Printer-bridge (local Node.js)
        ├→ Realtime subscription for INSERT on print_queue
        ├→ Claim job (UPDATE status='printing')
        └→ Print thermal card (ESC/POS)
            └→ Mark done (UPDATE status='done')

Tablet (browser)
    ↓ Realtime subscription (optional)
    Shows definition + printing status
    ↓ User takes card, triggers completion
    → Session ends, cycle repeats
```

## Important Configuration Notes

### ElevenLabs Dashboard Setup

- Create agent with placeholder system prompt (gets overridden per session)
- Configure tool: `save_definition` with parameters: term, definition_text, citations, language
- Set webhook URL: `https://YOUR_BACKEND/webhook/definition`
- Configure webhook secret (shared with backend WEBHOOK_SECRET env var)
- Agent ID: stored in `VITE_ELEVENLABS_AGENT_ID`

### Supabase Setup

- Enable pgvector extension (via migrations)
- Set up RLS policies (via migrations)
- Create anon + service role keys
- Configure Realtime for print_queue table

### OpenRouter Account

- Requires API key with embeddings quota
- Model: `openai/text-embedding-3-small`
- Async fire-and-forget pattern ensures failures don't block conversation

### Deployment Secrets

- Backend: Vercel environment variables for all backend env vars
- Tablet: Build-time Vite vars (baked into JS)
- Printer-bridge: Local .env file (never deployed to cloud)
