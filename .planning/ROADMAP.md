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
- [ ] 02-01-PLAN.md — PWA standalone detection + manifest fix + iPad kiosk verification
**Gate:** Walk up → wakes in 3s. Walk away → sleeps in 30s. True fullscreen, no UI chrome.

### Phase 3: Printer Integration
**Goal:** Print queue jobs produce physical thermal cards.
**Requirements:** R5, R6
**Tasks:**
- Clone POS-thermal-printer into `apps/pos-server/`
- Add pnpm scripts (`dev:pos`, `start:pos`) that shell to Python venv
- Configure printer-bridge `POS_SERVER_URL` to point at POS server
- Test Supabase Realtime → printer-bridge → POS server → printed card
- Add health check and error recovery
**Gate:** Insert print_queue row → card prints within 10s.

### Phase 4: Portrait + End-to-End Polish
**Goal:** Visitor portrait captured and printed. Full loop works autonomously.
**Requirements:** R7, R8
**Tasks:**
- Create `usePortraitCapture` hook — share camera stream from face detection at higher resolution
- Capture face frame during conversation (Canvas API → blob)
- POST captured image to POS server `/portrait/capture` endpoint
- Coordinate print order: definition card first, then portrait (or combined layout)
- Improve Mode A system prompt for better text citations
- Full end-to-end test: approach → read → converse → print (definition + portrait) → reset
**Gate:** Complete autonomous loop with printed card showing definition + visitor portrait.

### Phase 5: Program Architecture (Post-MVP)
**Goal:** Pluggable conversation programs and print templates.
**Requirements:** R9
**Tasks:**
- Define `ConversationProgram` interface in shared package
- Extract current behavior into `aphorism` program
- Add `program` column to `installation_config`
- Wire program selection through config endpoint
- Component registry for per-program result display
- Print template routing to POS server
- Implement second program to validate architecture
**Gate:** Two programs switchable via config, both produce correct output.

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 4
                ↘         ↗
         Phase 3 ──────→
                          ↘
                     Phase 5
```

Phase 1 and Phase 3 can run in parallel. Phase 2 depends on Phase 1 (SDK). Phase 4 depends on both Phase 2 and Phase 3. Phase 5 is post-MVP.
