---
phase: 03-printer-integration
plan: 02
subsystem: printer
tags: [supabase, rls, print-queue, vitest, unit-tests, escpos]

# Dependency graph
requires:
  - phase: 03-printer-integration/01
    provides: POS server at apps/pos-server/ with /print/dictionary endpoint
provides:
  - persistPrintJob function in tablet for enqueuing print jobs
  - RLS policy allowing anon INSERT on print_queue
  - Unit tests verifying printer-bridge field mapping and config
affects: [03-printer-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget-supabase-insert, field-mapping-tests-with-mocked-fetch]

key-files:
  created:
    - supabase/migrations/008_anon_insert_print_queue.sql
    - apps/printer-bridge/src/printer.test.ts
    - apps/printer-bridge/src/config.test.ts
  modified:
    - apps/tablet/src/lib/persist.ts
    - apps/tablet/src/App.tsx

key-decisions:
  - "persistPrintJob uses session count for session_number (count from sessions table)"
  - "Print job payload uses raw result object (not makeClientDefinition output) to match PrintPayload shape"

patterns-established:
  - "Printer-bridge tests use vi.stubGlobal('fetch') for HTTP mocking"
  - "Config tests save/restore process.env in afterEach for isolation"

requirements-completed: [R6]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 03 Plan 02: Print Queue Wiring Summary

**RLS policy for anon print_queue INSERT, persistPrintJob wired in tablet save_definition flow, 8 unit tests covering printer-bridge field mapping (term->word, definition_text->definition), retry logic, and config defaults**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T08:31:07Z
- **Completed:** 2026-03-09T08:34:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Complete data path wired: save_definition -> persistPrintJob -> print_queue INSERT -> printer-bridge -> POS server
- RLS policy enables tablet anon key to INSERT into print_queue (migration 008)
- 8 unit tests validate printer-bridge field mapping, console fallback, retry logic, and config defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: RLS migration + persistPrintJob + App.tsx wiring** - `1b5c7cb` (feat)
2. **Task 2: Unit tests for printer-bridge field mapping and config** - `3eefd48` (test)

## Files Created/Modified
- `supabase/migrations/008_anon_insert_print_queue.sql` - RLS policy for anon INSERT on print_queue
- `apps/tablet/src/lib/persist.ts` - Added persistPrintJob() function (fire-and-forget, session count, Supabase insert)
- `apps/tablet/src/App.tsx` - Calls persistPrintJob in handleDefinitionReceived alongside persistDefinition
- `apps/printer-bridge/src/printer.test.ts` - 6 tests: buildTestPayload validation, console mode, field mapping, retry logic
- `apps/printer-bridge/src/config.test.ts` - 2 tests: config defaults and env var reading

## Decisions Made
- persistPrintJob accepts raw result object (not Definition) since it needs the PrintPayload shape
- Session count via `select('*', { count: 'exact', head: true })` is an efficient count-only query
- state.sessionId accessed from InstallationState (confirmed field exists in useInstallationMachine.ts)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. RLS migration must be applied to Supabase when deploying.

## Next Phase Readiness
- Full print pipeline wired: tablet -> Supabase print_queue -> printer-bridge -> POS server
- Printer-bridge already subscribes to Supabase Realtime (existing code)
- Physical printer testing requires running POS server without --dummy flag
- Phase 03 complete; ready for Phase 04 (Portrait + End-to-End Polish)

## Self-Check: PASSED

All files and commits verified present.

---
*Phase: 03-printer-integration*
*Completed: 2026-03-09*
