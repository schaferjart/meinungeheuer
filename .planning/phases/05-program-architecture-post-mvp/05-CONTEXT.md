# Phase 5: Program Architecture (Post-MVP) - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning
**Source:** Conversation with user during Phase 4 completion

<domain>
## Phase Boundary

Extract the current monolithic installation flow into a modular, combinable architecture where each pipeline stage is an independent "atom" that can be swapped, toggled, and tested in isolation. The user wants to rapidly prototype different installation configurations by mixing and matching modules.

</domain>

<decisions>
## Implementation Decisions

### Modular Atoms (all independently swappable)
- **Text source:** Different source texts, languages, hot-swappable without code changes
- **Conversation mode/personality:** text_term, term_only, chain — plus ability to define new modes with different system prompt styles and agent behaviors
- **Print layout:** Different card formats (definition-only, definition+portrait, portrait-only, custom layouts)
- **Portrait pipeline:** Toggleable — skip portrait capture entirely, or swap processing (dithered, style-transferred, raw)
- **Pipeline stages:** Each stage (TTS reading, conversation, portrait capture, printing) independently toggleable — e.g. run conversation only, skip printing, skip TTS reading

### Testability
- Each atom must be testable in isolation without other components running
- A "test session" means: pick a text, pick a mode, pick a print template, toggle portrait on/off, toggle stages on/off — run it, see results
- Configuration should be changeable without redeployment (runtime config, not build-time)

### Architecture Direction (from STATE.md key decisions)
- Programs as TypeScript code, not DB records
- One ElevenLabs agent, programs differentiated via prompt overrides
- Keep existing behavior identical through the new interface (no regressions)

### Claude's Discretion
- Internal interface design (how atoms compose)
- Config storage mechanism (Supabase installation_config vs local config vs env vars)
- Whether to use a registry pattern, plugin system, or simple composition
- How to handle cross-cutting concerns (e.g., portrait capture depends on camera, which depends on face detection)

</decisions>

<specifics>
## Specific Ideas

- `ConversationProgram` interface in shared package (from R9 requirements)
- Extract current behavior into `aphorism` program as first implementation
- `installation_config.program` column selects active program
- Implement a second program to validate the architecture actually works
- The user explicitly listed 5 atom types: text source, conversation mode/personality, print layout, portrait pipeline, pipeline stages

</specifics>

<deferred>
## Deferred Ideas

- Admin dashboard for runtime config switching (future UI work)
- Chain visualization
- Embeddings / semantic search across definitions

</deferred>

---

*Phase: 05-program-architecture-post-mvp*
*Context gathered: 2026-03-09 via conversation*
