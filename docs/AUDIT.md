# MeinUngeheuer — Repository Audit

*Generated 2026-03-24*

---

## What Is This?

An **art installation** where visitors have a spoken AI conversation, and the result gets printed on a thermal receipt card. The visitor reads a text on a tablet, an AI voice agent challenges their understanding of a concept from the text, and a distilled "definition" is printed as a physical takeaway.

Think: conceptual art meets conversational AI meets thermal printer.

---

## The Parts (7 deployable components)

| Component | Tech | Where it runs | What it does |
|-----------|------|--------------|--------------|
| **Tablet** | React 18 / Vite / Tailwind v4 | Docker → nginx (Coolify) | Visitor-facing kiosk. Shows text, connects to voice AI, captures portrait, writes to DB |
| **Backend** | Hono (Node) | Docker (Coolify) | Config API, webhook receiver, voice cloning, chain state, embeddings |
| **Printer Bridge** | Node.js | Locally on a Pi/laptop | Subscribes to Supabase Realtime, renders cards, sends ESC/POS to printer |
| **Print Renderer** | FastAPI (Python 3.11) | Docker (Coolify) | Renders definition cards + portrait crops as dithered PNGs for thermal printing |
| **Config App** | Vanilla TS / Vite | Docker → nginx (Coolify) | Admin UI: program editor, portrait tuner, print preview, text CRUD, definition browser |
| **Archive App** | Vanilla TS / Vite | Docker → nginx (Coolify) | Public browsable archive of past conversations and definitions |
| **POS Server** | Node/Python | Locally on Pi | Receives ESC/POS data over HTTP, sends to USB thermal printer |

**External services:** Supabase (DB + Realtime + Storage + Auth), ElevenLabs (voice conversation SDK), OpenRouter (LLM + embeddings).

---

## The Three Modes

- **Mode A (text_term):** Visitor reads a text on tablet with karaoke-style word highlighting synced to TTS audio. AI picks a concept from the text, has a conversation, produces an aphorism. *Default mode.*
- **Mode B (term_only):** A naked term is shown (e.g., "BIRD"). Conversation. Definition. Print.
- **Mode C (chain):** Previous visitor's definition becomes the next visitor's text context. Exquisite corpse of ideas across visitors.

These are wrapped in **Programs** — named configurations that set the mode, which stages are active (text reading, portrait capture, printing), the system prompt, and the print template. Three programs ship: `aphorism`, `freeAssociation`, `voiceChain`.

---

## Data Flow

```
Visitor speaks → ElevenLabs WebSocket (STT+LLM+TTS) → AI responds
                                                     ↓
                                          AI calls save_definition tool
                                                     ↓
                              Tablet handles it client-side → writes to Supabase
                                                     ↓
                              print_queue INSERT → Realtime event
                                                     ↓
                              Printer Bridge claims job → Print Renderer → ESC/POS → Paper
```

---

## Architecture Diagram

