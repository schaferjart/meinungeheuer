# Phase 2: Core Component and Hooks - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract the KaraokeReader component and its hooks — 60fps word highlighting, auto-scroll, playback controls, and status state machine — into the package with working DOM-based sync. No ElevenLabs adapter or CSS theming in this phase — those are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all Phase 2 decisions — Claude has full flexibility on:

- **Component API surface:** Design a generic `<KaraokeReader>` that accepts `text + WordTimestamp[] + audioSrc` (not voiceId/apiKey). Consumer provides pre-fetched audio and timestamps. ElevenLabs-specific fetching moves to Phase 3 adapter.
- **Hook decomposition:** Split the monolithic `useTextToSpeechWithTimestamps` into focused hooks: `useAudioSync` (rAF loop + binary search), `useAutoScroll` (comfort zone scrolling with manual-scroll cooldown). Keep them composable but usable independently.
- **Playback controls:** Built-in: tap-to-pause on text area, Space/Enter keyboard, volume slider, onComplete callback. Loading/error states rendered by the component. Consumer can override via render props or hide built-in controls.
- **State machine:** Status transitions: idle → loading → ready → playing → paused → done | error. Expose status and transition functions (play, pause) to consumer.
- **DOM class toggling strategy:** Keep the proven direct DOM manipulation pattern (no React re-renders during playback). Use data attributes or class names configurable via props/CSS custom properties rather than hardcoded Tailwind classes.
- **Auto-scroll behavior:** Keep comfort zone approach (20%-65% viewport band). 3s cooldown after manual scroll (matching COMP-04 spec). Scrollable container ref managed internally.
- **Testing approach:** Integration tests with happy-dom for DOM class toggling and status transitions. Unit tests for binary search and scroll logic.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TextReader.tsx` (600 lines): Full component with highlighting, scroll, controls — extract and generalize
- `useTextToSpeechWithTimestamps.ts:updateActiveWord()`: Binary search rAF loop — extract as `useAudioSync`
- `TextReader.tsx:handleContainerScroll()`: Manual scroll cooldown pattern — extract as `useAutoScroll`
- `TextReader.tsx:renderWord()`: Word span rendering with data-index refs — adapt for package
- `packages/karaoke-reader/src/types.ts`: WordTimestamp, ParsedParagraph, TtsStatus already exported from Phase 1

### Established Patterns
- Direct DOM class toggling via `useEffect` + `Map<number, HTMLSpanElement>` refs (proven 60fps approach)
- Binary search over sorted WordTimestamp[] for O(log n) active word lookup
- Comfort-zone auto-scroll with `getBoundingClientRect()` relative positioning
- `prevActiveRef` pattern to track previous word for class removal

### Integration Points
- Component imports types from `./types.ts` (Phase 1)
- Component imports utilities from `./utils/` (Phase 1: parseMarkdownText, stripMarkdownForTTS)
- Hooks barrel at `src/hooks/index.ts` (placeholder from Phase 1, now gets real exports)
- Phase 3 will add CSS theming on top of this component

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user trusts Claude's judgment on all component and hook decisions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-core-component-and-hooks*
*Context gathered: 2026-03-07*
