# denkfink

## Three modes

The tablet app supports three modes, configured at runtime via a Supabase-backed config:

- **Mode A — `text_term`** *(default)*
  The visitor reads a text on the tablet with karaoke-style word highlighting synchronised to TTS audio. The AI picks a concept from the text, challenges the visitor's understanding via voice, then a distilled definition is printed. Shipping example uses Kleist's *Über die allmähliche Verfertigung der Gedanken beim Reden*.

- **Mode B — `term_only`**
  A naked term is shown (e.g. `BIRD`). Conversation → definition → print. No seed text.

- **Mode C — `chain`**
  The previous visitor's definition becomes the next visitor's text context. An exquisite corpse of ideas across an exhibition night.

---

## Architecture

```
   ┌────────────────────────────┐        ┌──────────────────────────┐
   │  Tablet (React / Vite)     │ ─ WS ─▶│ ElevenLabs Conversational│
   │  - Karaoke text reader     │        │ AI   (STT + LLM + TTS)   │
   │  - Voice conversation UI   │◀─ WS ─ └────────┬─────────────────┘
   │  - Face-detect wake        │                 │
   └──────┬─────────────────────┘                 │  (custom LLM endpoint)
          │                                       ▼
          │  HTTPS                     ┌──────────────────────┐
          ▼                            │  OpenRouter (Gemini) │
   ┌──────────────────┐                └──────────────────────┘
   │  Backend (Hono)  │
   │  - /api/config   │
   │  - chain state   │
   └──────┬───────────┘
          │
          ▼                            ┌───────────────────────┐
   ┌──────────────────┐   Realtime     │  Printer bridge       │
   │   DB             │───────────────▶│  (Node, local LAN)    │
   │  - postgres      │                │  - ESC/POS layout     │
   │  - pgvector      │                │  - Prints via         │
   │  - realtime      │                │    print-renderer →   │
   │  - storage       │                │    POS server         │
   └──────────────────┘                └────────────┬──────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │ Thermal printer  │
                                           │ (ESC/POS, 576px) │
                                           └──────────────────┘
```

### Monorepo layout (pnpm workspaces)

```
apps/
  tablet/           React web app — kiosk, karaoke reader, voice UI
  backend/          Hono API — /api/config, session/chain state
  archive/          Public browsable archive of past definitions
  config/           Admin / operator UI (pipeline + workbench)
  printer-bridge/   Local Node service — Supabase Realtime → POS server
  pos-server/       Python ESC/POS bridge (runs on the Pi next to the printer)
  print-renderer/   FastAPI service that rasterises cards (dither, layout)
packages/
  shared/           Types, Supabase client, constants, system prompts
  karaoke-reader/   Standalone word-highlight reader (publishable)
supabase/
  migrations/       Schema migrations applied to your Supabase project
scripts/            One-off ops scripts (conversation export, import)
```

---

## Prerequisites

| Service         | Used for                                        |
| --------------- | ----------------------------------------------- |
| Supabase        | Postgres + pgvector + Realtime + Storage + Auth |
| ElevenLabs      | Conversational AI agent (STT + TTS + LLM glue) |
| OpenRouter      | LLM the ElevenLabs agent calls                  |
| OpenAI          | Embeddings (only)                               |
| ESC/POS printer | Actual thermal receipt printer on a LAN         |

And locally:

