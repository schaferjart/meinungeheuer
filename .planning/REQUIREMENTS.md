# Requirements: MeinUngeheuer MVP

## Success Criteria

One complete autonomous loop runs without human intervention:
1. Visitor approaches wall-mounted tablet → face detection wakes installation
2. Text displayed with karaoke reading (TTS audio from Supabase cache)
3. AI conversation with full text context, proper citations, no premature ending
4. Definition/aphorism distilled and shown on screen
5. Definition + visitor portrait printed on thermal card
6. Installation resets when visitor leaves

## Requirements

### R1: Fix Conversation Premature Ending
- **Priority:** CRITICAL
- **What:** Remove `end_call` system tool from ElevenLabs dashboard agent. Ensure only `save_definition` can end conversations.
- **UAT:** Run a 10+ minute conversation without the bot ending it. Only `save_definition` triggers end.
- **Dependencies:** ElevenLabs dashboard access

### R2: Migrate ElevenLabs SDK [COMPLETE]
- **Priority:** HIGH
- **What:** Migrate from deprecated `@11labs/react@0.2.0` to `@elevenlabs/react@0.14.1`. Update imports, fix type mismatches.
- **UAT:** Conversation starts, runs, and ends cleanly with new SDK. Disconnect reason is logged with close codes.
- **Dependencies:** R1 (dashboard changes first)
- **Completed:** 2026-03-08 (Plan 01-01)

### R3: PWA Standalone + Fullscreen Fix [COMPLETE]
- **Priority:** HIGH
- **What:** Add PWA meta tags (`apple-mobile-web-app-capable`, status bar style). Skip Fullscreen API when in standalone mode. Ensure Add-to-Home-Screen works.
- **UAT:** App added to iPad Home Screen runs in true fullscreen without "X" overlay or video controls.
- **Dependencies:** None
- **Completed:** 2026-03-09 (Plan 02-01). Known caveat: iOS status bar remains visible without Guided Access.

### R4: Face Detection on Target Tablet [COMPLETE]
- **Priority:** HIGH
- **What:** Verify MediaPipe face detection works on target iPad in Safari/PWA mode. Pre-allow camera in settings. Ensure wake/sleep cycle works autonomously.
- **UAT:** Walk up to tablet → 3s → wakes. Walk away → 30s → sleeps. No touch required.
- **Dependencies:** R3 (PWA mode for camera persistence)
- **Completed:** 2026-03-09 (Plan 02-01). Face detection functional; full kiosk verification deferred.

### R5: Integrate POS Server into Monorepo [COMPLETE]
- **Priority:** HIGH
- **What:** Clone POS-thermal-printer repo into `apps/pos-server/`. Add pnpm convenience scripts. Verify Flask server starts and `/health` endpoint responds.
- **UAT:** `pnpm dev:pos` starts the Python Flask server. `/health` returns 200.
- **Dependencies:** None
- **Completed:** 2026-03-09 (Plan 03-01)

### R6: Printer Bridge End-to-End
- **Priority:** HIGH
- **What:** Configure printer-bridge to point at POS server. Test full flow: insert print_queue row → bridge picks up → POSTs to POS server → card prints.
- **UAT:** Insert a test print_queue row in Supabase. Thermal card prints within 10 seconds.
- **Dependencies:** R5
- **Completed:** 2026-03-09 (Plan 03-02)

### R7: Portrait Capture and Print [COMPLETE]
- **Priority:** MEDIUM
- **What:** Capture visitor face from tablet camera during conversation (Canvas API → blob). POST to POS server `/portrait/capture`. Print dithered portrait on thermal card alongside definition.
- **UAT:** After conversation, card prints with both definition text and visitor's dithered face portrait.
- **Dependencies:** R5, R6
- **Completed:** 2026-03-09 (Plan 04-01)

### R8: Improve Agent Text Context [COMPLETE]
- **Priority:** MEDIUM
- **What:** Review and improve system prompt for Mode A (text_term). Agent should make specific citations from the text, reference passages, and demonstrate genuine textual understanding — not just respond to keywords.
- **UAT:** In a Mode A conversation, agent references at least 2 specific passages from the text.
- **Dependencies:** R1, R2
- **Completed:** 2026-03-09 (Plan 04-02). Paragraph-numbered text injection, QUOTE move citation format, TEXT ENGAGEMENT minimum requiring 2+ specific paragraphs.

### R9: Program Architecture Foundation
- **Priority:** LOW (post-MVP)
- **What:** Extract `ConversationProgram` interface. Refactor current behavior into `aphorism` program. Wire program selection via `installation_config`.
- **UAT:** Current behavior works identically through the program interface. `installation_config.program` selects active program.
- **Dependencies:** R1-R8 (MVP complete first)
- **Status:** Partial — Phase 05 code complete, Phase 06 gap closure pending (backend config, printer-bridge template, stages.printing)
