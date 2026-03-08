# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Karaoke Text Reader

**Shipped:** 2026-03-08
**Phases:** 4 | **Plans:** 12

### What Was Built
- Standalone `karaoke-reader` npm package (v0.1.0) with 60fps word-by-word karaoke highlighting
- 5 pure utility functions (timestamp conversion, text chunking, cache keys, markdown processing)
- KaraokeReader React component with auto-scroll, playback controls, status state machine
- Optional ElevenLabs TTS adapter as tree-shakeable subpath export
- Pluggable cache layer (CacheAdapter interface + memory/localStorage implementations)
- Self-contained CSS theming with 21 `--kr-*` custom properties
- MeinUngeheuer tablet app wired as first production consumer

### What Worked
- 4-phase coarse roadmap matched research recommendations and covered all 32 requirements cleanly
- Extracting pure utilities first (Phase 1) gave a solid foundation for hooks and component (Phase 2)
- Tree-shakeable subpath exports kept the adapter optional without bloating the core bundle
- publint + attw validation caught export map issues early
- MockAudio test helper made hook testing reliable and fast

### What Was Inefficient
- Phase 1 SUMMARY.md frontmatter didn't include `requirements_completed` field (pre-dated convention), causing partial traceability during audit
- TextReader.tsx integration used wrong CSS custom property names (`--kr-highlight` vs `--kr-highlight-color`) — a silent bug masked by coincidental default values
- Dual audio element pattern in TextReader.tsx (external play/pause bypasses KaraokeReader status machine) — architectural tension from wrapping rather than fully delegating to the component

### Patterns Established
- `data-kr-state` attribute-driven styling for zero-React-render DOM updates during animation
- Factory function pattern for cache adapters (`createMemoryCache()`, `createLocalStorageCache()`)
- `prepublishOnly` quality gate: build + test + check-exports before every npm publish
- Fire-and-forget cache semantics: `.catch(() => {})` for async cache rejections

### Key Lessons
1. When extracting a component from a larger app, the consumer integration (Phase 4) often reveals API surface friction that wasn't visible during isolated development
2. CSS custom property naming must be validated at the consumer level, not just the package level — silent fallback to defaults can hide mismatches
3. publint + attw are essential for package quality — they caught issues that TypeScript alone wouldn't flag

### Cost Observations
- Model mix: ~30% opus (ElevenLabs integration, audit), ~70% sonnet (implementation, verification)
- Sessions: ~8 across 11 days
- Notable: Parallel plan execution within phases was efficient; coarse granularity (4 phases) kept overhead low

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 12 | First milestone — established coarse roadmap pattern |

### Cumulative Quality

| Milestone | Tests | Package LOC | Zero-Dep Status |
|-----------|-------|-------------|-----------------|
| v1.0 | 138 | 3,911 | Zero runtime deps (React peer only) |

### Top Lessons (Verified Across Milestones)

1. Coarse phase granularity (3-5 phases per milestone) keeps planning overhead proportional to implementation effort
2. Validate consumer integration early — package-level correctness doesn't guarantee consumer-level correctness
