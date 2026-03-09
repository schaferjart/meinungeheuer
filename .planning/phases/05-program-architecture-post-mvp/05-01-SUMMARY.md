---
phase: 05-program-architecture-post-mvp
plan: 01
subsystem: shared
tags: [typescript, registry-pattern, conversation-programs, zod, supabase]

# Dependency graph
requires:
  - phase: 01-conversation-reliability
    provides: "System prompt with CRITICAL CONSTRAINT and TEXT ENGAGEMENT blocks"
  - phase: 04-portrait-end-to-end-polish
    provides: "Paragraph-numbered text injection, citation grounding"
provides:
  - "ConversationProgram interface and supporting types (StageConfig, PrintLayout, ResultDisplay, PromptParams)"
  - "Program registry with getProgram(), listPrograms(), DEFAULT_PROGRAM"
  - "aphorism program (extracts current text_term behavior)"
  - "free_association program (open-ended, no text/term/portrait)"
  - "PrintPayloadSchema with optional template field"
  - "InstallationConfigSchema with program field"
  - "DB migration 009 for program column"
affects: [05-02-PLAN, tablet-state-machine, useConversation, systemPrompt]

# Tech tracking
tech-stack:
  added: []
  patterns: [program-registry, conversation-program-interface, static-code-programs]

key-files:
  created:
    - packages/shared/src/programs/types.ts
    - packages/shared/src/programs/aphorism.ts
    - packages/shared/src/programs/free-association.ts
    - packages/shared/src/programs/index.ts
    - packages/shared/src/programs/index.test.ts
    - packages/shared/src/programs/free-association.test.ts
    - packages/shared/vitest.config.ts
    - supabase/migrations/009_add_program_column.sql
  modified:
    - packages/shared/src/index.ts
    - packages/shared/src/types.ts

key-decisions:
  - "Programs as plain TypeScript objects, not Zod-validated data -- code-authored, not runtime-validated"
  - "Aphorism program copies prompt text verbatim from systemPrompt.ts for identical output fidelity"
  - "Free association program reuses CRITICAL CONSTRAINT block for consistency with anti-ending guardrails"
  - "buildModeBlock simplified in aphorism.ts (no term param) since it only handles text_term case"

patterns-established:
  - "ConversationProgram interface: id, stages, buildSystemPrompt, buildFirstMessage, printLayout, resultDisplay, sessionMode"
  - "Registry pattern: static REGISTRY map, getProgram with fallback + console.warn, listPrograms"
  - "Programs self-contained in shared package: prompt text co-located, not imported from tablet"

requirements-completed: [R9]

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 5 Plan 1: Program Architecture Summary

**ConversationProgram interface with registry pattern, aphorism program (text_term extraction), free_association program, and schema updates for program-driven installation behavior**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T13:27:53Z
- **Completed:** 2026-03-09T13:36:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- ConversationProgram interface defines the full contract for installation modes: stages, prompt builders, print layout, result display
- Aphorism program extracts current text_term behavior with character-identical prompt output
- Free association program validates the architecture with a fundamentally different conversation mode (no text, no portrait)
- Program registry with graceful fallback (unknown IDs fall back to aphorism with console.warn)
- 19 tests covering registry lookup, fallback, program prompts, stage configs, and schema validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Define ConversationProgram interface and program types** - `474e64c` (feat)
2. **Task 2 RED: Failing tests for registry and free_association** - `d68fafc` (test)
3. **Task 2 GREEN: Implement programs, registry, schema updates** - `3bc664c` (feat)

## Files Created/Modified
- `packages/shared/src/programs/types.ts` - ConversationProgram, StageConfig, PrintLayout, ResultDisplay, PromptParams interfaces
- `packages/shared/src/programs/aphorism.ts` - Current text_term behavior as a program with addParagraphNumbers and buildModeBlock
- `packages/shared/src/programs/free-association.ts` - Open-ended conversation program, no text/term/portrait
- `packages/shared/src/programs/index.ts` - Registry with getProgram(), listPrograms(), DEFAULT_PROGRAM, type re-exports
- `packages/shared/src/programs/index.test.ts` - 12 tests: registry lookup, fallback, list, aphorism prompts/stages, schema validation
- `packages/shared/src/programs/free-association.test.ts` - 7 tests: id, stages, prompt, first message i18n, sessionMode, printLayout
- `packages/shared/vitest.config.ts` - Vitest config for running shared package tests
- `packages/shared/src/index.ts` - Added programs/ re-export
- `packages/shared/src/types.ts` - PrintPayload template field, InstallationConfig program field
- `supabase/migrations/009_add_program_column.sql` - program column on installation_config

## Decisions Made
- Programs as plain TypeScript objects, not Zod-validated data -- they are code-authored by developers, not runtime data
- Aphorism program copies prompt text verbatim from systemPrompt.ts to ensure identical output (Plan 02 will refactor tablet to delegate to program)
- Free association program reuses the CRITICAL CONSTRAINT anti-ending guardrails for consistency
- Removed unused `term` parameter from aphorism's internal `buildModeBlock` (only text_term case, doesn't use term in mode block)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused parameter in buildModeBlock**
- **Found during:** Task 2 (typecheck after implementation)
- **Issue:** `buildModeBlock(term, contextText)` had unused `term` parameter, caught by `noUnusedParameters` strict mode
- **Fix:** Removed `term` parameter from function signature and call site
- **Files modified:** `packages/shared/src/programs/aphorism.ts`
- **Verification:** `tsc --noEmit` passes clean
- **Committed in:** `3bc664c` (part of GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor signature cleanup. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared package exports everything Plan 02 needs: `getProgram`, `listPrograms`, `ConversationProgram`, `PromptParams`
- Plan 02 will wire programs into the tablet: state machine, useConversation, config fetching
- Tablet's `systemPrompt.ts` will be refactored to delegate to `program.buildSystemPrompt()`
- Migration 009 needs to be applied to Supabase before Plan 02's config fetching works

---
*Phase: 05-program-architecture-post-mvp*
*Completed: 2026-03-09*