```
┌─────────────────┐
│     Tablet      │ (React/Vite, port 3000 → nginx)
├─────────────────┤
│ Fetches:        │
│  GET /api/config (backend) → mode, term, config
│  WS ElevenLabs SDK → voice I/O
│  Supabase anon inserts: sessions, turns, definitions
│  Supabase anon reads: texts, chain_state, installation_config
└────────┬────────┘
         │
    ┌────┴──────────────────┬─────────────────────┐
    │                       │                     │
    v                       v                     v
┌──────────────┐  ┌─────────────────┐   ┌──────────────────┐
│   Backend    │  │    Supabase     │   │   ElevenLabs     │
│ (Hono, 3001)│  │  (PostgreSQL +  │   │  (WebSocket)     │
├──────────────┤  │    pgvector)    │   ├──────────────────┤
│ GET /api/    │  │                 │   │ save_definition  │
│   config     │  │ Tables:         │   │ tool call        │
│ POST /api/   │  │  sessions       │   │                  │
│   session    │  │  turns          │   │ Webhook:         │
│ POST /webhook│  │  definitions    │   │ POST /webhook/   │
│   /definition│  │  print_queue    │   │    definition    │
│ GET /api/    │  │  installation   │   └──────────────────┘
│   definitions│  │    _config      │
│ GET /api/    │  │  chain_state    │
│   chain      │  │  texts          │
│ POST /api/   │  │  tts_cache      │
│   voice-chain│  │  prompts        │
│   /apply-    │  │  voice_chain_   │
│   voice      │  │    state        │
└──────────────┘  │ Realtime:       │
    │             │  print_queue    │
    │             │  INSERT events  │
    │             └─────────────────┘
    │
    └──────────────────┬──────────────────────────┐
                       │                          │
                       v                          v
            ┌──────────────────────┐  ┌──────────────────────┐
            │  Printer Bridge      │  │  Print Renderer      │
            │  (Node, local)       │  │  (FastAPI, 8000)     │
            ├──────────────────────┤  ├──────────────────────┤
            │ Supabase Realtime    │  │ POST /render/        │
            │ subscription:        │  │   dictionary         │
            │ INSERT print_queue   │  │ POST /render/        │
            │                      │  │   portrait-preview   │
            │ On new job:          │  │ POST /process/       │
            │ 1. Claim (status→    │  │   portrait           │
            │    printing)         │  │ Config from Supabase │
            │ 2. POST /render/     │  │ (render_config table)│
            │    dictionary        │  │                      │
            │ 3. Send to POS @     │  │ + n8n webhook for    │
            │    9100              │  │   style transfer     │
            │ 4. Mark done/error   │  └──────────────────────┘
            └──────────────────────┘
                       │
                       v
            ┌──────────────────────┐
            │  ESC/POS Printer     │
            │  (port 9100)         │
            └──────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Config App (Vanilla TS/Vite)                                │
│  - Programs pipeline editor, portrait tuner, workbench      │
│  - Supabase Auth (email/password)                           │
│  - Authenticated users can update config                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Archive App (Vanilla TS/Vite)                               │
│  - Reads definitions + turns from Supabase (anon)           │
│  - Browse conversations, search by term                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Codebase Numbers

- **~22,200 lines** of source code across **117 files** (TS/TSX/Python)
- **19 test files** / **3,527 lines** of tests
- **13 Supabase migrations** defining 10+ tables
- **5 Dockerfiles** (tablet, backend, print-renderer, config, archive)
- **3 programs** with full system prompts (~320 lines of prompt engineering)

### Code by Component

| Component | Type | Files | LOC |
|-----------|------|-------|-----|
| tablet | TS/TSX React | 37 | 5,831 |
| config | TS Vanilla | 8 | 6,150 |
| karaoke-reader | TS/TSX Component | 26 | 3,666 |
| shared | TS Library | 12 | 1,736 |
| backend | TS Node | 10 | 1,689 |
| printer-bridge | TS Node | 6 | 640 |
| archive | TS Vite | 3 | 322 |
| pos-server | Python | 2 | ~2,400 |
| print-renderer | Python | 7 | ~1,000 |
| supabase migrations | SQL | 13 | 727 |
| **Total** | | **~120** | **~23,600** |

---

## What Is Battle-Tested

### State Machine — production-ready

The tablet's `useInstallationMachine.ts` is a single reducer with 9 screen states (sleep → welcome → consent → text_display → term_prompt → conversation → synthesizing → definition → printing → farewell), 11 action types, and stage gating. It has **443 lines of tests** covering all transitions, config persistence, consent flow, and invalid-transition guards.

### Error Handling — battle-tested

The codebase follows a clear philosophy: **never crash a long-running service**. Every service has comprehensive try/catch, fallback paths, and fire-and-forget for non-critical operations. The printer bridge has dual redundancy (Realtime subscription + 5-second polling fallback) and dual rendering paths (cloud renderer + legacy POS JSON fallback). Graceful shutdown on SIGINT/SIGTERM. 49 try/catch blocks in the backend alone.

### TypeScript Strictness — excellent

`strict: true`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`. **Zero `any` types. Zero `@ts-ignore`.** Zod validation at all API boundaries (49 schemas). Discriminated unions for actions and payloads.

### ElevenLabs Integration — sophisticated

