# Project State

## Current Position
- **Phase:** 03-printer-integration
- **Current Plan:** 2 of 2 in Phase
- **Status:** Plan 03-01 complete. Advancing to plan 03-02.
- **Last session:** 2026-03-09T08:28:13Z
- **Stopped at:** Completed 03-01-PLAN.md (POS server monorepo integration)

## Progress
Phase 1: [====================] 2/2 plans complete
Phase 2: [====================] 1/1 plans complete
Phase 3: [==========..........] 1/2 plans complete

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

## What's Next
- Plan 03-02: Print queue wiring (RLS policy, persistPrintJob, unit tests)
- Then Phase 4: Portrait + End-to-End Polish

## Key Decisions
- PWA standalone mode instead of Fullscreen API for kiosk
- Keep Node.js bridge + Python POS server as separate services
- POS-thermal-printer moved to apps/pos-server/ in monorepo
- Programs as TypeScript code, not DB records (Phase 5)
- One ElevenLabs agent, programs differentiated via prompt overrides
- CRITICAL CONSTRAINT block placed after RULES section in prompts for maximum LLM attention
- Guardrail text explicitly states agent cannot end conversation and save_definition is the only tool
- Import Role from @elevenlabs/react (MessagePayload not exported from @elevenlabs/client, only from transitive @elevenlabs/types)
- Added connectionType: 'websocket' to startSession -- required by new SDK's PublicSessionConfig type
- Standalone detection via navigator.standalone + matchMedia (not Fullscreen API)
- viewport-fit=cover with 100dvh for iOS safe area handling
- Audio unlock on first user gesture enables autonomous audio for subsequent visitor cycles
- Copied POS server files selectively (no .git, venv, tests, preview images) to keep monorepo clean
- UPSTREAM.md tracks provenance from schaferjart/POS-thermal-printer for future sync

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
