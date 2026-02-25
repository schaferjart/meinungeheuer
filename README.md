# MeinUngeheuer — Claude Code Setup

## Quick Start

```bash
# 1. Extract the config archive
tar xzf meinungeheuer-claude-config.tar.gz
cd meinungeheuer

# 2. Open Claude Code in the project
claude

# 3. Build the whole project
/build
```

That's it. The `/build` command orchestrates everything.

## What's in the box

```
meinungeheuer/
├── CLAUDE.md                          # Master config — Claude reads this on every session
├── .claude/
│   ├── agents/
│   │   ├── frontend-builder.md        # React/Vite/Tailwind specialist
│   │   ├── backend-builder.md         # Hono/Supabase specialist
│   │   ├── printer-engineer.md        # ESC/POS + thermal printer specialist
│   │   ├── elevenlabs-integrator.md   # ElevenLabs SDK + TTS specialist (uses Opus)
│   │   └── supabase-admin.md          # Database schema + migrations specialist
│   └── commands/
│       ├── build.md                   # /build — orchestrate full project build
│       └── status.md                  # /status — check project health
└── docs/
    ├── PRD.md                         # Full product requirements document (v0.3)
    └── PROMPTS.md                     # Granular build prompts per component
```

## Agents

| Agent | Model | Scope | When Claude uses it |
|-------|-------|-------|---------------------|
| **frontend-builder** | Sonnet | `apps/tablet/` | React components, state machine, TextReader, face detection, styling |
| **backend-builder** | Sonnet | `apps/backend/` | API routes, webhooks, chain state, embeddings |
| **printer-engineer** | Sonnet | `apps/printer-bridge/` | ESC/POS layout, Supabase Realtime, printer connection |
| **elevenlabs-integrator** | **Opus** | Cross-cutting | SDK integration, system prompts, TTS timestamps, voice config |
| **supabase-admin** | Sonnet | `supabase/`, `packages/shared/` | Schema, migrations, RLS, types, seed data |

The ElevenLabs integrator uses Opus because the system prompt engineering and audio pipeline integration require the highest reasoning quality.

## Commands

- `/build` — Run the full build pipeline (5 phases, delegates to agents)
- `/status` — Check what's built, what's missing, what's broken

## How it works

1. You say `/build` (or describe what you need)
2. Claude reads `CLAUDE.md` for project context
3. Claude delegates subtasks to specialized agents
4. Each agent reads `docs/PRD.md` and `docs/PROMPTS.md` for exact specs
5. Agents work in their scoped directories
6. Claude checks quality gates between phases

## Manual usage

You can also talk to Claude directly:

```
"Set up the Supabase schema"
→ Claude delegates to supabase-admin

"Build the text reader with karaoke highlighting"
→ Claude delegates to frontend-builder + elevenlabs-integrator

"The printer is cutting off German umlauts"
→ Claude delegates to printer-engineer
```

## Prerequisites

Before running `/build`, you need:
- [ ] ElevenLabs account + API key
- [ ] OpenRouter account + API key
- [ ] Supabase project created (free tier works)
- [ ] OpenAI API key (for embeddings only)
- [ ] Node.js 20+ and pnpm installed

## Environment Variables

Create `.env` files as guided by `.env.example` (generated during scaffold phase).

All keys listed in `docs/PROMPTS.md` → Prompt 10 → Environment Variables Checklist.
