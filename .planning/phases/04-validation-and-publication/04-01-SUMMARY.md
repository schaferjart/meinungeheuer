---
phase: 04-validation-and-publication
plan: 01
subsystem: ui, integration
tags: [karaoke-reader, react, elevenlabs, tts, supabase, cache-adapter]

requires:
  - phase: 03-adapters-and-styling
    provides: KaraokeReader component, useElevenLabsTTS hook, CacheAdapter interface, CSS custom properties
provides:
  - MeinUngeheuer tablet app consuming karaoke-reader package as first real consumer
  - Supabase-backed CacheAdapter implementation
  - Validated API surface works for production use case
affects: [04-02-documentation-and-publication]

tech-stack:
  added: []
  patterns:
    - "Workspace dependency consumption: karaoke-reader as workspace:* in tablet"
    - "CacheAdapter bridge pattern: Supabase-specific adapter implementing generic interface"
    - "Combined status tracking: TTS fetch phase + KaraokeReader playback phase"

key-files:
  created:
    - apps/tablet/src/lib/supabaseCacheAdapter.ts
  modified:
    - apps/tablet/src/components/TextReader.tsx
    - apps/tablet/package.json
  deleted:
    - apps/tablet/src/lib/ttsCache.ts
    - apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts
    - apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts

key-decisions:
  - "text_length and voice_id included in Supabase insert with defaults to satisfy NOT NULL DB constraints"
  - "Singleton cache adapter pattern to avoid re-creating Supabase client per render"
  - "Audio element managed by wrapper (not KaraokeReader) to enable external play/pause buttons"
  - "CSS custom properties used for MeinUngeheuer-specific visual settings instead of inline styles"

patterns-established:
  - "CacheAdapter bridge: generic interface + app-specific implementation"
  - "Combined status: TTS fetch phase feeds into KaraokeReader playback phase"

requirements-completed: [VAL-01, VAL-02, VAL-03]

duration: 6min
completed: 2026-03-08
---

# Phase 4 Plan 01: Wire MeinUngeheuer Tablet App to Consume karaoke-reader Package Summary

**Tablet app now imports KaraokeReader, useElevenLabsTTS, and stripMarkdownForTTS from karaoke-reader package, replacing 820 lines of local text-reading code with package imports and a thin MeinUngeheuer-specific wrapper.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-08T11:51:16Z
- **Completed:** 2026-03-08T11:57:37Z
- **Tasks:** 7
- **Files modified:** 6 (2 created, 1 modified, 3 deleted)

## Accomplishments
- Tablet app is the first real consumer of the karaoke-reader package, validating the API surface
- Replaced 820 lines of local code (useTextToSpeechWithTimestamps 555 + test 265) with package imports
- TextReader.tsx reduced from 600 to 256 lines (57% reduction) -- all text rendering/sync/scroll logic delegated to KaraokeReader
- Supabase cache adapter bridges the generic CacheAdapter interface to the app-specific tts_cache table
- 111 tests in karaoke-reader pass, covering all extracted functionality (VAL-02: 50 unit, VAL-03: 45 integration, 16 adapter)
- Full monorepo gate passes: build, test (138 total), publint, attw

## Task Commits

Each task was committed atomically:

1. **Task 01-01: Add karaoke-reader workspace dependency** - `e646735` (chore)
2. **Task 01-02: Verify monorepo build order** - no commit needed (build order correct as-is)
3. **Task 01-03: Replace ttsCache.ts with supabaseCacheAdapter** - `5e26728` (feat)
4. **Task 01-04: Rewrite TextReader.tsx** - `387ceba` (feat)
5. **Task 01-05: Delete useTextToSpeechWithTimestamps** - `9928fd2` (feat)
6. **Task 01-06: Verify VAL-02 and VAL-03 coverage** - no commit needed (verification only)
7. **Task 01-07: Full monorepo gate verification** - no commit needed (verification only)

## Files Created/Modified
- `apps/tablet/package.json` - Added karaoke-reader workspace dependency
- `apps/tablet/src/lib/supabaseCacheAdapter.ts` - NEW: Supabase-backed CacheAdapter implementation
- `apps/tablet/src/components/TextReader.tsx` - Rewritten to use karaoke-reader imports
- `apps/tablet/src/lib/ttsCache.ts` - DELETED: replaced by supabaseCacheAdapter.ts
- `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` - DELETED: replaced by karaoke-reader hooks
- `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts` - DELETED: tests now in karaoke-reader

## Decisions Made
- **text_length/voice_id in cache adapter:** DB schema has NOT NULL constraints on these columns. The generic CacheAdapter interface does not pass these values. Solution: compute text_length from word timestamps, default voice_id to 'unknown'. Cache is a performance optimization, not a correctness requirement.
- **Singleton cache adapter:** `createSupabaseTTSCache()` is called once and reused via module-level variable to avoid recreating the Supabase client on every render.
- **Wrapper-managed audio element:** TextReader creates the HTMLAudioElement and passes it to KaraokeReader as `audioSrc`, enabling external play/pause buttons while KaraokeReader handles click-to-toggle internally.
- **CSS custom properties for theming:** MeinUngeheuer visual settings (amber highlight, Georgia serif, dark background) applied via `--kr-*` CSS custom properties rather than inline styles, leveraging the package's built-in theming system.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Supabase insert requires text_length and voice_id**
- **Found during:** Task 01-03 (supabaseCacheAdapter)
- **Issue:** DB schema has NOT NULL constraints on text_length and voice_id columns, but CacheAdapter interface does not pass these
- **Fix:** Compute text_length from word timestamps, default voice_id to 'unknown'
- **Files modified:** apps/tablet/src/lib/supabaseCacheAdapter.ts
- **Verification:** tsc --noEmit passes for the new file
- **Committed in:** 5e26728 (Task 01-03 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor schema compatibility fix, no scope creep.

## Issues Encountered
- Pre-existing type errors in `useConversation.ts` (ElevenLabs SDK type mismatches) remain. These are documented in CLAUDE.md as known issues unrelated to this work. No new type errors were introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01 complete, karaoke-reader package validated as production-ready consumer
- Ready for Plan 02 (documentation and publication)

---
*Phase: 04-validation-and-publication*
*Completed: 2026-03-08*
