# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MeinUngeheuer — art installation: spoken AI dialogue with visitors, producing personalized glossary definitions printed on thermal cards. Visitor reads text on tablet, AI challenges their understanding via voice conversation, distilled definition is printed.

## Architecture

```
Tablet (React/Vite) → ElevenLabs Conversational AI (WebSocket) → Custom LLM (OpenRouter) → Cloud Backend (Hono) → Supabase → Printer Bridge (local) → ESC/POS Printer
```

Monorepo (pnpm workspaces):
- `apps/tablet` — React web app, runs in tablet browser (kiosk mode)
- `apps/backend` — Hono server, deployed to Vercel/Railway
- `apps/printer-bridge` — Local Node.js service, runs on Pi/laptop near printer
- `packages/shared` — Types, Supabase client, constants

## Three Modes

- **Mode A (text_term):** *Default.* Visitor reads a text on tablet (karaoke word highlighting synced to TTS audio) → AI picks concept from text → conversation → definition → print. MVP text: Kleist's *Über die allmähliche Verfertigung der Gedanken beim Reden*.
- **Mode B (term_only):** Naked term shown (e.g., "BIRD") → conversation → definition → print.
- **Mode C (chain):** Previous visitor's definition becomes next visitor's text context → AI picks concept from it → conversation → definition → print → repeat. Exquisite corpse of ideas. Chain state stored in Supabase.

## Key Tech Decisions

- **Voice pipeline:** ElevenLabs Conversational AI SDK (`@11labs/react`). Handles STT + LLM + TTS in one WebSocket. Do NOT build a custom STT→LLM→TTS chain.
- **LLM:** Custom LLM via OpenRouter (`google/gemini-2.0-flash-001` default). Configured in ElevenLabs dashboard.
- **Text reader highlighting:** ElevenLabs TTS with-timestamps API returns character-level timing. Convert to word-level timestamps in `useTextToSpeechWithTimestamps.ts`. Sync highlight to `audio.currentTime` via `requestAnimationFrame`.
- **Database:** Supabase (PostgreSQL + pgvector + Realtime).
- **Printer:** ESC/POS thermal printer via local bridge. Bridge subscribes to Supabase Realtime `print_queue` table.
- **Face detection:** MediaPipe Face Detection in-browser. Debounced: 3s to wake, 30s to sleep. Fallback: tap-to-start.

## Commands

```bash
pnpm dev              # Start all apps in dev mode (parallel)
pnpm dev:tablet       # Tablet only (Vite, port 3000)
pnpm dev:backend      # Backend only (tsx watch, port 3001)
pnpm dev:printer      # Printer bridge only
pnpm build            # Build all (shared first, then apps)
pnpm test             # Run all tests (Vitest)
pnpm typecheck        # TypeScript check across workspace
pnpm lint             # Lint all

# Single test file
pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts
# Watch mode
pnpm --filter @meinungeheuer/tablet exec vitest src/hooks/useInstallationMachine.test.ts
```

Build order matters: `pnpm build` builds `@meinungeheuer/shared` first (other apps depend on its compiled output).

Slash commands:
- `/build` — Orchestrate full project build (5 phases, delegates to agents)
- `/status` — Check what's built, what's missing, what's broken

## Prerequisites

- Node.js 20+ and pnpm
- ElevenLabs API key
- OpenRouter API key
- Supabase project (free tier works)
- OpenAI API key (embeddings only)

## Build Phases

The `/build` command executes in order:

1. **Foundation:** Supabase schema + migrations, monorepo scaffold, shared types. Gate: `pnpm build` + `pnpm typecheck`.
2. **Core Conversation Loop:** Backend API routes/webhooks, ElevenLabs conversation hooks/system prompts, tablet state machine + screens. Gate: Mode B end-to-end.
3. **Text Reader:** TTS-with-timestamps integration, TextReader component with karaoke highlighting. Gate: Mode A end-to-end.
4. **Printer:** Printer bridge with ESC/POS layout engine. Gate: full loop to printed card.
5. **Polish:** Face detection, UI animations, admin dashboard, embeddings, chain visualization.

## Key Integration Details

**Tablet state machine** (`useInstallationMachine.ts`): Single reducer with 9 screens: sleep → welcome → text_display → term_prompt → conversation → synthesizing → definition → printing → farewell. Actions: WAKE, TIMER_*, READY, DEFINITION_RECEIVED, FACE_LOST, SET_CONFIG, SET_SESSION_ID, SET_LANGUAGE, RESET.

**ElevenLabs role mapping**: SDK uses "user"/"ai" → map to shared types "visitor"/"agent" in `useConversation.ts`. The `save_definition` tool call from the agent triggers a webhook to the backend.

**Webhook flow**: ElevenLabs agent calls save_definition tool → POST /webhook/definition → backend saves definition, generates embedding (async), advances chain (Mode C), inserts print_queue job → printer bridge picks up via Supabase Realtime subscription.

## Working Conventions

- TypeScript strict mode everywhere. No `any`. Base config in `tsconfig.base.json`.
- Zod for runtime validation at API boundaries.
- Shared types in `packages/shared/src/types.ts` — import from `@meinungeheuer/shared`. Insert variants (omitting id/created_at) for DB writes.
- Environment variables: `.env` files per app. `.env.example` tracks shape. Tablet uses `VITE_` prefix.
- Error handling: never crash a long-running service (backend, printer-bridge). Catch, log, continue.
- CSS: Tailwind v4 in tablet app (different API from v3 — uses `@tailwindcss/vite` plugin, CSS-first config). No CSS modules, no styled-components.
- Test files next to source: `foo.ts` → `foo.test.ts`. Framework: Vitest.
- Screen components: `components/screens/{StateName}Screen.tsx`. Hooks: `hooks/use{Name}.ts`.

## PRD & Prompts

Full PRD: `docs/PRD.md` — Read BEFORE starting any major feature.
Agent build prompts: `docs/PROMPTS.md` — Contains exact specifications per component.

## Agent Delegation

Delegate to specialized subagents by domain:

| Agent | Model | Scope |
|-------|-------|-------|
| **frontend-builder** | Sonnet | `apps/tablet/` — React components, state machine, UI, styling |
| **backend-builder** | Sonnet | `apps/backend/` — API routes, webhooks, chain state, embeddings |
| **printer-engineer** | Sonnet | `apps/printer-bridge/` — ESC/POS layout, Supabase Realtime |
| **elevenlabs-integrator** | **Opus** | Cross-cutting — SDK integration, system prompts, TTS timestamps, voice config |
| **supabase-admin** | Sonnet | `supabase/`, `packages/shared/` — Schema, migrations, RLS, types, seed |

The ElevenLabs integrator uses Opus because system prompt engineering and audio pipeline integration require highest reasoning quality.

When a task spans multiple domains, break it into subtasks and delegate. Prefer parallel execution when subtasks are independent.

## Deployment

- **Tablet**: Docker (2-stage: node build → nginx SPA). Accepts `VITE_*` build args. Deployed via Coolify.
- **Backend**: Vercel (`vercel.json` in `apps/backend/`).
- **Printer bridge**: Runs locally on Pi/laptop near the printer. Not deployed to cloud.

## Quality Gates

Before marking any component done:
1. `pnpm typecheck` passes
2. Core logic has tests
3. Error states handled (network failure, API timeout, missing data)
4. Component works independently (testable without other components running)