- **Node.js 20+** and **pnpm** (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Python 3.11+** (for `print-renderer` and `pos-server`)
- **Docker** (optional — for the one-command local dev path)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_ORG/denkfink.git
cd denkfink
pnpm install
pnpm build       # builds packages/installation-core (dist/ is consumed by the apps)
```

### 2. Supabase

1. Create a new project at [app.supabase.com](https://app.supabase.com).
2. Apply the schema:

   ```bash
   # Using the Supabase CLI (recommended):
   supabase link --project-ref <your-project-ref>
   supabase db push

   # Or, in the Supabase SQL editor, paste each file from supabase/migrations/
   # in chronological order.
   ```

3. Enable **Realtime** on the `print_queue` table (Database → Replication).
4. Create a storage bucket called `prints` (public read). This is where
   rendered card PNGs are uploaded for the printer bridge to pick up.

### 3. ElevenLabs agent

1. Create a Conversational AI agent in the ElevenLabs dashboard.
2. In the agent's *LLM* tab choose **Custom LLM** and point it at
   `https://openrouter.ai/api/v1` with your OpenRouter key and any model
   that supports tool use (we default to `google/gemini-2.0-flash-001`).
3. Register the `save_definition` **client tool** on the agent (definition
   lives in [`packages/installation-core/src/clientTools.ts`](packages/installation-core/src/clientTools.ts)).
4. Copy the agent ID — you'll paste it into `.env` in the next step.

### 4. Environment variables

Each app has a `.env.example` — copy it to `.env` and fill in:

```bash
cp apps/tablet/.env.example        apps/tablet/.env
cp apps/backend/.env.example       apps/backend/.env
cp apps/printer-bridge/.env.example apps/printer-bridge/.env
cp apps/print-renderer/.env.example apps/print-renderer/.env   # if present
```

| Key                           | Where             | Notes                                    |
| ----------------------------- | ----------------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`           | tablet, archive, config | from Supabase dashboard           |
| `VITE_SUPABASE_ANON_KEY`      | tablet, archive, config | from Supabase dashboard           |
| `SUPABASE_URL`                | backend, printer-bridge | same URL                          |
| `SUPABASE_SERVICE_ROLE_KEY`   | backend, printer-bridge | **server-only**, never in Vite   |
| `VITE_ELEVENLABS_API_KEY`     | tablet            | from ElevenLabs dashboard               |
| `VITE_ELEVENLABS_AGENT_ID`    | tablet            | the agent you created                    |
| `ELEVENLABS_AGENT_ID`         | backend           | same agent                               |
| `OPENROUTER_API_KEY`          | backend, print-renderer | for LLM + portrait style transfer |
| `OPENAI_API_KEY`              | backend           | embeddings only                          |
| `VITE_ARCHIVE_BASE`           | tablet *(optional)* | public URL where the archive app is deployed; used for QR codes on printed cards. Leave unset to skip the QR. |

### 5. Run it

```bash
pnpm dev               # starts tablet (3000) + backend (3001) + printer-bridge in parallel
# or individually:
pnpm dev:tablet
pnpm dev:backend
pnpm dev:printer
```

Open <http://localhost:3000>. You should see the welcome screen. Tap to start → voice conversation → definition screen. Printing will only work if a printer bridge + printer are reachable (see [docs/PI_SETUP.md](docs/PI_SETUP.md)).

### 5b. One-command local dev (Docker)

If you have Docker, `docker compose up` will bring up the tablet + backend + print-renderer + printer-bridge against your Supabase project. See [docker-compose.yml](docker-compose.yml).

---

## Customisation

- **Texts visitors read** — `supabase/migrations/*` seeds a `texts` table, but you can CRUD rows directly in the Supabase UI or through `apps/config`.
- **System prompts** — the agent's personality and behaviour are described in [`packages/installation-core/src/programs/`](packages/installation-core/src/programs/). Each mode has its own prompt builder.
- **Voice** — configure voice ID + model in the ElevenLabs agent's *Voice* tab.
- **Branding** — the visible name "denkfink" is centralised in
  [`packages/installation-core/src/constants.ts`](packages/installation-core/src/constants.ts) (`APP_NAME`)
  and pulled into system prompts, admin UI, logs, and printed card citations.
  Static HTML titles (`apps/tablet/index.html`, etc.) are updated in place.
  Workspace scopes (`@denkfink/*`) are independent identifiers; rename via
  find/replace if you want your own scope.
- **Card layout** — `apps/print-renderer` uses Jinja-like templates. See
  its `config.yaml` for dimensions, fonts, and dither settings.

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for a generic deployment guide (any Docker host) and a Coolify-specific example.

For the Raspberry-Pi side that drives the printer, see [docs/PI_SETUP.md](docs/PI_SETUP.md).

---

## Development

- `pnpm typecheck` — strict TS across the workspace
- `pnpm test`       — Vitest across the workspace
- `pnpm lint`       — per-app linting
- `pnpm build`      — build every app (shared package first)

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). 
