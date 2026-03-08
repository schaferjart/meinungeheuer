# Project State

## Current Phase
Phase 0 — Planning complete. Ready to start Phase 1.

## What's Done
- Codebase mapped (.planning/codebase/)
- Research completed (.planning/research/)
- Requirements defined (R1-R9)
- Roadmap created (5 phases)
- Root cause of conversation bug identified (ElevenLabs `end_call` tool)

## What's Next
Run `/gsd:plan-phase 1` to create detailed plan for Phase 1 (Conversation Fix + SDK Migration).

Phases 1 and 3 can run in parallel since they're independent.

## Key Decisions
- PWA standalone mode instead of Fullscreen API for kiosk
- Keep Node.js bridge + Python POS server as separate services
- POS-thermal-printer moved to apps/pos-server/ in monorepo
- Programs as TypeScript code, not DB records (Phase 5)
- One ElevenLabs agent, programs differentiated via prompt overrides

## Blockers
- Need ElevenLabs dashboard access to remove `end_call` tool
- Need target iPad for face detection / PWA testing
- Need thermal printer + Pi for print testing
