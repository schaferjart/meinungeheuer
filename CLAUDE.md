# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MeinUngeheuer — art installation: spoken AI dialogue with visitors, producing personalized glossary definitions printed on thermal cards. Visitor reads text on tablet, AI challenges their understanding via voice conversation, distilled definition is printed.

## Architecture

```
Tablet (React/Vite) → ElevenLabs Conversational AI (WebSocket) → Custom LLM (OpenRouter) → Supabase → Printer Bridge (local) → ESC/POS Printer
```

Monorepo (pnpm workspaces):
- `apps/tablet` — React web app, runs in tablet browser (kiosk mode)
- `apps/printer-bridge` — Local Node.js service, runs on Pi/laptop near printer
- `packages/shared` — Types, Supabase client, constants

`apps/backend/` — Hono API server. Serves `/api/config` (tablet fetches mode, text, program on startup). If the backend is broken, the tablet falls back to defaults with NO text context — the AI will have nothing to reference.

`save_definition` is a **client tool** handled in-browser, writing directly to Supabase.

## Three Modes

- **Mode A (text_term):** *Default.* Visitor reads a text on tablet (karaoke word highlighting synced to TTS audio) → AI picks concept from text → conversation → definition → print. MVP text: Kleist's *Über die allmähliche Verfertigung der Gedanken beim Reden*.
- **Mode B (term_only):** Naked term shown (e.g., "BIRD") → conversation → definition → print.
- **Mode C (chain):** Previous visitor's definition becomes next visitor's text context → AI picks concept from it → conversation → definition → print → repeat. Exquisite corpse of ideas. Chain state stored in Supabase.

## Key Tech Decisions

- **Voice pipeline:** ElevenLabs Conversational AI SDK (`@elevenlabs/react`). Handles STT + LLM + TTS in one WebSocket. Do NOT build a custom STT→LLM→TTS chain.
- **ElevenLabs agent config:** Agent ID `agent_7201kjt1wgyqfjp8zkr68r3ngas6`. Configurable via ElevenLabs MCP tools or REST API (`PATCH /v1/convai/agents/{id}`). System prompt is overridden at session start from `systemPrompt.ts`. Tools and built-in tools are configured on the agent. API key: `VITE_ELEVENLABS_API_KEY` in `apps/tablet/.env`.
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

**ElevenLabs role mapping**: SDK uses "user"/"agent" → map to shared types "visitor"/"agent" via `mapRole()` in `useConversation.ts`.

**save_definition flow**: `save_definition` is a **client tool** — the ElevenLabs agent calls it, the SDK delivers it to the browser, `useConversation.ts` handles it client-side → dispatches `DEFINITION_RECEIVED` → tablet writes to Supabase directly. No backend webhook needed.

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
| **printer-engineer** | Sonnet | `apps/printer-bridge/` — ESC/POS layout, Supabase Realtime |
| **elevenlabs-integrator** | **Opus** | Cross-cutting — SDK integration, system prompts, TTS timestamps, voice config, agent API config |
| **supabase-admin** | Sonnet | `supabase/`, `packages/shared/` — Schema, migrations, RLS, types, seed |

The ElevenLabs integrator uses Opus because system prompt engineering and audio pipeline integration require highest reasoning quality.

When a task spans multiple domains, break it into subtasks and delegate. Prefer parallel execution when subtasks are independent.

## Tools

`tools/` — Standalone browser-based utilities for the art practice. Each tool is a **single self-contained HTML file** (all CSS/JS inline, no ES modules) so it works directly via `open filename.html` from `file://`. No build step, no server needed.

- `tools/raster-painter/` — Wind/noise dot grid simulation → slice → export for large-format paintings. Ported from the LandingPage raster engine.

**Gotcha:** ES modules (`type="module"`) are blocked by CORS on `file://` in Chrome. Any tool meant to be opened directly must inline all JS/CSS.

## Related Projects

- **LandingPage** (`/Users/janos/Desktop/VAKUNST/code/LandingPage`) — Gnomon Practice website. Contains the original canvas dot raster simulation (`projects/_landing/controller.js`) that the raster-painter tool was ported from. Vanilla JS, ES modules, no build tools.

## Deployment

- **Tablet**: Docker (2-stage: node build → nginx SPA). Accepts `VITE_*` build args. Deployed via Coolify from GitHub `main` branch.
- **Printer bridge**: Runs locally on Pi/laptop near the printer. Not deployed to cloud. **Must be manually started** with `pnpm dev:printer`. POS server at `192.168.1.65:9100` must also be reachable. If nothing prints, check: (1) is the bridge running? (2) is the POS server up? (`curl http://192.168.1.65:9100/health`) (3) are there `pending` rows in `print_queue`?
- **Supabase**: Managed cloud. Schema via migrations. **Migrations are NOT auto-applied.** After creating a new migration file, apply it to production via `mcp__supabase__apply_migration` or the Supabase dashboard. Always verify with `mcp__supabase__execute_sql` that the schema matches what the code expects.
- **ElevenLabs**: Agent configured via API/MCP. No separate deployment needed.

## Debugging Gotchas

- **System prompt = quotable content.** Any prose in the system prompt WILL be quoted by the AI back to visitors. Write instructions as imperatives ("Do X"), never descriptions ("This is a raw text..."). If the AI quotes something weird, check `packages/shared/src/programs/aphorism.ts`.
- **Persistence is fire-and-forget.** `persistPrintJob()` and `persistDefinition()` swallow all errors silently. When debugging, check Supabase directly with `mcp__supabase__execute_sql` — don't trust the absence of error logs.
- **RLS blocks are silent.** If a Supabase INSERT has no RLS policy for `anon`, it fails with no visible error in the browser. Always verify RLS policies match what the tablet code expects.
- **Config fetch failure is silent.** If `/api/config` returns an error, the tablet falls back to defaults with `contextText: null`. The AI then has no text to reference. Check the backend logs and the `installation_config` schema.

## Quality Gates

Before marking any component done:
1. `pnpm typecheck` passes
2. Core logic has tests
3. Error states handled (network failure, API timeout, missing data)
4. Component works independently (testable without other components running)
