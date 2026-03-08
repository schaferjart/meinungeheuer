# Project State

## Current Position
- **Phase:** 01-conversation-fix-sdk-migration
- **Current Plan:** 2 of 2 in Phase
- **Status:** Plan 02 complete. Phase 1 execution in progress.
- **Last session:** 2026-03-08T16:10:52Z
- **Stopped at:** Completed 01-02-PLAN.md (System prompt guardrails + unit tests)

## Progress
Phase 1: [==========----------] 1/2 plans complete (01-02 done, 01-01 pending)

## What's Done
- Codebase mapped (.planning/codebase/)
- Research completed (.planning/research/)
- Requirements defined (R1-R9)
- Roadmap created (5 phases)
- Root cause of conversation bug identified (ElevenLabs `end_call` tool)
- Phase 1 plans created (01-01 SDK migration, 01-02 prompt guardrails)
- **Plan 01-02 complete:** CRITICAL CONSTRAINT anti-ending guardrails added to both system prompts, 10 unit tests passing

## What's Next
- Execute Plan 01-01 (SDK migration + useConversation hook update + keep-alive)
- Note: useConversation.ts already partially updated (imports migrated, mapRole exported, sendUserActivity exposed)
- After Plan 01-01: Phase 1 gate verification (conversation runs to natural conclusion)

## Key Decisions
- PWA standalone mode instead of Fullscreen API for kiosk
- Keep Node.js bridge + Python POS server as separate services
- POS-thermal-printer moved to apps/pos-server/ in monorepo
- Programs as TypeScript code, not DB records (Phase 5)
- One ElevenLabs agent, programs differentiated via prompt overrides
- CRITICAL CONSTRAINT block placed after RULES section in prompts for maximum LLM attention
- Guardrail text explicitly states agent cannot end conversation and save_definition is the only tool

## Blockers
- Need ElevenLabs dashboard access to remove `end_call` tool
- Need target iPad for face detection / PWA testing
- Need thermal printer + Pi for print testing

## Performance Metrics

| Phase-Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|
| 01-02      | 4min     | 2     | 3     |
