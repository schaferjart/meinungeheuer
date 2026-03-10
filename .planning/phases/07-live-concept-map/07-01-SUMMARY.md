---
phase: 07-live-concept-map
plan: 01
subsystem: ui
tags: [react, canvas, force-layout, concept-extraction, animation, vitest]

# Dependency graph
requires:
  - phase: 02-pwa-kiosk
    provides: tablet app structure, ConversationScreen component
provides:
  - Client-side concept extraction from transcript text (bilingual EN/DE)
  - Force-directed graph layout simulation for concept positioning
  - Canvas + DOM hybrid rendering for concept map visualization
  - Evolving definition component with crossfade transitions
  - Rewritten ConversationScreen replacing chat bubbles with live concept map
affects: [tablet-ui, conversation-screen, visual-design]

# Tech tracking
tech-stack:
  added: []
  patterns: [useSyncExternalStore for non-React state, Canvas+DOM hybrid rendering, force-directed layout, memo wrappers for animation performance]

key-files:
  created:
    - apps/tablet/src/lib/conceptExtractor.ts
    - apps/tablet/src/lib/conceptExtractor.test.ts
    - apps/tablet/src/hooks/useConceptMap.ts
    - apps/tablet/src/hooks/useConceptMap.test.ts
    - apps/tablet/src/hooks/useForceLayout.ts
    - apps/tablet/src/hooks/useForceLayout.test.ts
    - apps/tablet/src/components/ConceptMapCanvas.tsx
    - apps/tablet/src/components/ConceptNode.tsx
    - apps/tablet/src/components/EvolvingDefinition.tsx
  modified:
    - apps/tablet/src/components/screens/ConversationScreen.tsx

key-decisions:
  - "Custom stopword filter over compromise.js for zero added dependencies and smaller bundle"
  - "useSyncExternalStore for concept map state to decouple from React render cycle"
  - "Canvas for connection lines, DOM for text labels — hybrid avoids Canvas text rendering issues"
  - "React.memo on ConceptNodeElement and EvolvingDefinition to prevent re-render cascades from force layout"
  - "No shadowBlur on canvas — removed per plan guidance for iPad performance"
  - "Force layout throttled to update React state every 3 frames (~20 position updates/sec)"

patterns-established:
  - "Canvas+DOM hybrid: Canvas for geometry (lines, shapes), DOM for text (accessibility, CSS transitions)"
  - "useSyncExternalStore pattern for imperative state that updates outside React lifecycle"
  - "Force-directed layout as pure function simulateStep() + React hook wrapper"

requirements-completed: [R10]

# Metrics
duration: 15min
completed: 2026-03-11
---

# Phase 7 Plan 01: Live Concept Map Visualization Summary

**Client-side concept extraction with bilingual stopwords, force-directed graph layout, Canvas+DOM hybrid rendering, and evolving definition crossfade — replacing chat transcript bubbles in ConversationScreen**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-10T22:54:02Z
- **Completed:** 2026-03-11T00:09:18Z
- **Tasks:** 8
- **Files modified:** 10

## Accomplishments
- Concept extractor with bilingual (EN/DE) stopword lists extracts keywords from live transcript
- Force-directed layout positions concept nodes organically with repulsion, attraction, centering
- Canvas renders connection lines (bezier curves) between co-occurring concepts
- ConversationScreen rewritten: concepts appear/fade/connect instead of chat bubbles
- 27 new tests (10 extractor + 12 concept map + 5 force layout), all 95 tablet tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Concept Extractor** - `ce3a820` (feat)
2. **Task 2: Concept Map State Hook** - `da03f02` (feat)
3. **Task 3: Force-Directed Layout** - `b4e6c66` (feat)
4. **Task 4: Canvas Connection Lines** - `65d64d5` (feat)
5. **Task 5: Concept Node Component** - `86f4361` (feat)
6. **Task 6: Evolving Definition Component** - `0b9dda8` (feat)
7. **Task 7: Rewrite ConversationScreen** - `2a164d8` (feat)
8. **Task 8: iPad Performance Tuning** - `8295a2b` (chore)

## Files Created/Modified
- `apps/tablet/src/lib/conceptExtractor.ts` - Bilingual concept/keyword extraction from transcript text
- `apps/tablet/src/lib/conceptExtractor.test.ts` - 10 tests for extraction, filtering, edge cases
- `apps/tablet/src/hooks/useConceptMap.ts` - Core concept graph state: nodes, edges, lifecycle, definition draft
- `apps/tablet/src/hooks/useConceptMap.test.ts` - 12 tests for state management and lifecycle fading
- `apps/tablet/src/hooks/useForceLayout.ts` - Force simulation (repulsion, attraction, centering, damping)
- `apps/tablet/src/hooks/useForceLayout.test.ts` - 5 tests for physics, bounds, edge cases
- `apps/tablet/src/components/ConceptMapCanvas.tsx` - Canvas drawing connection lines between nodes
- `apps/tablet/src/components/ConceptNode.tsx` - Positioned DOM element with scale-in animation
- `apps/tablet/src/components/EvolvingDefinition.tsx` - Bottom-anchored definition with crossfade
- `apps/tablet/src/components/screens/ConversationScreen.tsx` - Rewritten to compose concept map visualization

## Decisions Made
- **Custom stopword filter over compromise.js:** Zero added dependencies keeps bundle small. The curated bilingual stopword list covers the installation's German and English conversations adequately.
- **useSyncExternalStore for concept map state:** The concept map state updates imperatively (lifecycle ticks, transcript processing) outside React's render cycle. useSyncExternalStore avoids stale closure issues and excessive re-renders.
- **Canvas+DOM hybrid rendering:** Canvas handles geometry (bezier connection lines) efficiently; DOM handles text labels with proper CSS transitions, font rendering, and accessibility.
- **No shadowBlur:** Plan advised to skip if iPad performance degrades. Omitted preemptively since text shadows on DOM elements achieve similar depth effect without canvas overhead.
- **Force layout throttle at 3 frames:** Updates React state ~20 times/sec instead of 60. Simulation runs at full framerate internally but only triggers re-renders at reduced rate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed strict TypeScript null checks in hooks and tests**
- **Found during:** Task 7 (ConversationScreen integration)
- **Issue:** TypeScript strict mode flagged array indexing (`nodes[i]`, `edges[edgeIndex]`) as possibly undefined. Spread operator on possibly-undefined objects failed type checks.
- **Fix:** Added non-null assertions (`!`) for test code, explicit null guards and intermediate variables for source code.
- **Files modified:** useConceptMap.ts, useConceptMap.test.ts, useForceLayout.ts, useForceLayout.test.ts
- **Verification:** `pnpm typecheck` passes cleanly
- **Committed in:** `2a164d8` (Task 7 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Strict null check fixes required for TypeScript compliance. No scope creep.

## Issues Encountered
None beyond the TypeScript strict null checks documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Concept map visualization is fully self-contained and additive
- Old ConversationScreen can be restored by reverting the single file change (all new files are independent)
- iPad Safari performance verification requires physical device testing
- 95 tablet tests + full typecheck passing

## Self-Check: PASSED

All 10 created files verified on disk. All 8 task commits verified in git log.

---
*Phase: 07-live-concept-map*
*Completed: 2026-03-11*
