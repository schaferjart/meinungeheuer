# MeinUngeheuer

Art installation: spoken AI dialogue with visitors, producing personalized glossary definitions printed on thermal cards.
xx
The default mode is **Mode A (text_term)**: visitor reads a text on a tablet with karaoke-style word highlighting synced to TTS audio, the AI picks a concept from the text and challenges the visitor's understanding via voice conversation, then a distilled definition is printed on a thermal card.

## Architecture

```
Tablet (React/Vite) → ElevenLabs Conversational AI → Custom LLM (OpenRouter) → Backend (Hono) → Supabase → Printer Bridge (local) → ESC/POS Printer
```

Monorepo (pnpm workspaces):
- `apps/tablet` — React web app, kiosk mode, karaoke text reader, voice conversation UI
- `apps/backend` — Hono server (webhooks, session management, chain state)
- `apps/printer-bridge` — Local Node.js service for thermal printing
- `packages/shared` — Shared types, Supabase client, constants

## Three Modes

- **Mode A (text_term)** — Default. Visitor reads text with karaoke highlighting → AI picks concept → conversation → definition → print. MVP text: Kleist's *Uber die allmahliche Verfertigung der Gedanken beim Reden*.
- **Mode B (term_only)** — Naked term shown (e.g., "BIRD") → conversation → definition → print.
- **Mode C (chain)** — Previous visitor's definition becomes next visitor's text context. Exquisite corpse of ideas.

## Quick Start

```bash
pnpm install
pnpm build            # Build shared package first, then all apps
pnpm dev              # Start all apps (tablet :3000, backend :3001)
```

## Prerequisites

- Node.js 20+ and pnpm
- ElevenLabs API key + voice ID
- OpenRouter API key
- Supabase project (free tier works)
- OpenAI API key (embeddings only)

Create `.env` files per app — see `.env.example` in each app directory.

## Claude Code

This project is designed to be built and maintained with Claude Code. See `CLAUDE.md` for full project context.

- `/build` — Orchestrate full project build (5 phases, delegates to specialized agents)
- `/status` — Check what's built, what's missing, what's broken

Specialized agents handle different domains: frontend-builder, backend-builder, printer-engineer, elevenlabs-integrator, supabase-admin. See `.claude/agents/` for details.
