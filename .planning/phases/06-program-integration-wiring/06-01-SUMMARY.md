---
phase: 06-program-integration-wiring
plan: 01
subsystem: api, state-machine, printer
tags: [supabase, hono, react-reducer, escpos, program-config]

# Dependency graph
requires:
  - phase: 05-program-architecture
    provides: "ConversationProgram interface, program registry, PrintPayload.template field, InstallationConfig.program field"
provides:
  - "Backend /api/config returns program field from DB"
  - "Printer-bridge forwards template field to POS server"
  - "State machine respects stages.printing boolean"
affects: [tablet-runtime, printer-bridge, admin-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Null-coalescing for optional DB fields in API responses"
    - "Stage-boolean-driven screen skip in reducer"

key-files:
  created: []
  modified:
    - "apps/backend/src/routes/config.ts"
    - "apps/printer-bridge/src/printer.ts"
    - "apps/printer-bridge/src/printer.test.ts"
    - "apps/tablet/src/hooks/useInstallationMachine.ts"
    - "apps/tablet/src/hooks/useInstallationMachine.test.ts"

key-decisions:
  - "program field defaults to null (not 'aphorism') in backend response -- tablet handles fallback"
  - "template field defaults to 'dictionary' in printer-bridge body when payload.template is undefined"

patterns-established:
  - "Stage booleans in reducer control screen skipping (printing: false -> farewell)"

requirements-completed: [R9]

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 06 Plan 01: Program Integration Wiring Summary

**Three surgical gap-closure fixes wiring program field through backend config, template through printer-bridge, and stages.printing through state machine**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T15:52:54Z
- **Completed:** 2026-03-09T15:56:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Backend /api/config now includes `program` field from installation_config table, enabling tablet to receive program selection from DB
- Printer-bridge POST body includes `template` field (defaults to 'dictionary'), enabling POS server to use correct print layout
- State machine TIMER_10S transition respects `stages.printing` boolean -- when false, skips printing screen and goes directly to farewell

## Task Commits

Each task was committed atomically:

1. **Task 1: Add program field to backend /api/config endpoint** - `6a818e7` (feat)
2. **Task 2: Forward template in printer-bridge + respect stages.printing** - `98a28d0` (test: RED), `a095afd` (feat: GREEN)

**Plan metadata:** (pending)

_Note: Task 2 followed TDD -- separate commits for failing tests and implementation._

## Files Created/Modified
- `apps/backend/src/routes/config.ts` - Added `program` to SELECT clause and response object
- `apps/printer-bridge/src/printer.ts` - Added `template` field to POST body with 'dictionary' default
- `apps/printer-bridge/src/printer.test.ts` - Added template assertion to existing test + new template forwarding test
- `apps/tablet/src/hooks/useInstallationMachine.ts` - TIMER_10S now checks stages.printing before routing
- `apps/tablet/src/hooks/useInstallationMachine.test.ts` - Updated inline reducer, added printing=false tests

## Decisions Made
- Backend returns `program: null` when DB column is null (tablet handles fallback via `config.program ?? 'aphorism'`)
- Template defaults to `'dictionary'` in printer-bridge when payload.template is undefined (backward compatible)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three v2.0 audit gaps for R9 (Program Architecture) are now closed
- Re-audit milestone to verify end-to-end program switching flow
- Generate missing VERIFICATION.md for Phases 02/03

## Self-Check: PASSED

- All 5 modified files exist
- All 3 commit hashes verified (6a818e7, 98a28d0, a095afd)
- Key patterns confirmed in source files (program, config.program, template, stages.printing)

---
*Phase: 06-program-integration-wiring*
*Completed: 2026-03-09*
