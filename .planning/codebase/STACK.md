# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.7–5.8 — all Node.js apps (`apps/backend`, `apps/printer-bridge`, `apps/archive`, `apps/config`) and React app (`apps/tablet`) and both packages (`packages/shared`, `packages/karaoke-reader`)
- Python 3.x — `apps/pos-server` (Flask) and `apps/print-renderer` (FastAPI)

**Secondary:**
- SQL — Supabase migrations in `supabase/migrations/`
- CSS (Tailwind v4) — `apps/tablet` only

## Runtime

**Environment:**
- Node.js >=20.0.0 (enforced via `engines` in root `package.json`)
- Python (no pinned version; venv used in `apps/pos-server/venv` and `apps/print-renderer/venv`)

**Package Manager:**
- pnpm (workspaces)
- Lockfile: `pnpm-lock.yaml` present and required (`--frozen-lockfile` on Coolify)

## Frameworks

**Core:**
- React 18.3.1 — `apps/tablet` (kiosk UI), `packages/karaoke-reader` (component library, React optional peer dep)
- Hono 4.7.2 + `@hono/node-server` 1.14.0 — `apps/backend` HTTP API server
- Flask 3.1.3 + flask-cors 5.0.1 — `apps/pos-server` print HTTP server
- FastAPI + uvicorn — `apps/print-renderer` rendering API

**Build/Dev:**
- Vite 6.1–6.3 — `apps/tablet`, `apps/archive`, `apps/config` (SPA bundler + dev server)
- `@vitejs/plugin-react` 4.3.4 — JSX transform for tablet
- `@tailwindcss/vite` 4.0.7 — Tailwind v4 CSS-first integration (not a PostCSS plugin)
- tsup 8.5.0 — `packages/karaoke-reader` library bundler (ESM + CJS dual output)
- tsx 4.19.3 — `apps/backend` and `apps/printer-bridge` dev runner + watch mode

**Testing:**
- Vitest 3.0.5 — all TypeScript packages and apps
- `@testing-library/react` 16.3.2 — `apps/tablet` and `packages/karaoke-reader`
- `@testing-library/dom` 10.4.1 — `apps/tablet`
- `@testing-library/jest-dom` 6.9.1 — `packages/karaoke-reader`
- `@testing-library/user-event` 14.6.1 — `packages/karaoke-reader`
- jsdom 28.1.0 — `apps/tablet` test environment
- happy-dom 20.8.3 — `packages/karaoke-reader` test environment
- pytest — `apps/pos-server` (in requirements.txt)

**Linting/Formatting:**
- Biome 2.0.0 — `packages/karaoke-reader` only (`biome check src/`)
- No ESLint or Prettier detected in the main apps (Biome used for karaoke-reader)

## Key Dependencies

**Critical:**
- `@elevenlabs/react` 0.14.1 — Conversational AI SDK for `apps/tablet`; handles WebSocket STT+LLM+TTS pipeline. Pinned to exact version (not a range).
- `@elevenlabs/client` ^0.15.0 — Underlying ElevenLabs client used by `@elevenlabs/react`
- `@supabase/supabase-js` ^2.49.1 — Database + Realtime + Storage client. Used in all apps that interact with the database.
- `zod` ^3.24–3.25 — Runtime schema validation at all API/data boundaries; used in `packages/shared`, `apps/backend`, `apps/tablet`, `apps/printer-bridge`
- `openai` ^4.82.0 — `apps/backend` only; used with OpenRouter base URL for embeddings generation (NOT the default OpenAI API)
- `@mediapipe/tasks-vision` ^0.10.18 — In-browser face detection in `apps/tablet`; loads WASM + model from CDN at runtime

**Infrastructure:**
- `@meinungeheuer/shared` (workspace) — shared Zod schemas, Supabase client factory, types, constants, voice chain config, program definitions
- `karaoke-reader` (workspace) — TTS-with-timestamps karaoke component and ElevenLabs adapter; consumed by `apps/tablet`
- `qrcode` ^1.5.0 — QR code generation in `apps/tablet` (for print cards linking to archive)
- `hono/cors` + `hono/logger` — Hono built-in middleware in `apps/backend`

