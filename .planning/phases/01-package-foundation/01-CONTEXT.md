# Phase 1: Package Foundation - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold a publishable npm package with correct exports map, TypeScript declarations, and all pure utility functions extracted and tested. No React components or hooks in this phase — pure functions only.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all Phase 1 decisions — Claude has full flexibility on:

- **Package name:** Choose something clear and available on npm
- **Package location:** Extract into `packages/karaoke-reader/` inside the MeinUngeheuer monorepo first (safe refactor with existing tests), then standalone repo later (Phase 4)
- **Extraction strategy:** Copy source, refactor in place — preserving proven logic
- **Bundler config:** tsup 8.5, ESM+CJS dual output, `.d.ts` generation
- **Lint/format:** Biome 2.x
- **Testing:** Vitest + happy-dom, tests next to source files
- **Subpath exports:** root, /hooks, /utils, /elevenlabs, /styles.css (Phase 1 only scaffolds the map; hooks/components come in Phase 2)
- **Package validation:** publint + @arethetypeswrong/cli in build script

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useTextToSpeechWithTimestamps.ts:buildWordTimestamps()` — Pure function, extract directly
- `useTextToSpeechWithTimestamps.ts:splitTextIntoChunks()` — Pure function, extract directly
- `ttsCache.ts:computeCacheKey()` — Pure function using crypto.subtle SHA-256
- `TextReader.tsx:stripMarkdownForTTS()` — Pure function, strips markdown from TTS input
- `TextReader.tsx:parseMarkdownText()` — Pure function, parses markdown into word structures
- `packages/shared/src/types.ts` — WordTimestamp-like patterns to reference

### Established Patterns
- TypeScript strict mode, no `any`
- ES2022 target, ESNext modules, bundler resolution
- Zod for runtime validation at boundaries
- Test files next to source: `foo.ts` → `foo.test.ts`

### Integration Points
- New package at `packages/karaoke-reader/` in pnpm workspace
- Will be consumed by `apps/tablet/` in Phase 4

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user trusts Claude's judgment on all infrastructure decisions. Research findings (STACK.md, ARCHITECTURE.md) provide the blueprint.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-package-foundation*
*Context gathered: 2026-03-07*