Handles client-side tool delivery (`save_definition`), voice cloning with restoration on disconnect, system prompt injection at session start, dual callback paths, and user activity signaling to prevent WebSocket timeout. 436 lines of integration tests.

### Karaoke Reader — well-tested

Standalone package with 9 test files. ElevenLabs TTS-with-timestamps API returns character-level timing, converted to word-level timestamps. Audio sync via `requestAnimationFrame`. Caching layer for TTS calls. 3,666 lines of code, well-isolated.

### Printer Pipeline — production-grade

2-attempt retry with timeout on all fetch calls (15s render, 10s print, 30s batch). Job claiming with status tracking. Console mode for testing without hardware. Designed for 24/7 unattended operation.

### Code Cleanliness

**Zero TODO/FIXME/HACK comments** in the entire codebase. No technical debt markers.

---

## What Is Less Proven / Has Caveats

### No CI/CD Pipeline

No GitHub Actions or automated tests on push. Testing is manual (`pnpm test`). Deployment is push-to-main via Coolify auto-deploy. If tests break, nothing stops a bad deploy.

### Silent Failure Modes

By design, several operations swallow errors:

- `persistPrintJob()` and `persistDefinition()` — fire-and-forget, no error propagation
- Supabase RLS blocks fail silently (no error in browser)
- Config fetch failure causes silent fallback to defaults (AI has no text context)
- `RENDER_API_KEY` mismatch returns silent 401

These are documented in CLAUDE.md but still dangerous in production.

### Pi Constraints

The Raspberry Pi target can't run `npx tsc` or full `pnpm install` (OOM-kill). The workaround: commit compiled `packages/shared/dist/` to git and never build on the Pi. This works but is fragile — forget to rebuild shared after a change and the Pi runs stale code.

### Portrait Pipeline — newest, least tested

The portrait crop/dither/style-transfer pipeline is the most recent feature work. It involves MediaPipe face detection, n8n webhook for style transfer, multi-crop rendering, and Supabase Storage uploads. Less time in production than the core conversation loop.

### Voice Chain (Mode C) — complex