**Python (pos-server):**
- `python-escpos` 3.1 — ESC/POS printer communication
- `Pillow` 12.1.1 — image processing for print output
- `Flask` 3.1.3 — HTTP server
- `pyusb` 1.3.1 — USB printer connectivity
- `zeroconf` 0.146.0 — network printer discovery
- `qrcode` 8.2 — QR generation for print cards

**Python (print-renderer):**
- `FastAPI` + `uvicorn` — rendering API server
- `Pillow` — image processing (dithering, cropping, resizing)
- `mediapipe` — face landmark detection for portrait crops
- `numpy` — image array operations
- `supabase` Python client — uploads to Supabase Storage, inserts `print_queue`
- `python-dotenv` — loads `.env` at startup

## Configuration

**Environment — Tablet (`apps/tablet/.env`):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `VITE_ELEVENLABS_API_KEY` — ElevenLabs API key (for TTS-with-timestamps in karaoke)
- `VITE_ELEVENLABS_AGENT_ID` — ElevenLabs Conversational AI agent ID
- `VITE_ELEVENLABS_VOICE_ID` — ElevenLabs voice ID for karaoke TTS
- `VITE_BACKEND_URL` — Backend API URL (default `http://localhost:3001`)
- `VITE_PRINT_RENDERER_URL` — Print renderer URL for config workbench

**Environment — Backend (`apps/backend/.env`):**
- `PORT` — HTTP port (default 3001)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Full DB access (never expose to browser)
- `OPENROUTER_API_KEY` — For embeddings (`openai/text-embedding-3-small`) and LLM calls via OpenRouter
- `WEBHOOK_SECRET` — Shared secret verified on all `/webhook/*` and admin endpoints
- `ELEVENLABS_API_KEY` — Server-side ElevenLabs key for voice cloning

**Environment — Printer Bridge (`apps/printer-bridge/.env`):**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — or `SUPABASE_SERVICE_ROLE_KEY`
- `POS_SERVER_URL` — POS server address (default `http://localhost:9100`)
- `PRINT_RENDERER_URL` — Cloud render API URL (default `http://localhost:8000`)
- `RENDER_API_KEY` — API key for authenticating to print-renderer

**Environment — Print Renderer (`apps/print-renderer/.env`):**
- `OPENROUTER_API_KEY` — For style transfer LLM calls
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Storage uploads + print_queue inserts
- `N8N_WEBHOOK_URL` — n8n workflow endpoint for portrait-to-statue style transfer
- `RENDER_API_KEY` — Secret for authenticating incoming requests

**Build:**
- `tsconfig.base.json` — root TypeScript config; strict mode, ES2022 target, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- Per-app `tsconfig.json` extends base config
- `karaoke-reader` uses tsup for dual ESM+CJS output; four entry points
- Tablet, archive, config use Vite builds with `tsc --noEmit` typecheck step
- Supabase migrations in `supabase/migrations/` — NOT auto-applied; manual via MCP or dashboard

## Platform Requirements

**Development:**
- Node.js 20+, pnpm
- Python 3 + venv for `pos-server` and `print-renderer`
- ElevenLabs API key, OpenRouter API key, Supabase project (free tier supported)

**Production:**
- **Tablet**: Docker (nginx SPA), deployed via Coolify from `main` branch, `VITE_*` as build args
- **Backend**: Docker or Node.js process, deployed via Coolify
- **Printer bridge**: Node.js process on Pi/laptop; local to printer, NOT cloud-deployed
- **POS server**: Python Flask on Pi, port 9100 (`192.168.1.65:9100` in production)
- **Print renderer**: Docker (FastAPI), deployed via Coolify; Base Directory `/` (depends on shared)
- **Config app**: Vite SPA, self-contained
- **Archive app**: Vite SPA, self-contained
- **Supabase**: Managed cloud (PostgreSQL + pgvector + Realtime + Storage)

---

*Stack analysis: 2026-03-24*
