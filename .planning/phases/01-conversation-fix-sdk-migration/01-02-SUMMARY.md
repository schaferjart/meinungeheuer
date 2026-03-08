---
phase: 01-conversation-fix-sdk-migration
plan: 02
subsystem: ai-prompts
tags: [system-prompt, guardrails, elevenlabs, vitest, unit-tests]

# Dependency graph
requires:
  - phase: none
    provides: n/a
provides:
  - Anti-ending CRITICAL CONSTRAINT guardrails in both system prompt variants
  - Unit tests for system prompt guardrails (7 tests across all 3 modes)
  - Unit tests for mapRole SDK role mapping (3 tests)
affects: [conversation-flow, prompt-engineering]

# Tech tracking
tech-stack:
  added: []
  patterns: [prompt-guardrail-testing, role-mapping-testing]

key-files:
  created:
    - apps/tablet/src/lib/systemPrompt.test.ts
    - apps/tablet/src/hooks/useConversation.test.ts
  modified:
    - apps/tablet/src/lib/systemPrompt.ts

key-decisions:
  - "CRITICAL CONSTRAINT block placed after RULES section in both prompt variants for maximum LLM attention"
  - "Guardrail text explicitly states agent cannot end conversation and save_definition is the only tool"

patterns-established:
  - "Prompt guardrail testing: verify critical constraint text presence across all modes via string containment"
  - "SDK role mapping testing: verify ElevenLabs role -> app role transformation"

requirements-completed: [R1, R2]

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 01 Plan 02: System Prompt Guardrails + Unit Tests Summary

**CRITICAL CONSTRAINT anti-ending guardrails in both system prompts, with 10 unit tests verifying guardrails and SDK role mapping across all modes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T16:05:53Z
- **Completed:** 2026-03-08T16:10:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added CRITICAL CONSTRAINT block to both buildTextTermPrompt and buildTermPrompt stating the agent cannot end conversations
- Created 7 unit tests verifying guardrail text is present in all 3 modes (text_term, term_only, chain)
- Created 3 unit tests verifying mapRole correctly maps ElevenLabs "user"/"agent" to app "visitor"/"agent"
- All 37 project tests pass, typecheck clean, full build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Add anti-ending guardrails to system prompts** - `fdd4cbe` (feat)
2. **Task 2: Create unit tests for prompt guardrails and role mapping** - `ca0a113` (test)

## Files Created/Modified
- `apps/tablet/src/lib/systemPrompt.ts` - Added CRITICAL CONSTRAINT block to both prompt functions
- `apps/tablet/src/lib/systemPrompt.test.ts` - 7 tests for guardrail presence and mode-specific content
- `apps/tablet/src/hooks/useConversation.test.ts` - 3 tests for mapRole function

## Decisions Made
- Placed CRITICAL CONSTRAINT block between RULES and PUSHING DEEPER sections for prominence
- Used identical guardrail text in both prompt variants for consistency
- Guardrail explicitly mentions save_definition as the ONLY tool to prevent LLM from inventing other termination mechanisms

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial test run for useConversation.test.ts failed due to stale Vite module cache referencing old `@11labs/react` import. The source file had already been updated to `@elevenlabs/react` (from Plan 01 work). Second run succeeded after cache invalidation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- System prompts now have explicit anti-ending guardrails reinforcing the existing STOP ONLY WHEN section
- Both prompt variants (text_term and term_only/chain) are covered
- Test suite provides regression protection against future prompt edits removing guardrails
- Combined with Plan 01's SDK migration and keep-alive, Phase 1 conversation fix is complete

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 01-conversation-fix-sdk-migration*
*Completed: 2026-03-08*
