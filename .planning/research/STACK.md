# Technology Stack

**Project:** Modular Conversation Programs
**Researched:** 2026-03-08

## Recommended Stack

No new dependencies required. The modular program system is a structural pattern built on top of existing technologies.

### Existing Stack (unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | strict | Program type definitions | Already used everywhere, type safety critical for program interfaces |
| React | 18.3.1 | Component registry for result screens | Already in place, just need dynamic component lookup |
| @11labs/react | 0.2.0 | Conversation sessions with per-program prompt overrides | Already in use, override API confirmed sufficient |
| @elevenlabs/client | 0.15.0 | Newer SDK version also installed | Same override capabilities, TTS speed/stability controls added |
| Zod | (existing) | Runtime validation of program configs and results | Already used for all API boundaries |
| Hono | (existing) | Backend webhook routing per program | Already in use, just needs new/widened endpoints |
| Supabase | (existing) | Config storage, result persistence | Already in use, needs minor schema additions |

### New Code Locations (no new packages)

| Location | Purpose | Why Here |
|----------|---------|----------|
| `packages/shared/src/programs/` | Program type definitions + registry | Shared across tablet and backend |
| `packages/shared/src/programs/types.ts` | ConversationProgram interface | Core type, needed by all consumers |
| `packages/shared/src/programs/aphorism.ts` | Current behavior as first program | Extracted from existing systemPrompt.ts |
| `packages/shared/src/programs/registry.ts` | getProgram(id) lookup | Central program resolution |
| `apps/tablet/src/components/screens/results/` | Result display components per program | Keep screen components organized |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Program storage | TypeScript code | Supabase rows (JSON) | Prompts are complex prose needing version control + type safety |
| Program storage | TypeScript code | YAML/JSON config files | Lose TypeScript type checking, harder to include functions |
| Tool strategy | Reuse save_definition | Multiple ElevenLabs agents | Unnecessary complexity; one agent with prompt overrides is cleaner |
| Tool strategy | Reuse save_definition | Generic save_result tool | Requires ElevenLabs dashboard changes; defer until second program proves it's needed |
| State machine | Keep as-is, component swap | Dynamic state graph | Over-engineering for 9 states; physical flow doesn't change |
| Print templates | POS server endpoints | Client-side ESC/POS rendering | Adds complexity to thin bridge; POS server already handles layout |

## Installation

No new packages to install. The work is structural refactoring.

```bash
# Verify existing setup still works after changes
pnpm build
pnpm typecheck
pnpm test
```

## Sources

- Codebase analysis: package.json files, installed SDK types
- [ElevenLabs Overrides Documentation](https://elevenlabs.io/docs/agents-platform/customization/personalization/overrides)
