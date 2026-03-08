# Technology Stack

**Analysis Date:** 2026-03-08

## Languages

**Primary:**
- TypeScript 5.7+ — All application code across every workspace package

**Secondary:**
- SQL — Supabase migrations in `supabase/migrations/*.sql`
- CSS — Tailwind v4 in tablet app (`apps/tablet/src/index.css`), plain CSS in karaoke-reader (`packages/karaoke-reader/src/styles.css`)

## Runtime

**Environment:**
- Node.js >= 20.0.0 (enforced in root `package.json` `engines` field)
- Browser (tablet app runs in kiosk-mode browser on a physical tablet)

**Package Manager:**
- pnpm 9.x (lockfile version 9.0)
- Lockfile: present (`pnpm-lock.yaml`)
- Corepack enabled in Docker builds (`corepack enable && corepack prepare pnpm@latest`)

## Monorepo Structure

**Workspace definition:** `pnpm-workspace.yaml`
```
packages:
  - 'apps/*'
  - 'packages/*'
```

**Workspace packages:**
| Package | Name | Type |
|---------|------|------|
| `apps/tablet` | `@meinungeheuer/tablet` | React SPA (Vite) |
| `apps/backend` | `@meinungeheuer/backend` | Hono HTTP server |
| `apps/printer-bridge` | `@meinungeheuer/printer-bridge` | Long-running Node.js process |
| `packages/shared` | `@meinungeheuer/shared` | Shared types, Supabase client, constants |
| `packages/karaoke-reader` | `karaoke-reader` | Publishable React library (tsup) |

**Build order matters:** `@meinungeheuer/shared` and `karaoke-reader` must build first — other packages import from their compiled output.

## Frameworks

**Core:**
- React 18.3 — Tablet UI (`apps/tablet`)
- Hono 4.7 — Backend HTTP framework (`apps/backend`), lightweight, Vercel-compatible
- Vite 6.1 — Tablet dev server and build tool (`apps/tablet/vite.config.ts`)

**Testing:**
- Vitest 3.0 — Test runner across all packages
- Testing Library (React 16.3, jest-dom 6.9, user-event 14.6) — Component tests in `karaoke-reader`
- happy-dom 20.8 — DOM environment for Vitest in `karaoke-reader`

**Build/Dev:**
- tsc — Build step for `shared`, `backend`, `printer-bridge` (compile TS to JS)
- tsup 8.5 — Build step for `karaoke-reader` (ESM + CJS dual output with DTS)
- tsx 4.19 — Dev mode for `backend` and `printer-bridge` (`tsx watch --env-file=.env`)
- `@vitejs/plugin-react` 4.3 — React Fast Refresh in Vite
- `@tailwindcss/vite` 4.0 — Tailwind CSS v4 Vite plugin (CSS-first config, not JS config)

**Linting/Formatting:**
- Biome 2.0 — Used in `karaoke-reader` only (`packages/karaoke-reader/biome.json`)
- No ESLint or Prettier configuration at project level (only in `karaoke-reader`)

## Key Dependencies

**Critical:**
- `@11labs/react` ^0.2.0 — ElevenLabs Conversational AI React SDK (WebSocket voice pipeline)
- `@11labs/client` ^0.2.0 — ElevenLabs client SDK (low-level)
- `@elevenlabs/client` ^0.15.0 — ElevenLabs REST API client (TTS with timestamps)
- `@supabase/supabase-js` ^2.49.1 — Supabase client (used in all 4 packages)
- `zod` ^3.24+ — Runtime validation at API boundaries (all packages)
- `openai` ^4.82.0 — OpenAI-compatible SDK (used to call OpenRouter for embeddings)

**Infrastructure:**
- `@hono/node-server` ^1.14.0 — Runs Hono on Node.js (`apps/backend/src/index.ts`)
- `hono` ^4.7.2 — Core HTTP framework with built-in cors, logger middleware
- `@mediapipe/tasks-vision` ^0.10.18 — In-browser face detection (tablet)

**Internal:**
- `karaoke-reader` workspace:* — Word-by-word text highlighting synced to audio
- `@meinungeheuer/shared` workspace:* — Shared types, DB client, constants

## TypeScript Configuration

**Base config:** `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Per-package overrides:**
- `apps/tablet/tsconfig.json`: `jsx: "react-jsx"`, `noEmit: true`, relaxes `noUnusedLocals`/`noUnusedParameters`
- `apps/backend/tsconfig.json`: `outDir: "./dist"`, `types: ["node"]`
- `apps/printer-bridge/tsconfig.json`: same pattern as backend
- `packages/shared/tsconfig.json`: `outDir: "./dist"`, `rootDir: "./src"`

## Configuration

**Environment:**
- Each app has its own `.env` file (not committed) with `.env.example` tracking shape
- Tablet uses `VITE_` prefix for client-side env vars (Vite convention)
- Backend/printer-bridge use `tsx watch --env-file=.env` for env loading
- Docker build passes `VITE_*` vars as build args

**Required env vars per app:**

| App | Variable | Purpose |
|-----|----------|---------|
| tablet | `VITE_SUPABASE_URL` | Supabase project URL |
| tablet | `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| tablet | `VITE_ELEVENLABS_API_KEY` | ElevenLabs API key (TTS) |
| tablet | `VITE_ELEVENLABS_AGENT_ID` | ElevenLabs agent ID (conversation) |
| tablet | `VITE_ELEVENLABS_VOICE_ID` | ElevenLabs voice ID |
| tablet | `VITE_BACKEND_URL` | Backend API URL |
| backend | `SUPABASE_URL` | Supabase project URL |
| backend | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
| backend | `OPENROUTER_API_KEY` | OpenRouter API key (embeddings) |
| backend | `WEBHOOK_SECRET` | Shared secret for webhook auth |
| backend | `PORT` | Server port (default 3001) |
| printer-bridge | `SUPABASE_URL` | Supabase project URL |
| printer-bridge | `SUPABASE_ANON_KEY` | Supabase anonymous key |
| printer-bridge | `POS_SERVER_URL` | POS thermal printer server URL |

## Build & Dev Commands

```bash
pnpm dev              # Start all apps in parallel
pnpm dev:tablet       # Tablet only (Vite, port 3000)
pnpm dev:backend      # Backend only (tsx watch, port 3001)
pnpm dev:printer      # Printer bridge only
pnpm build            # Build shared first, then all apps
pnpm test             # Run all tests (Vitest)
pnpm typecheck        # TypeScript check across workspace
pnpm lint             # Lint all
```

## Deployment

**Tablet:**
- Docker 2-stage build: `node:20-slim` (build) + `nginx:alpine` (serve)
- Dockerfile at root: `/Dockerfile`
- Deployed via Coolify (self-hosted PaaS)
- Accepts `VITE_*` build args for environment configuration

**Backend:**
- Vercel serverless deployment
- Config: `apps/backend/vercel.json` (uses `@vercel/node` builder)
- All routes mapped to `src/index.ts`

**Printer Bridge:**
- Runs locally on Raspberry Pi or laptop near physical printer
- Not deployed to cloud — started via `pnpm dev:printer` or `node dist/index.js`

## Platform Requirements

**Development:**
- Node.js 20+
- pnpm (installed via corepack)
- ElevenLabs account (API key + agent configured in dashboard)
- Supabase project (free tier works)
- OpenRouter account (for embeddings)

**Production:**
- Docker host for tablet (or any static file server)
- Vercel account for backend
- Physical hardware: tablet device, Raspberry Pi, ESC/POS thermal printer
- Network: tablet and printer bridge must reach Supabase and backend

---

*Stack analysis: 2026-03-08*
