# Research Summary: MeinUngeheuer MVP

**Researched:** 2026-03-08
**Overall confidence:** HIGH

## Executive Summary

Four research threads investigated the critical gaps blocking an end-to-end autonomous installation. All have clear solutions with no major blockers.

## Key Findings by Area

### 1. ElevenLabs — Why Bot Ends Conversations (ELEVENLABS.md)

**Root cause identified:** The `end_call` system tool is enabled by default on dashboard-created agents. Gemini Flash (via OpenRouter) autonomously decides to call it, ending the conversation prematurely.

**Fix:** Remove `end_call` from dashboard agent tools. Keep `save_definition` as the only conversation-ending mechanism. The system prompt already instructs "NEVER stop just because you have had many exchanges."

**SDK migration needed:** `@11labs/react@0.2.0` is deprecated. Must migrate to `@elevenlabs/react@0.14.1` for better disconnect debugging (close codes, VAD scores) and maintained support.

**Knowledge Base:** Available (PDF/TXT/DOCX, 20MB limit, ~500ms latency/turn). For MVP, per-session prompt injection works fine since texts are short. KB is a future option for scaling to many texts.

**No hard session duration limit** found for Conversational AI (300s limit only applies to Voice Changer).

### 2. Safari/Tablet — Fullscreen and Camera (SAFARI_TABLET.md)

**Fullscreen:** The Fullscreen API works on iPadOS 16.4+ but shows a mandatory "X" overlay. **PWA standalone mode is better** — add to Home Screen gives true fullscreen without the overlay. The existing `manifest.json` already has `"display": "fullscreen"`.

**Camera:** getUserMedia works in Safari and PWA standalone mode (since iOS 13.4). Permissions are session-scoped but persist in an SPA that never reloads. Pre-allow camera/microphone in Settings > Safari for unattended operation.

**Kiosk mode:** PWA Standalone + iPad Guided Access = zero-cost kiosk. No MDM needed for MVP.

**Code changes:** Add PWA meta tags to `index.html`, skip `requestFullscreen()` when in standalone mode.

### 3. Printer Integration (PRINTER_INTEGRATION.md)

**Architecture:** Keep both services — Node.js printer-bridge (Supabase Realtime → HTTP relay) and Python POS server (ESC/POS rendering + portrait pipeline). They're complementary, not redundant.

**Monorepo:** Move Python POS server to `apps/pos-server/`. Don't add to pnpm workspace (it's Python). Add convenience scripts.

**Portrait capture:** Tablet already has camera stream for face detection. Share it at higher resolution, capture via Canvas API during conversation, POST to POS server's `/portrait/capture` endpoint.

**Pi deployment:** systemd services (not Docker). POS server already has production-ready setup.sh for Pi.

### 4. Modular Programs (MODULAR_PROGRAMS.md)

**Key constraint:** ElevenLabs SDK supports per-session prompt/firstMessage/voice overrides but NOT tool definition overrides. All programs share one agent, one tool set.

**Architecture:** `ConversationProgram` interface (prompt builder + first message + display component + print template). Programs as TypeScript code in `packages/shared/src/programs/`. Selected via `installation_config`.

**Orthogonal to modes:** Mode (text_term/term_only/chain) controls entry. Program (aphorism/haiku/debate) controls conversation output. Any combination works.

**State machine unchanged:** 9 states map to physical visitor phases. Programs vary content, not flow.

## Roadmap Implications

### Critical path for MVP:
1. Fix conversation bug (remove `end_call`, improve prompts)
2. Migrate ElevenLabs SDK
3. PWA standalone + meta tags for fullscreen
4. Integrate POS server into monorepo
5. Wire printer bridge → POS server end-to-end
6. Portrait capture + print
7. Face detection verification on target tablet

### Deferred to post-MVP:
- Program abstraction (extract interface, registry, second program)
- ElevenLabs Knowledge Base integration
- Admin dashboard for program selection
- MDM/enterprise kiosk setup

## Confidence Assessment

| Area | Confidence | Key Risk |
|------|------------|----------|
| Conversation bug fix | HIGH | Dashboard `end_call` tool is almost certainly the cause |
| SDK migration | HIGH | Clear upgrade path, types are compatible |
| Fullscreen/PWA | HIGH | Well-documented, minimal code changes |
| Camera on tablet | MEDIUM | Needs hardware testing on actual iPad |
| Printer integration | HIGH | Services already speak HTTP, just need wiring |
| Portrait pipeline | MEDIUM | Memory on Pi 3 may be tight, needs testing |
| Modular programs | HIGH | Architecture is proven, but deferred to post-MVP |
