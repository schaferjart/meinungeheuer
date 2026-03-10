# Roadmap: MeinUngeheuer MVP

## Milestone: v2.0 — End-to-End Autonomous Installation

### Phase 1: Conversation Fix + SDK Migration
**Goal:** Conversations no longer end prematurely. SDK is on maintained version.
**Requirements:** R1, R2
**Plans:** 2 plans
Plans:
- [x] 01-01-PLAN.md — SDK migration + useConversation hook update + keep-alive
- [x] 01-02-PLAN.md — System prompt guardrails + unit tests
**Gate:** Conversation runs to natural conclusion (visitor-initiated `save_definition` only)

### Phase 2: PWA + Fullscreen + Face Detection
**Goal:** Tablet runs as autonomous kiosk — no touch, true fullscreen, face-triggered wake/sleep.
**Requirements:** R3, R4
**Plans:** 1 plan
Plans:
- [x] 02-01-PLAN.md — PWA standalone detection + manifest fix + iPad kiosk verification
**Gate:** Walk up → wakes in 3s. Walk away → sleeps in 30s. True fullscreen, no UI chrome.

### Phase 3: Printer Integration
**Goal:** Print queue jobs produce physical thermal cards.
**Requirements:** R5, R6
**Plans:** 2 plans
Plans:
- [x] 03-01-PLAN.md — POS server monorepo integration (copy files, pnpm scripts, verify health)
- [x] 03-02-PLAN.md — Print queue wiring (RLS policy, persistPrintJob, unit tests)
**Gate:** Insert print_queue row → card prints within 10s.

### Phase 4: Portrait + End-to-End Polish
**Goal:** Visitor portrait captured and printed. Full loop works autonomously.
**Requirements:** R7, R8
**Plans:** 2 plans
Plans:
- [x] 04-01-PLAN.md — Portrait capture infrastructure (camera upgrade, usePortraitCapture hook, App wiring)
- [x] 04-02-PLAN.md — System prompt citation improvements (paragraph-numbered text, QUOTE move, TEXT ENGAGEMENT)
**Gate:** Complete autonomous loop with printed card showing definition + visitor portrait.

### Phase 5: Program Architecture (Post-MVP)
**Goal:** Pluggable conversation programs and print templates — modular atoms for text source, conversation mode, print layout, portrait pipeline, and stage toggling.
**Requirements:** R9
**Plans:** 2 plans
Plans:
- [x] 05-01-PLAN.md — ConversationProgram interface, registry, aphorism + free_association programs, DB migration
- [x] 05-02-PLAN.md — Wire programs through tablet (state machine, useConversation, App.tsx, persistence)
**Gate:** Two programs switchable via config, both produce correct output.

### Phase 6: Program Integration Wiring (Gap Closure)
**Goal:** Complete R9 integration — backend returns program field, printer-bridge forwards template, state machine respects stages.printing.
**Requirements:** R9
**Gap Closure:** Closes gaps from v2.0 audit
**Plans:** 1 plan
Plans:
- [x] 06-01-PLAN.md — Backend config program field, printer-bridge template forwarding, stages.printing in state machine
**Gate:** `installation_config.program = 'free_association'` → tablet receives it → different stage flow. Template field reaches POS server. `stages.printing=false` skips printing screen.

### Phase 7: Live Concept Map
**Goal:** Replace chat transcript in ConversationScreen with a dynamic, generative concept map visualization that evolves in real-time during conversation.
**Requirements:** R10
**Plans:** 1 plan
Plans:
- [ ] 07-01-PLAN.md — Concept extractor, concept map hook, force layout, Canvas+DOM hybrid rendering, evolving definition
**Gate:** During conversation, visitor sees concept nodes appearing/fading, connection lines between related concepts, and an evolving definition — not chat bubbles. 30fps+ on iPad Safari.

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 4
                ↘         ↗
         Phase 3 ──────→
                          ↘
                     Phase 5 ──→ Phase 6
                                    ↘
                               Phase 7
```

Phase 1 and Phase 3 can run in parallel. Phase 2 depends on Phase 1 (SDK). Phase 4 depends on both Phase 2 and Phase 3. Phase 5 is post-MVP. Phase 6 closes R9 integration gaps from audit. Phase 7 is independent of Phases 5-6 (only touches tablet UI) but logically follows them.
