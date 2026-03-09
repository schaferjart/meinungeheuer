---
phase: 05-program-architecture-post-mvp
plan: 02
subsystem: tablet
tags: [typescript, state-machine, conversation-programs, stage-config, react]

# Dependency graph
requires:
  - phase: 05-program-architecture-post-mvp
    plan: 01
    provides: "ConversationProgram interface, getProgram registry, aphorism/free_association programs, StageConfig type"
  - phase: 04-portrait-end-to-end-polish
    provides: "Portrait capture hook, system prompt with citation grounding"
provides:
  - "Stage-config-driven state machine transitions (no mode string comparisons)"
  - "Program-driven prompt building in useConversation via program.buildSystemPrompt/buildFirstMessage"
  - "Program resolution from config in App.tsx with programRef wiring"
  - "Template-aware print persistence (program.printLayout passed to print_queue)"
  - "Portrait capture gated by program.stages.portrait"
  - "ConfigResponseSchema with optional program field"
  - "Database types updated with program column on installation_config"
affects: [tablet-ui, printer-bridge, admin-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [stage-config-routing, program-ref-pattern, template-aware-persistence]

key-files:
  created: []
  modified:
    - apps/tablet/src/hooks/useInstallationMachine.ts
    - apps/tablet/src/hooks/useInstallationMachine.test.ts
    - apps/tablet/src/hooks/useConversation.ts
    - apps/tablet/src/lib/systemPrompt.ts
    - apps/tablet/src/lib/firstMessage.ts
    - apps/tablet/src/App.tsx
    - apps/tablet/src/lib/api.ts
    - apps/tablet/src/lib/persist.ts
    - packages/shared/src/supabase.ts

key-decisions:
  - "Reducer uses stages booleans only -- never references program IDs or mode strings for transition routing"
  - "programRef pattern in App.tsx for stable reference across renders without re-initializing hooks"
  - "ConfigResponseSchema uses z.string().optional() for program field with consumer-side fallback (avoids Zod default() type inference issue)"
  - "systemPrompt.ts and firstMessage.ts kept with @deprecated annotation for backward compatibility and regression test stability"
  - "Portrait capture and upload both gated by program.stages.portrait (two separate checks)"

patterns-established:
  - "Stage-config routing: state machine transitions driven by StageConfig booleans, enabling arbitrary stage combinations"
  - "Program ref pattern: useRef<ConversationProgram> in App.tsx updated on config fetch, read by hooks and callbacks"
  - "Template-aware persistence: print payload includes template field from program.printLayout for POS server template selection"

requirements-completed: [R9]

# Metrics
duration: 7min
completed: 2026-03-09
---

# Phase 5 Plan 2: Wire Programs Through Tablet Summary

**Stage-config-driven state machine replacing mode strings, program-based prompt building in useConversation, and template-aware print persistence wired through App.tsx**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-09T13:40:27Z
- **Completed:** 2026-03-09T13:48:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- State machine transitions now use StageConfig booleans instead of mode string comparisons, enabling arbitrary stage combinations
- useConversation delegates prompt building to ConversationProgram interface (program.buildSystemPrompt, program.buildFirstMessage)
- App.tsx resolves programs from config via getProgram() and wires them through the entire pipeline: conversation, persistence, portrait capture
- Print jobs include template field from program.printLayout, enabling POS server to select different print templates per program
- 4 new stage-config combination tests cover all textReading/termPrompt permutations
- All 204 tests pass across the entire workspace (shared 19, karaoke-reader 111, tablet 66, printer-bridge 8)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend state machine with stage config and update useConversation to accept programs** - `bb87525` (feat)
2. **Task 2: Wire programs through App.tsx, update config schema, and template-aware persistence** - `bd83ac6` (feat)

## Files Created/Modified
- `apps/tablet/src/hooks/useInstallationMachine.ts` - Added StageConfig to state, replaced mode comparisons with stages booleans in reducer
- `apps/tablet/src/hooks/useInstallationMachine.test.ts` - Updated inline reducer, added 4 stage-config tests, updated all existing tests for stages field
- `apps/tablet/src/hooks/useConversation.ts` - Accepts ConversationProgram instead of Mode, delegates to program.buildSystemPrompt/buildFirstMessage
- `apps/tablet/src/lib/systemPrompt.ts` - Added @deprecated annotation (kept for test backward compatibility)
- `apps/tablet/src/lib/firstMessage.ts` - Added @deprecated annotation (kept for test backward compatibility)
- `apps/tablet/src/App.tsx` - Program resolution from config, programRef wiring, portrait gating by stages.portrait, template-aware persistPrintJob
- `apps/tablet/src/lib/api.ts` - ConfigResponseSchema includes optional program field
- `apps/tablet/src/lib/persist.ts` - persistPrintJob accepts template parameter, includes in print payload
- `packages/shared/src/supabase.ts` - Database types: program column on installation_config

## Decisions Made
- Reducer uses stages booleans only, never references program IDs or mode strings -- clean separation of concerns
- programRef (useRef) pattern in App.tsx avoids re-initialization of useConversation hook when program changes
- Used z.string().optional() instead of z.string().default() for ConfigResponseSchema program field due to Zod generic type inference conflict with apiFetch's z.ZodType<T> parameter
- Kept systemPrompt.ts and firstMessage.ts with @deprecated rather than deleting -- existing tests serve as regression verification for prompt text fidelity
- Two separate portrait gates (capture effect + upload callback) ensure both capture and upload respect program config

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod default() type inference conflict**
- **Found during:** Task 2 (typecheck after ConfigResponseSchema update)
- **Issue:** `z.string().default('aphorism')` produced `string | undefined` in the inferred output type when used with `z.ZodType<T>` generic in apiFetch, causing type error
- **Fix:** Changed to `z.string().optional()` with consumer-side fallback (`config.program ?? 'aphorism'`) in App.tsx
- **Files modified:** `apps/tablet/src/lib/api.ts`
- **Verification:** `pnpm typecheck` passes clean
- **Committed in:** `bd83ac6` (Task 2 commit)

**2. [Rule 1 - Bug] Added missing stages field to RESET test dirty state**
- **Found during:** Task 2 (typecheck caught missing property)
- **Issue:** The RESET test's dirty state literal was missing the new `stages` field, causing TS2741
- **Fix:** Added `stages: { textReading: true, termPrompt: true, portrait: true, printing: true }` to the dirty state
- **Files modified:** `apps/tablet/src/hooks/useInstallationMachine.test.ts`
- **Verification:** `pnpm typecheck` and `pnpm test` pass
- **Committed in:** `bd83ac6` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for type correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Program architecture is complete: two programs (aphorism, free_association) produce different behavior through the same codebase
- To add a new program: create a TypeScript file in packages/shared/src/programs/, implement ConversationProgram interface, register in REGISTRY map
- Config endpoint can return `program: "free_association"` to switch behavior without code changes
- Migration 009 (from Plan 01) needs to be applied to Supabase for the program column to exist in production

## Self-Check: PASSED

All 9 modified files verified present. Both task commits (bb87525, bd83ac6) verified in git log.

---
*Phase: 05-program-architecture-post-mvp*
*Completed: 2026-03-09*
