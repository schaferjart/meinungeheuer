---
phase: 04-portrait-end-to-end-polish
plan: 02
subsystem: ai-prompts
tags: [system-prompt, citation, paragraph-numbering, elevenlabs, text_term]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: system prompt infrastructure (buildSystemPrompt, buildTextTermPrompt, buildModeBlock)
provides:
  - addParagraphNumbers helper for [N]-prefixed paragraph injection
  - Strengthened QUOTE move with explicit paragraph citation format
  - TEXT ENGAGEMENT block requiring 2+ specific paragraph references
affects: [04-portrait-end-to-end-polish, system-prompt-engineering]

# Tech tracking
tech-stack:
  added: []
  patterns: [paragraph-numbered-context-injection]

key-files:
  created: []
  modified:
    - apps/tablet/src/lib/systemPrompt.ts
    - apps/tablet/src/lib/systemPrompt.test.ts

key-decisions:
  - "Paragraph numbering via split on double newlines with [N] prefix for citation grounding"
  - "TEXT ENGAGEMENT block placed between RULES and CRITICAL CONSTRAINT for prompt attention priority"
  - "Net prompt change kept to 14 lines to avoid instruction dilution"

patterns-established:
  - "Citation grounding: inject structured markers into context text so LLM can reference specific passages"

requirements-completed: [R8]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 04 Plan 02: Citation Improvements Summary

**Paragraph-numbered text injection with QUOTE move citation format and TEXT ENGAGEMENT minimum for text_term mode**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T10:27:27Z
- **Completed:** 2026-03-09T10:30:56Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `addParagraphNumbers` helper that splits text on double newlines and prefixes each paragraph with `[N]`
- Strengthened QUOTE move from vague "Reference a specific line" to explicit citation format: "In paragraph [N], the author writes: '...'"
- Added TEXT ENGAGEMENT block requiring at least 2 specific paragraph references per conversation
- 6 new tests covering paragraph numbering, citation instructions, and mode isolation (term_only/chain unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for citation improvements** - `1e0f029` (test)
2. **Task 1 (GREEN): Paragraph numbering and citation instructions** - `5393bff` (feat)

## Files Created/Modified
- `apps/tablet/src/lib/systemPrompt.ts` - Added addParagraphNumbers helper, updated buildModeBlock text_term case, strengthened QUOTE move, added TEXT ENGAGEMENT block
- `apps/tablet/src/lib/systemPrompt.test.ts` - Added 6 new tests in 'citation improvements (R8)' describe block

## Decisions Made
- Paragraph numbering uses double-newline split (matching standard paragraph separation) rather than single-newline split
- TEXT ENGAGEMENT block placed between RULES and CRITICAL CONSTRAINT to get strong LLM attention without displacing the critical anti-ending guardrail
- Net prompt change kept to 14 lines (17 insertions, 3 deletions) to stay under the 15-line bloat threshold

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing typecheck failure in `usePortraitCapture.test.ts` (imports module that doesn't exist yet, part of plan 04-01). Not caused by this plan's changes. No action taken.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Citation infrastructure complete for text_term mode
- System prompt ready for production use with improved text engagement
- Plan 04-01 (portrait capture) can proceed independently

## Self-Check: PASSED

- [x] `apps/tablet/src/lib/systemPrompt.ts` exists
- [x] `apps/tablet/src/lib/systemPrompt.test.ts` exists
- [x] `04-02-SUMMARY.md` exists
- [x] Commit `1e0f029` (test RED) found
- [x] Commit `5393bff` (feat GREEN) found
- [x] `addParagraphNumbers` present in systemPrompt.ts
- [x] `TEXT ENGAGEMENT` present in systemPrompt.ts
- [x] 13/13 tests pass

---
*Phase: 04-portrait-end-to-end-polish*
*Completed: 2026-03-09*