Voice cloning (clone previous visitor's voice for the next visitor) involves: ElevenLabs API calls to clone/delete voices, speech profile extraction, icebreaker generation. Multiple async operations with external API dependencies.

### Config App — admin-only, no automated tests

Feature-rich workbench (8 tools: programs, print card, dither, slice, portrait, raster painter, texts, definitions) but it's vanilla TypeScript without React — no component tests.

### Archive App — minimal

Simple read-only viewer, low risk but also minimal testing.

### Backend — limited test coverage

695 lines of services, 49 Zod validations, but only passWithNoTests — no logic tests for the backend yet. The Zod schemas and error handling are solid, but route logic is untested.

---

## External Dependencies

| Service | Required For | Failure Impact |
|---------|-------------|----------------|
| **Supabase** | Everything | Total failure — no config, no persistence, no print queue |
| **ElevenLabs** | Voice conversation | No conversation possible, tablet stuck |
| **OpenRouter** | LLM responses + embeddings | No AI responses (conversation dead) |
| **POS Server** | Physical printing | Print queue backs up, no paper output |
| **Print Renderer** | Card rendering | Falls back to legacy JSON rendering (degraded) |
| **n8n** (optional) | Portrait style transfer | Portraits print without style transfer |

---

## Supabase Schema (13 migrations, 727 lines SQL)

### Core Tables

| Table | Purpose |
|-------|---------|
| `sessions` | One row per visitor interaction (mode, term, context, language, duration) |
| `turns` | Conversation transcript lines (role: visitor/agent) |
| `definitions` | Generated output (term, definition_text, citations, embedding via pgvector) |
| `print_queue` | Jobs for printer bridge (status: pending → printing → done → error) |
| `chain_state` | Active chain definition for Mode C |
| `installation_config` | 50+ columns of operator settings |
| `texts` | Curated source texts for Mode A (de/en) |
| `tts_cache` | Cached TTS audio with word-level timestamps |
| `prompts` | System prompts & first messages per program_id |
| `voice_chain_state` | Voice clone tracking, speech profiles, icebreakers |
| `render_config` | Printer template + layout config (JSONB) |
| `programs` | Program pipeline definitions (blocks, sequencing) |

RLS policies: anon can read config/texts/definitions, insert sessions/turns/definitions/print_queue. Authenticated (admin) gets full CRUD.

---

## Environment Variables Required

### Tablet
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ELEVENLABS_API_KEY
VITE_ELEVENLABS_AGENT_ID
VITE_ELEVENLABS_VOICE_ID
VITE_BACKEND_URL            (default: http://localhost:3001)
VITE_PRINT_RENDERER
VITE_RENDER_API_KEY
```

### Backend
```
PORT                        (default: 3001)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
WEBHOOK_SECRET
ELEVENLABS_API_KEY
```

### Printer Bridge
```
SUPABASE_URL
SUPABASE_ANON_KEY
POS_SERVER_URL              (default: http://localhost:9100)
PRINT_RENDERER_URL          (default: http://localhost:8000)
RENDER_API_KEY
```

### Print Renderer
```
OPENROUTER_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
N8N_WEBHOOK_URL
RENDER_API_KEY
```

---

## Deployment

### Cloud (Coolify)
- Docker containers auto-deployed from GitHub `main` branch
- Coolify injects `VITE_*` build args at build time
- Tablet, config, archive: multi-stage Node → nginx (port 80)
- Backend: Node → Hono (port 3001)
- Print renderer: Python → uvicorn (port 8000)
- Lockfile must be committed (`--frozen-lockfile`)

### Local (Gallery Pi/Laptop)
- Printer bridge: `pnpm dev:printer` (manual start)
- POS server: `sudo systemctl start pos-server`
- No build on Pi — uses committed `packages/shared/dist/`
- Update: `git pull origin main && sudo systemctl restart printer-bridge pos-server`

### Database
- Supabase cloud, migrations NOT auto-applied
- Must run manually via dashboard or MCP tools after creation

---

## How to Run Locally

```bash
# Prerequisites: Node 20+, pnpm
pnpm install
pnpm build              # Build shared first, then all apps
pnpm dev                # Start all apps (tablet:3000, backend:3001, printer-bridge)

# Individual apps
pnpm dev:tablet         # Tablet only (port 3000)
pnpm dev:backend        # Backend only (port 3001)
pnpm dev:printer        # Printer bridge only

# Quality checks
pnpm test               # Run all tests (Vitest)
pnpm typecheck          # TypeScript check across workspace
pnpm lint               # Lint all
```

Build order matters: `packages/shared` must build first (other apps import from its compiled output).

---

## Key Files to Understand First

1. `CLAUDE.md` — Project context and conventions (14.6KB)
2. `docs/PRD.md` — Full product requirements
3. `packages/shared/src/types.ts` — All Zod schemas and types
4. `apps/tablet/src/hooks/useInstallationMachine.ts` — State machine
5. `apps/tablet/src/hooks/useConversation.ts` — ElevenLabs integration
6. `packages/shared/src/programs/aphorism.ts` — System prompt (this is what the AI says)
7. `supabase/migrations/002_tables.sql` — Core database schema
8. `apps/backend/src/services/voiceChain.ts` — Voice chain service

---

## Honest Summary

**What this is:** A well-engineered ~22K-line art installation system with a robust architecture for its domain. The conversation-to-print loop is the core, and it's solid. The code quality is genuinely high — strict TypeScript, comprehensive error handling, good test coverage on critical paths, and clear separation of concerns.

**What it isn't:** A production SaaS. There's no CI/CD, no monitoring/alerting, no automated deployment verification, and several intentionally-silent failure paths that assume an operator is nearby.

**Strongest parts:** State machine, ElevenLabs integration, printer bridge resilience, type system, karaoke reader.

**Weakest parts:** No CI, silent failures requiring manual debugging, Pi deployment fragility, portrait pipeline maturity, backend test coverage.

**For an outsider taking this over:** The CLAUDE.md is unusually thorough. The codebase is clean and consistent. You'd need: Node 20, pnpm, a Supabase project, ElevenLabs API key, OpenRouter API key, and (for printing) a thermal printer with the POS server.
