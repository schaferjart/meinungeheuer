# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.7.3 - All Node.js and browser-based code (strict mode, ES2022 target)

**Secondary:**
- Python 3.x - POS (thermal printer) server (`apps/pos-server/`) using Flask
- JavaScript (JSX/TSX) - React components in tablet app

## Runtime

**Environment:**
- Node.js 20+ - Required for all JavaScript apps (tablet, backend, printer-bridge, shared)
- Python 3.x - POS server runtime

**Package Manager:**
- pnpm (workspaces) - Monorepo management with hoisted dependencies
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- React 18.3.1 - UI framework for tablet app (`apps/tablet/`)
- Hono 4.7.2 - Lightweight HTTP API server for backend (`apps/backend/`)

**Streaming & Voice:**
- @elevenlabs/react 0.14.1 - ElevenLabs Conversational AI SDK (WebSocket-based voice pipeline)
- @elevenlabs/client 0.15.0 - ElevenLabs REST client (voice cloning, agent config)

**Build/Dev:**
- Vite 6.x - Build tool for React apps (dev server on port 3000, dev:tablet command)
- @tailwindcss/vite 4.0.7 - Tailwind CSS v4 plugin for Vite (CSS-first configuration)
- @vitejs/plugin-react 4.3.4 - React fast refresh for Vite
- TypeScript Compiler (tsc) - Standalone compilation for backend/printer-bridge/shared
- tsx 4.19.3 - TypeScript execution runner with watch mode

**Testing:**
- Vitest 3.0.5 - Test runner (all workspaces, `pnpm test` runs parallel)
- @testing-library/react 16.3.2 - React component testing utilities
- jsdom 28.1.0 - DOM environment for browser tests
- chai (via Vitest) - Assertion library

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.49.1 - PostgreSQL + Realtime client for tablet, backend, printer-bridge, shared
- zod 3.24.2-3.25.76 - Runtime schema validation (API boundaries, config loading)
- @mediapipe/tasks-vision 0.10.18 - Face detection in-browser (2 fps debounced detection)

**Infrastructure & APIs:**
- openai 4.82.0 - OpenRouter client for embeddings (text-embedding-3-small via OpenRouter proxy)
- @hono/node-server 1.14.0 - Node.js HTTP adapter for Hono
- qrcode 1.5.0 - QR code generation (tablet feature)
- karaoke-reader (workspace) - Custom library for word-level TTS timestamp sync

**Python (POS Server):**
- Flask 3.1.3 - HTTP server for thermal printer commands
- python-escpos 3.1 - ESC/POS printer protocol implementation
- python-barcode 0.16.1 - Barcode generation
- qrcode 8.2 - QR code generation (Python)
- Pillow 12.1.1 - Image processing
- PyYAML 6.0.3 - Config file parsing
- requests 2.31+ - HTTP client
- pytest 7.0+ - Test framework

## Configuration

**Environment:**
- Tablet: `apps/tablet/.env.example`
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` - Browser-safe Supabase access
  - `VITE_ELEVENLABS_API_KEY`, `VITE_ELEVENLABS_AGENT_ID`, `VITE_ELEVENLABS_VOICE_ID` - Voice config
  - `VITE_BACKEND_URL` - Backend API endpoint (default: `http://localhost:3001`)
  - `VITE_PRINT_RENDERER_URL` - Print rendering service endpoint

- Backend: `apps/backend/.env.example`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Full DB access (server-side only)
  - `OPENROUTER_API_KEY` - Embeddings via OpenRouter (proxy to OpenAI)
  - `WEBHOOK_SECRET` - Shared secret for ElevenLabs webhook verification
  - `ELEVENLABS_API_KEY` - Server-side ElevenLabs API key (voice cloning)

- Printer Bridge: `apps/printer-bridge/.env.example`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` - Realtime subscription to `print_queue`
  - `POS_SERVER_URL` - Thermal printer HTTP endpoint (default: `http://localhost:9100`)
  - `PRINT_RENDERER_URL` - Cloud render service
  - `RENDER_API_KEY` - API key for render service

- POS Server: `apps/pos-server/config.yaml`
  - Printer model, port, font paths, barcode config

**TypeScript:**
- `tsconfig.base.json` - Root config (strict mode, ES2022, bundler resolution)
  - Each app extends base: `tsconfig.json`
  - noUncheckedIndexAccess enabled (strict indexing)
  - sourceMap and declarationMap enabled
- Shared package builds to `packages/shared/dist/`
- All apps: `noEmit: true` for `typecheck` task (tsc only)

**Build:**
- Vite config: `apps/tablet/vite.config.ts` (React plugin + Tailwind CSS plugin)
- Root `pnpm-lock.yaml` - Frozen lockfile for Coolify deployments

## Platform Requirements

**Development:**
- Node.js 20+ (enforced in root `package.json`)
- pnpm for workspace management
- Python 3.x for POS server (optional unless testing printer)

**Production:**
- **Tablet:** Docker (2-stage: Node build → nginx SPA)
  - Runs on Coolify, consumes `VITE_*` build args
  - Port 3000 (dev), served via nginx reverse proxy

- **Backend:** Node.js container on Coolify
  - Port 3001 (Hono server)
  - Requires `SUPABASE_*`, `OPENROUTER_API_KEY`, `WEBHOOK_SECRET`

- **Printer Bridge:** Local service (not containerized), runs on Pi or laptop
  - Manual start: `pnpm dev:printer`
  - Requires `SUPABASE_*`, `POS_SERVER_URL`, `PRINT_RENDERER_URL`

- **POS Server:** Python Flask on local network
  - Port 9100 (ESC/POS printer endpoint)
  - Requires USB printer or dummy mode

- **Supabase:** Managed cloud (PostgreSQL + pgvector extension)
  - Migrations in `supabase/migrations/`
  - Realtime subscriptions enabled on `print_queue` table

---

*Stack analysis: 2026-03-24*
