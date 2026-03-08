---
phase: 01-conversation-fix-sdk-migration
plan: 01
subsystem: voice-pipeline
tags: [elevenlabs, sdk-migration, websocket, react-hooks, keep-alive]

# Dependency graph
requires: []
provides:
  - "@elevenlabs/react@0.14.1 SDK integration replacing deprecated @11labs/react"
  - "sendUserActivity keep-alive preventing 20s WebSocket inactivity timeout"
  - "Enhanced disconnect logging with closeCode and closeReason for debugging"
  - "Exported mapRole function for unit testing"
affects: [01-02-PLAN, phase-02, phase-04]

# Tech tracking
tech-stack:
  added: ["@elevenlabs/react@0.14.1"]
  removed: ["@11labs/react@0.2.0", "@11labs/client@0.2.0"]
  patterns: ["WebSocket keep-alive via 15s sendUserActivity interval", "Discriminated union handling for DisconnectionDetails"]

key-files:
  modified:
    - apps/tablet/package.json
    - apps/tablet/src/hooks/useConversation.ts
    - apps/tablet/src/App.tsx
    - pnpm-lock.yaml

key-decisions:
  - "Import Role from @elevenlabs/react (re-exported from @elevenlabs/client) since MessagePayload is not exported from @elevenlabs/client or @elevenlabs/react -- only available in @elevenlabs/types which is not a direct dependency"
  - "Added connectionType: 'websocket' to startSession call -- required by new SDK's PublicSessionConfig type"

patterns-established:
  - "Discriminated union pattern for DisconnectionDetails: check details.reason to access closeCode/closeReason (only on 'agent' and 'error' variants)"
  - "Keep-alive pattern: useEffect with 15s setInterval guarded by screen and connection status"

requirements-completed: [R2]

# Metrics
duration: 6min
completed: 2026-03-08
---

# Phase 01 Plan 01: SDK Migration + useConversation Hook Update Summary

**Migrated from deprecated @11labs/react to @elevenlabs/react@0.14.1 with disconnect close code logging and 15s WebSocket keep-alive to prevent conversation drops**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-08T16:05:53Z
- **Completed:** 2026-03-08T16:12:07Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments
- Replaced deprecated @11labs/react and @11labs/client with @elevenlabs/react@0.14.1
- Updated onMessage callback to use `role` field instead of deprecated `source` field
- Added detailed disconnect logging differentiating agent-initiated, error, and user-initiated disconnects with closeCode/closeReason
- Exposed sendUserActivity and wired 15s keep-alive interval to prevent WebSocket inactivity timeout during visitor thinking pauses
- TypeScript compiles cleanly, full Vite build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap SDK dependency and migrate useConversation hook** - `d24b897` (feat)
2. **Task 2: Add WebSocket keep-alive during active conversation** - `6a703f0` (feat)

## Files Created/Modified
- `apps/tablet/package.json` - Removed @11labs/*, added @elevenlabs/react@0.14.1
- `apps/tablet/src/hooks/useConversation.ts` - Migrated imports, updated onMessage/onDisconnect, exposed sendUserActivity, exported mapRole
- `apps/tablet/src/App.tsx` - Destructured sendUserActivity, added 15s keep-alive useEffect
- `pnpm-lock.yaml` - Updated lockfile for dependency changes

## Decisions Made
- **Inline Role typing instead of MessagePayload import:** MessagePayload type is only available from `@elevenlabs/types` (transitive dependency not accessible with pnpm strict hoisting). Used `{ message: string; role: ElevenLabsRole }` inline type annotation instead. This achieves the same type safety without adding an extra dependency.
- **Added connectionType: 'websocket':** The new SDK's `PublicSessionConfig` type requires an explicit `connectionType` field. Used `'websocket'` which matches the existing behavior (WebSocket is correct for this use case per CLAUDE.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] MessagePayload not exported from @elevenlabs/client**
- **Found during:** Task 1 (import migration)
- **Issue:** Plan specified `import type { Role as ElevenLabsRole, MessagePayload } from '@elevenlabs/client'`, but MessagePayload is only in @elevenlabs/types (transitive, not directly importable with pnpm)
- **Fix:** Used inline type annotation `{ message: string; role: ElevenLabsRole }` for the onMessage callback parameter
- **Files modified:** apps/tablet/src/hooks/useConversation.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** d24b897

**2. [Rule 3 - Blocking] startSession requires connectionType in new SDK**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** New SDK's PublicSessionConfig requires `connectionType: ConnectionType` field which was not in the old SDK
- **Fix:** Added `connectionType: 'websocket'` to the startSession options object
- **Files modified:** apps/tablet/src/hooks/useConversation.ts
- **Verification:** TypeScript compiles cleanly, build succeeds
- **Committed in:** d24b897

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both fixes necessary for compilation. No scope creep. The inline typing approach is equivalent to importing MessagePayload.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SDK migration complete, ready for Plan 02 (system prompt guardrails + unit tests)
- mapRole exported for unit testing in Plan 02
- R1 (premature ending fix) still needs system prompt guardrails from Plan 02 and manual UAT

## Self-Check: PASSED

All files exist, all commits verified, all content checks passed.

---
*Phase: 01-conversation-fix-sdk-migration*
*Completed: 2026-03-08*
