# Project State

## Current Position
- **Phase:** 01-conversation-fix-sdk-migration
- **Current Plan:** 2 of 2 in Phase (ALL COMPLETE)
- **Status:** Phase 1 complete. Both plans executed.
- **Last session:** 2026-03-08T16:12:07Z
- **Stopped at:** Completed 01-01-PLAN.md (SDK migration + keep-alive)

## Progress
Phase 1: [====================] 2/2 plans complete

## What's Done
- Codebase mapped (.planning/codebase/)
- Research completed (.planning/research/)
- Requirements defined (R1-R9)
- Roadmap created (5 phases)
- Root cause of conversation bug identified (ElevenLabs `end_call` tool)
- Phase 1 plans created (01-01 SDK migration, 01-02 prompt guardrails)
- **Plan 01-02 complete:** CRITICAL CONSTRAINT anti-ending guardrails added to both system prompts, 10 unit tests passing
- **Plan 01-01 complete:** @elevenlabs/react@0.14.1 SDK migration, disconnect logging with closeCode/closeReason, 15s sendUserActivity keep-alive

## What's Next
- Phase 1 gate verification: conversation runs to natural conclusion (visitor-initiated save_definition only)
- Begin Phase 2 (PWA + Fullscreen + Face Detection) or Phase 3 (Printer Integration) -- these can run in parallel

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

## Blockers
- Need ElevenLabs dashboard access to remove `end_call` tool
- Need target iPad for face detection / PWA testing
- Need thermal printer + Pi for print testing

## Performance Metrics

| Phase-Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|
| 01-01      | 6min     | 2     | 4     |
| 01-02      | 4min     | 2     | 3     |
