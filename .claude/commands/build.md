Build the MeinUngeheuer project. Read `docs/PRD.md` and `docs/PROMPTS.md` first.

Execute in this order, delegating to the appropriate subagent for each:

## Phase 1: Foundation
1. **supabase-admin**: Set up all migrations (extensions, tables, indexes, RLS, seed data) and shared types
2. Scaffold the monorepo (pnpm workspaces, Vite, Hono, configs)
3. Verify: `pnpm build` and `pnpm typecheck` pass

## Phase 2: Core Conversation Loop
4. **backend-builder**: Build all API routes and webhook endpoints
5. **elevenlabs-integrator**: Build conversation hooks and system prompts
6. **frontend-builder**: Build state machine and all screen components (placeholder content OK)
7. Verify: Full conversation loop works (Mode B: term only, no text reader, no printer)

## Phase 3: Text Reader
8. **elevenlabs-integrator**: Build TTS-with-timestamps integration
9. **frontend-builder**: Build TextReader component with karaoke highlighting
10. Verify: Mode A works (Kleist text displayed + highlighted + conversation)

## Phase 4: Printer
11. **printer-engineer**: Build printer bridge with layout engine
12. Verify: Full loop through to printed card (or simulated print if no printer)

## Phase 5: Polish
13. **frontend-builder**: Face detection, UI animations, admin dashboard
14. **backend-builder**: Embedding generation, chain visualization endpoint
15. Verify: All modes work, all screens transition correctly

After each phase, run `pnpm typecheck` and `pnpm test`. Fix any issues before moving to the next phase. Report progress after each phase.
