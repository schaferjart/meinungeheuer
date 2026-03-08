# MeinUngeheuer MVP — End-to-End Installation

## What This Is

Art installation: spoken AI dialogue with visitors, producing personalized glossary definitions printed on thermal cards with visitor portrait. Tablet mounted on wall detects visitors via face recognition (no touch), reads text aloud with karaoke highlighting, then AI challenges their understanding via voice conversation. Distilled definition + visitor face printed on thermal card.

## Core Value

A fully autonomous, unattended art installation where the entire loop — detect visitor → read text → converse → distill → print — runs without human intervention.

## Context

Brownfield project with substantial existing code:
- **Tablet app** (React/Vite) — state machine, screens, ElevenLabs SDK integration, karaoke text reader, face detection
- **Backend** (Hono) — config API, webhook handler, chain state management
- **Printer bridge** (Node.js) — Supabase Realtime listener, HTTP relay to POS server
- **Shared package** — types, Supabase client, constants
- **POS thermal printer** (Python, separate repo) — ESC/POS rendering, dithering, portrait pipeline, Flask HTTP server

## Requirements

### Critical Bugs
- Bot prematurely ends conversations — agent calls save_definition too early or ElevenLabs platform timeout triggers disconnect. Must investigate actual cause (linked conversation: conv_1301kk6w6hh3fxs80gcrqzp3v5bf).
- Fullscreen mode on Safari — may show video controls or fail to enter proper fullscreen. Must be browser-agnostic.

### Integration Gaps
- Face detection exists but may not work on target tablet (camera permissions, Safari). Must work autonomously — no touch allowed.
- Printer bridge → POS server connection untested end-to-end. POS server lives in separate repo (github.com/schaferjart/POS-thermal-printer).
- Visitor face capture → dithered portrait on thermal card not implemented. POS server already has portrait pipeline.

### Architecture Improvements
- Agent text context: full text IS injected into system prompt already, but agent may not cite it well enough. Improve prompt engineering for authentic text engagement.
- POS-thermal-printer repo should be integrated into monorepo as apps/pos-server/ (Python microservice).
- ElevenLabs Knowledge Base could be explored for future RAG, but for MVP the per-session prompt injection works.

### Modular Programs Architecture
The installation has a fixed shared phase (karaoke text reading) followed by pluggable modules:
- **Reading phase** (shared): Text is read aloud with karaoke highlighting. TTS audio cached in Supabase. Always the same regardless of conversation program.
- **Conversation programs** (pluggable): After reading, a "program" defines the conversation style. MVP program: "definition extraction" (Socratic dialogue → distill single concept). Future programs could explore different conversational formats. Programs should be independently testable.
- **Print templates** (pluggable): Output format is also swappable. MVP template: dictionary card (definition + citations + visitor portrait). Future templates could vary layout, content density, visual treatment.

Each program is a configuration (system prompt + conversation rules + print template) that can be selected per installation or per session.

### MVP Scope
Everything needed for one complete autonomous loop:
1. Visitor approaches wall-mounted tablet
2. Face detection triggers wake (no touch)
3. Text displayed with karaoke reading
4. AI conversation (agent has full text context, cites properly, does NOT end prematurely)
5. Definition distilled → shown on screen
6. Definition + visitor portrait printed on thermal card
7. Installation resets when visitor leaves

Program architecture must support future conversation types, but MVP ships with one program ("definition extraction").

### Non-MVP (Later)
- Additional conversation programs (beyond definition extraction)
- Additional print templates
- Mode C (chain mode) end-to-end testing
- Admin dashboard
- Embeddings-based semantic search
- Multiple printer support
- Gallery view of past definitions
