# MeinUngeheuer — Art Installation

## What This Is

Art installation: spoken AI dialogue with visitors, producing personalized glossary definitions printed on thermal cards with visitor portrait. Wall-mounted tablet detects visitors via face recognition (no touch), reads text aloud with karaoke highlighting, then AI challenges their understanding via voice conversation. Distilled definition + visitor face printed on thermal card.

## Core Value

A fully autonomous, unattended art installation where the entire loop — detect visitor → read text → converse → distill → print — runs without human intervention.

## Current State

Shipped **v2.0** (2026-03-24) — End-to-End Autonomous Installation.

**What works:**
- Full autonomous loop: face detect → wake → text display → conversation → save_definition → print → portrait → sleep
- Two conversation programs: aphorism (text_term with Kleist text) and free_association (no text, no portrait)
- Program switching via DB config (`installation_config.program`)
- PWA kiosk mode with face-triggered wake/sleep
- Thermal print pipeline: tablet → Supabase print_queue → printer-bridge → POS server → ESC/POS printer
- Portrait capture from shared camera stream, uploaded to POS server

**Tech stack:** React/Vite tablet, Hono backend, Node.js printer-bridge, Python POS server, Supabase (PostgreSQL + Realtime), ElevenLabs Conversational AI SDK.

**Codebase:** ~20,083 LOC TypeScript, 271 commits, 207+ tests passing.

## Requirements

### Validated

- ✓ SDK migration to @elevenlabs/react — v2.0
- ✓ Portrait capture and print — v2.0
- ✓ Agent text citation improvements — v2.0
- ✓ Program architecture (pluggable programs + templates) — v2.0
- ✓ PWA standalone + fullscreen kiosk — v2.0 (verified by integration checker)
- ✓ Face detection wake/sleep — v2.0 (verified by integration checker)
- ✓ POS server monorepo integration — v2.0 (verified by integration checker)
- ✓ Printer bridge E2E wiring — v2.0 (verified by integration checker)

### Pending Human Verification

- Conversation premature ending fix — code guardrails in place, needs 10+ min runtime test and ElevenLabs dashboard `end_call` tool removal confirmation

### Active

(To be defined in next milestone)

### Out of Scope

- Mode C (chain mode) end-to-end testing
- Admin dashboard
- Embeddings-based semantic search
- Multiple printer support
- Gallery view of past definitions
- Mobile app
- Video chat

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ElevenLabs Conversational AI (not custom STT→LLM→TTS) | Single WebSocket, less latency | ✓ Good |
| PWA standalone (not Fullscreen API) | Safari compatibility, Guided Access | ✓ Good |
| Node.js bridge + Python POS server (separate services) | POS server is upstream repo, different runtime | ✓ Good |
| Programs as TypeScript code (not DB records) | Code-authored, self-contained, testable | ✓ Good |
| One ElevenLabs agent, programs via prompt overrides | Simpler config, no agent duplication | ✓ Good |
| Stage-driven state machine (not mode strings) | Programs define stages, reducer is generic | ✓ Good |
| Shared videoRef lifted to App.tsx | iOS Safari single-stream constraint | ✓ Good |
| CRITICAL CONSTRAINT block after RULES in prompts | Maximum LLM attention for anti-ending guardrails | ⚠️ Needs runtime verification |

## Constraints

- Raspberry Pi: extremely limited RAM, no `npx tsc` or full `pnpm install`
- iOS Safari: single camera stream, no Fullscreen API without Guided Access
- ElevenLabs: agent config via API, system prompt overridden at session start
- Thermal printer: 384px width, ESC/POS commands, dithered portraits

## Technical Debt

- POS server `/print/dictionary` ignores incoming `template` field (hardcodes `dictionary_entry`)
- `listPrograms()` exported but unused
- `addParagraphNumbers` duplicated in `systemPrompt.ts` and `aphorism.ts`
- Phases 02/03 lack formal VERIFICATION.md (code verified by integration checker)

---
*Last updated: 2026-03-24 after v2.0 milestone*
