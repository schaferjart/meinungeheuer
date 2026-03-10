---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — End-to-End Autonomous Installation
current_plan: Not started
status: completed
stopped_at: Completed 07-01-PLAN.md
last_updated: "2026-03-10T23:15:59.280Z"
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 11
  completed_plans: 11
---

# Project State

## Current Position
- **Phase:** 07-live-concept-map
- **Current Plan:** Not started
- **Status:** Milestone complete
- **Last session:** 2026-03-11T00:58:00Z
- **Stopped at:** Completed 07-01-PLAN.md

## Progress
Phase 1: [====================] 2/2 plans complete
Phase 2: [====================] 1/1 plans complete
Phase 3: [====================] 2/2 plans complete
Phase 4: [====================] 2/2 plans complete
Phase 5: [====================] 2/2 plans complete
Phase 6: [====================] 1/1 plans complete
Phase 7: [====================] 1/1 plans complete

## What's Done
- Codebase mapped (.planning/codebase/)
- Research completed (.planning/research/)
- Requirements defined (R1-R9)
- Roadmap created (5 phases)
- Root cause of conversation bug identified (ElevenLabs `end_call` tool)
- Phase 1 plans created (01-01 SDK migration, 01-02 prompt guardrails)
- **Plan 01-02 complete:** CRITICAL CONSTRAINT anti-ending guardrails added to both system prompts, 10 unit tests passing
- **Plan 01-01 complete:** @elevenlabs/react@0.14.1 SDK migration, disconnect logging with closeCode/closeReason, 15s sendUserActivity keep-alive
- **Plan 02-01 complete:** PWA standalone detection (isStandaloneMode), conditional fullscreen, manifest fix, viewport-fit=cover, audio unlock for iOS kiosk. Known issues: iOS status bar visible without Guided Access, audio needs first tap per page load.
- **Plan 03-01 complete:** POS-thermal-printer Flask server cloned into apps/pos-server/ with pnpm scripts, /health and /print/dictionary endpoints verified working in dummy mode
- **Plan 03-02 complete:** RLS policy for anon print_queue INSERT, persistPrintJob wired in tablet, 8 unit tests for printer-bridge field mapping and config
- **Plan 04-02 complete:** Paragraph-numbered text injection, QUOTE move citation format, TEXT ENGAGEMENT minimum for text_term mode, 6 new tests
- **Plan 04-01 complete:** usePortraitCapture hook (Canvas drawImage + toBlob + FormData POST), shared videoRef architecture, camera upgraded to 1280x960, 10 unit tests
- **Plan 05-01 complete:** ConversationProgram interface, program registry (getProgram/listPrograms), aphorism program (text_term extraction), free_association program, PrintPayload template field, InstallationConfig program field, DB migration 009, 19 tests
- **Plan 05-02 complete:** Stage-config-driven state machine, program-based prompt building in useConversation, App.tsx program wiring, template-aware print persistence, portrait gating by program.stages.portrait, 204 tests pass
- **Plan 06-01 complete:** Backend /api/config returns program field, printer-bridge forwards template to POS server, state machine TIMER_10S respects stages.printing, 207 tests pass
- **Plan 07-01 complete:** Live concept map visualization replacing chat transcript. Concept extractor, force layout, Canvas+DOM hybrid, evolving definition. 27 new tests, 95 tablet tests pass

## What's Next
- iPad Safari performance verification with physical device
- Re-audit milestone to verify end-to-end program switching flow
- Generate missing VERIFICATION.md for Phases 02/03

## Key Decisions
- PWA standalone mode instead of Fullscreen API for kiosk
- Keep Node.js bridge + Python POS server as separate services
- POS-thermal-printer moved to apps/pos-server/ in monorepo
- Programs as TypeScript code, not DB records (Phase 5)
- One ElevenLabs agent, programs differentiated via prompt overrides
- KNOWING WHEN TO STOP block replaces CRITICAL CONSTRAINT — AI proactively calls save_definition after 6-10 exchanges when something crystallizes, instead of waiting for visitor to explicitly end
- Conversation arc includes CRYSTALLIZE phase instead of "no time limit"
- Import Role from @elevenlabs/react (MessagePayload not exported from @elevenlabs/client, only from transitive @elevenlabs/types)
- Added connectionType: 'websocket' to startSession -- required by new SDK's PublicSessionConfig type
- Standalone detection via navigator.standalone + matchMedia (not Fullscreen API)
- viewport-fit=cover with 100dvh for iOS safe area handling
- Audio unlock on first user gesture enables autonomous audio for subsequent visitor cycles
- Copied POS server files selectively (no .git, venv, tests, preview images) to keep monorepo clean
- UPSTREAM.md tracks provenance from schaferjart/POS-thermal-printer for future sync
- persistPrintJob uses session count for session_number (count from sessions table)
- Print job payload uses raw result object (not makeClientDefinition output) to match PrintPayload shape
- Paragraph numbering via split on double newlines with [N] prefix for citation grounding
- TEXT ENGAGEMENT block placed between RULES and CRITICAL CONSTRAINT for prompt attention priority
- Net prompt change kept to 14 lines to avoid instruction dilution
- Shared videoRef lifted to App.tsx for single-stream camera sharing (iOS Safari stream-muting)
- Portrait captured 5s into conversation, uploaded fire-and-forget after definition received
- Callback ref in CameraDetector bridges React 18 RefObject<T|null> typing
- ConversationProgram as plain TS interface (not Zod) -- code-authored, not runtime-validated
- Aphorism prompt copied verbatim into shared package for self-containment (tablet will delegate in Plan 02)
- Free association reuses KNOWING WHEN TO STOP guardrails for consistency
- Registry pattern with static imports, fallback to default + console.warn
- Reducer uses stages booleans only, never references program IDs or mode strings for transition routing
- programRef pattern in App.tsx for stable ConversationProgram reference across renders
- ConfigResponseSchema uses z.string().optional() for program field (Zod default() type inference conflict with generic ZodType<T>)
- systemPrompt.ts and firstMessage.ts kept with @deprecated for regression test stability
- Backend config.program defaults to null (tablet fallback handles 'aphorism')
- Printer-bridge template defaults to 'dictionary' when payload.template undefined
- Custom stopword filter over compromise.js for zero added dependencies
- useSyncExternalStore for concept map state decoupled from React render cycle
- Canvas+DOM hybrid: Canvas for connection lines, DOM for text labels
- React.memo on ConceptNodeElement and EvolvingDefinition for animation performance
- Force layout throttled to update React state every 3 frames (~20/sec)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix conversation never ending - AI keeps talking indefinitely without calling save_definition | 2026-03-10 | 2c3b2ef | [1-fix-conversation-never-ending-ai-keeps-t](./quick/1-fix-conversation-never-ending-ai-keeps-t/) |

## Blockers
- Need ElevenLabs dashboard access to remove `end_call` tool
- Need thermal printer + Pi for print testing

## Performance Metrics

| Phase-Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|
| 01-01      | 6min     | 2     | 4     |
| 01-02      | 4min     | 2     | 3     |
| 02-01      | 45min    | 2     | 10    |
| 03-01      | 3min     | 2     | 18    |
| 03-02      | 3min     | 2     | 5     |
| 04-02      | 3min     | 1     | 2     |
| 04-01      | 39min    | 2     | 7     |
| 05-01      | 8min     | 2     | 10    |
| 05-02      | 7min     | 2     | 9     |
| 06-01      | 4min     | 2     | 5     |
| 07-01      | 15min    | 8     | 10    |
