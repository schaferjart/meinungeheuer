# Phase 5: Program Architecture (Post-MVP) - Research

**Researched:** 2026-03-09
**Domain:** Modular program architecture — refactoring monolithic installation flow into composable, swappable pipeline stages
**Confidence:** HIGH

## Summary

Phase 5 transforms the current monolithic installation into a modular architecture where each pipeline stage (text source, conversation personality, print layout, portrait pipeline, stage toggling) is an independently swappable "atom." The codebase currently hardcodes behavior across 5 tightly coupled locations: the state machine reducer, `systemPrompt.ts`, `firstMessage.ts`, `persist.ts`, and `App.tsx` orchestration logic. The refactoring must extract these into a `ConversationProgram` interface in the shared package, wire program selection through `installation_config`, and validate the architecture by implementing a second program alongside the existing `aphorism` program.

The key constraint from STATE.md: programs are TypeScript code, not DB records. One ElevenLabs agent is shared across all programs — differentiation happens via prompt overrides at session start. The existing behavior must remain identical through the new interface. The architecture should enable runtime configuration switching (text, mode, print template, portrait on/off) without redeployment.

**Primary recommendation:** Define a `ConversationProgram` interface with 5 atom slots (textSource, conversationMode, printLayout, portraitPipeline, stageConfig), implement a program registry in the shared package, extract current behavior as the `aphorism` program, add a `program` column to `installation_config`, and validate with a second `free_association` program that skips text reading and uses a simpler print layout.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Modular Atoms (all independently swappable):** Text source, conversation mode/personality, print layout, portrait pipeline, pipeline stages — each independently toggleable and swappable
- **Testability:** Each atom testable in isolation; "test session" = pick text + mode + print template + toggle portrait + toggle stages; configuration changeable without redeployment (runtime config)
- **Architecture Direction:** Programs as TypeScript code, not DB records. One ElevenLabs agent, programs differentiated via prompt overrides. Keep existing behavior identical through new interface.

### Claude's Discretion
- Internal interface design (how atoms compose)
- Config storage mechanism (Supabase installation_config vs local config vs env vars)
- Whether to use a registry pattern, plugin system, or simple composition
- How to handle cross-cutting concerns (e.g., portrait capture depends on camera, which depends on face detection)

### Deferred Ideas (OUT OF SCOPE)
- Admin dashboard for runtime config switching (future UI work)
- Chain visualization
- Embeddings / semantic search across definitions
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R9 | Extract `ConversationProgram` interface. Refactor current behavior into `aphorism` program. Wire program selection via `installation_config`. | Full architecture analysis of existing code identifies 5 extraction points. Interface design, registry pattern, DB migration, and second program implementation all documented below. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.7+ | Program interface definitions | Already in use project-wide, strict mode |
| Zod | 3.25+ | Runtime validation of program configs | Already used for all type validation |
| @meinungeheuer/shared | workspace | ConversationProgram interface + registry | Central shared types package |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase | 2.49+ | installation_config.program column | Already used, migration needed |
| Vitest | 3.0+ | Unit tests for program registry + atoms | Already configured |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeScript code programs | DB-stored JSON programs | Would allow non-developer config, but adds complexity, was explicitly rejected by user |
| Plugin system with dynamic import | Static registry with Record | Dynamic import adds async complexity, not needed for < 10 programs |
| Zod discriminated unions for program types | Plain TypeScript interfaces | Zod adds runtime validation but programs are code-authored; plain interfaces sufficient for type safety |

## Architecture Patterns

### Current Architecture (What Exists)

The monolithic flow touches these 5 files with mode-specific logic:

```
apps/tablet/src/
├── App.tsx                          # Orchestration: mode-branching in effects
├── hooks/useInstallationMachine.ts  # State machine: mode-aware transitions
├── hooks/useConversation.ts         # ElevenLabs: passes mode to prompt builder
├── lib/systemPrompt.ts             # Prompt: mode-switched (text_term vs term_only/chain)
├── lib/firstMessage.ts             # First message: mode-switched
├── lib/persist.ts                   # Persistence: mode-agnostic (good — no changes needed)
```

Key coupling points:
1. `buildSystemPrompt(mode, term, contextText)` — switches on `Mode` enum
2. `buildFirstMessage(mode, term, contextText, language)` — switches on `Mode` enum
3. `useInstallationMachine` reducer — mode-aware transitions (`text_term` skips `term_prompt`)
4. `App.tsx` effects — mode-aware orchestration (portrait capture, conversation lifecycle)
5. `printer.ts` — mode-agnostic (sends PrintPayload to POS server)

### Recommended Refactored Structure

```
packages/shared/src/
├── types.ts                      # Existing types + ProgramId type
├── programs/
│   ├── index.ts                  # Registry: getProgramConfig(), listPrograms()
│   ├── types.ts                  # ConversationProgram interface + atom types
│   ├── aphorism.ts               # Current behavior extracted
│   └── free-association.ts       # Second program for validation
├── constants.ts                  # Existing + DEFAULT_PROGRAM
├── supabase.ts                   # Existing (no changes needed)
└── index.ts                      # Re-exports programs

apps/tablet/src/
├── App.tsx                       # Simplified: reads program from config, passes to hooks
├── hooks/
│   ├── useInstallationMachine.ts # Now reads stage config from program
│   ├── useConversation.ts        # Delegates to program.buildPrompt()
│   └── usePortraitCapture.ts     # Unchanged, toggled by program.stages.portrait
├── lib/
│   ├── systemPrompt.ts           # Becomes: thin wrapper calling program.buildSystemPrompt()
│   ├── firstMessage.ts           # Becomes: thin wrapper calling program.buildFirstMessage()
│   └── persist.ts                # Unchanged (already mode-agnostic)
└── components/screens/           # DefinitionScreen reads program.resultComponent (optional)
```

### Pattern 1: ConversationProgram Interface

**What:** A TypeScript interface defining all swappable atoms for a program configuration.
**When to use:** Every installation session resolves its behavior through this interface.
**Example:**

```typescript
// packages/shared/src/programs/types.ts

/** Which pipeline stages are active for this program. */
export interface StageConfig {
  /** Show text and TTS reading before conversation. */
  textReading: boolean;
  /** Show term prompt screen before conversation. */
  termPrompt: boolean;
  /** Enable portrait capture during conversation. */
  portrait: boolean;
  /** Enable print card output after conversation. */
  printing: boolean;
}

/** Print layout identifier — maps to POS server endpoint/template. */
export type PrintLayout = 'dictionary' | 'dictionary_portrait' | 'portrait_only' | 'message';

/** How the conversation result is displayed on the definition screen. */
export type ResultDisplay = 'aphorism' | 'definition' | 'raw_transcript';

export interface ConversationProgram {
  /** Unique identifier stored in installation_config.program. */
  id: string;
  /** Human-readable name for admin UI (future). */
  name: string;
  /** Short description. */
  description: string;

  /** Which pipeline stages are active. */
  stages: StageConfig;

  /** Build the system prompt for the ElevenLabs agent. */
  buildSystemPrompt: (params: PromptParams) => string;

  /** Build the first message the agent speaks. */
  buildFirstMessage: (params: PromptParams) => string;

  /** Which print layout to use (POS server endpoint). */
  printLayout: PrintLayout;

  /** How to display the conversation result on screen. */
  resultDisplay: ResultDisplay;

  /** The Mode value for Supabase session records. */
  sessionMode: Mode;
}

export interface PromptParams {
  term: string;
  contextText: string | null;
  language: string;
}
```

### Pattern 2: Program Registry

**What:** A simple Record-based registry mapping program IDs to program configs. No dynamic imports.
**When to use:** At app startup when resolving config, and for listing available programs.
**Example:**

```typescript
// packages/shared/src/programs/index.ts

import { aphorismProgram } from './aphorism.js';
import { freeAssociationProgram } from './free-association.js';
import type { ConversationProgram } from './types.js';

const REGISTRY: Record<string, ConversationProgram> = {
  aphorism: aphorismProgram,
  free_association: freeAssociationProgram,
};

export const DEFAULT_PROGRAM = 'aphorism';

export function getProgram(id: string): ConversationProgram {
  const program = REGISTRY[id];
  if (!program) {
    console.warn(`[Programs] Unknown program "${id}", falling back to default`);
    return REGISTRY[DEFAULT_PROGRAM]!;
  }
  return program;
}

export function listPrograms(): ConversationProgram[] {
  return Object.values(REGISTRY);
}
```

### Pattern 3: Aphorism Program (Extract Current Behavior)

**What:** The existing monolithic behavior, extracted verbatim into the program interface.
**When to use:** This IS the current default. Zero behavior change.
**Example:**

```typescript
// packages/shared/src/programs/aphorism.ts

import type { ConversationProgram, PromptParams } from './types.js';

export const aphorismProgram: ConversationProgram = {
  id: 'aphorism',
  name: 'Aphorism',
  description: 'Text reading + Socratic dialogue -> compressed aphorism on card',

  stages: {
    textReading: true,   // Mode A default: show text + karaoke
    termPrompt: false,   // text_term mode skips term_prompt (concept emerges)
    portrait: true,
    printing: true,
  },

  buildSystemPrompt: (params: PromptParams): string => {
    // Move existing buildTextTermPrompt + buildModeBlock logic here
    return buildAphorismPrompt(params);
  },

  buildFirstMessage: (params: PromptParams): string => {
    const isGerman = params.language.startsWith('de');
    return isGerman
      ? 'Du hast gerade einen Text gelesen. Was ist dir hangengeblieben?'
      : 'You just read a text. What stayed with you?';
  },

  printLayout: 'dictionary',
  resultDisplay: 'aphorism',
  sessionMode: 'text_term',
};
```

### Pattern 4: State Machine Integration

**What:** The state machine reads stage config from the active program to decide transitions.
**When to use:** Replace hardcoded mode-checks with program.stages lookups.
**Example:**

```typescript
// In the reducer, replace:
//   if (state.mode === 'text_term' || state.mode === 'chain')
// With:
//   if (program.stages.textReading)

// The program is resolved once at config time and stored in state:
case 'SET_CONFIG':
  return {
    ...state,
    programId: action.programId,  // NEW: store which program
    mode: action.mode,
    term: action.term,
    contextText: action.contextText,
    parentSessionId: action.parentSessionId,
  };
```

### Pattern 5: Print Template Routing

**What:** The printer bridge reads `printLayout` from the print_queue payload and routes to the appropriate POS server endpoint.
**When to use:** Different programs can produce different card formats.
**Example:**

```typescript
// print_queue.payload gains a "template" field:
{
  template: "dictionary",     // or "message", "portrait_only", etc.
  word: "KREATIVITAT",
  definition: "...",
  citations: [...],
  ...
}

// printer.ts routes based on template:
const endpoint = payload.template === 'message'
  ? '/print/message'
  : '/print/dictionary';  // default
```

The POS server already supports multiple endpoints (`/print/dictionary`, `/print/message`, `/print/label`, etc.) and multiple font/layout configs (`dictionary`, `helvetica`, `acidic` in config.yaml). No POS server changes needed for template routing.

### Anti-Patterns to Avoid

- **God object program:** Don't put all logic in the ConversationProgram interface. Keep it as a configuration object, not a behavior object. Complex logic stays in existing hooks/lib files, programs just configure them.
- **Over-abstracting atoms:** Don't create a generic "Atom" base class or plugin system. These are 5 specific slots. A plain interface with known fields is simpler and type-safe.
- **Breaking the state machine:** The reducer must remain a pure function. Don't inject program logic into the reducer. Instead, pre-resolve stage config and pass it as data.
- **Dynamic imports:** Don't use `import()` for program loading. There will be < 10 programs. Static imports keep the bundle simple and type-safe.
- **Separate prompt files per program:** Keep `systemPrompt.ts` as the prompt library. Programs call specific functions from it. Don't create `programs/aphorism/prompt.ts` — that scatters related prompts across the tree.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Program validation | Custom type guards per program | Zod schema for ConversationProgram | Catches malformed programs at registration time |
| Config storage | Custom config API | Supabase `installation_config` + existing `fetchConfig` | Already wired, just needs a `program` column |
| Print template routing | Custom ESC/POS formatter per program | POS server's existing template endpoints | POS server already has `/print/dictionary`, `/print/message`, etc. |
| Stage toggling | Complex conditional rendering | Program.stages boolean flags | Simple booleans in if-statements; React conditional rendering handles the rest |

**Key insight:** The POS server already has a template system (config.yaml sections: `dictionary`, `helvetica`, `acidic`). The printer bridge already posts to specific POS server endpoints. Print template routing is a 1-line change in `printer.ts`, not a new system.

## Common Pitfalls

### Pitfall 1: Breaking Existing Behavior During Extraction
**What goes wrong:** Extracting into a new interface subtly changes the prompt text, state transitions, or persistence logic.
**Why it happens:** Copy-paste errors, forgetting edge cases in the prompt (like paragraph numbering in text_term mode), or changing function signatures.
**How to avoid:** Run existing tests before AND after extraction. The systemPrompt.test.ts has 6 tests that verify prompt content. The useInstallationMachine.test.ts has 15 tests covering all transitions. Both must pass unchanged.
**Warning signs:** Tests fail after extraction but "the code looks the same."

### Pitfall 2: State Machine Pollution
**What goes wrong:** Adding program-specific state transitions to the reducer creates a combinatorial explosion.
**Why it happens:** Each program might want different screen flows. If you add per-program transitions, the reducer becomes unmanageable.
**How to avoid:** The reducer stays generic. Programs configure WHICH stages are active via `StageConfig` booleans. The reducer uses these booleans, not program IDs. New programs cannot add new screens — they can only toggle existing stages on/off.
**Warning signs:** The reducer has `if (programId === 'X')` branches.

### Pitfall 3: Prompt Parameter Explosion
**What goes wrong:** Each program needs slightly different parameters for prompt building, leading to an ever-growing PromptParams interface.
**Why it happens:** Programs have different context needs — one needs text paragraphs, another needs a previous definition, a third needs nothing.
**How to avoid:** Keep PromptParams generic: `{ term, contextText, language }`. Programs interpret `contextText` as they see fit. If a program doesn't need contextText, it ignores it.
**Warning signs:** PromptParams has program-specific optional fields.

### Pitfall 4: Forgetting the Print Payload Shape
**What goes wrong:** Different programs produce different output shapes, but PrintPayloadSchema is hardcoded in `shared/types.ts` and validated by the printer bridge via Zod.
**Why it happens:** The new program produces a result that doesn't include `term` or `citations` (e.g., a free association just has raw text).
**How to avoid:** Add a `template` discriminator field to PrintPayload. The bridge validates the base shape, and the POS server handles template-specific rendering. Keep the Zod schema flexible enough for different templates (some fields optional).
**Warning signs:** Printer bridge rejects payloads from the new program with Zod validation errors.

### Pitfall 5: Config Fetch Race Condition
**What goes wrong:** The program ID is fetched from Supabase via `fetchConfig`, but the config response doesn't include the new `program` field, so the app falls back to default.
**Why it happens:** The backend API endpoint that serves config needs to be updated, or the DB migration hasn't run.
**How to avoid:** Add the `program` column with a DEFAULT value of 'aphorism' in the migration. Update `fetchConfig` and `ConfigResponseSchema` to include the field. Test with and without the field (backward compatibility).
**Warning signs:** App always loads aphorism regardless of config setting.

## Code Examples

### Migration: Add program column to installation_config

```sql
-- 009_add_program_column.sql
ALTER TABLE installation_config
  ADD COLUMN program TEXT NOT NULL DEFAULT 'aphorism';
```

### Updated InstallationConfigSchema

```typescript
// packages/shared/src/types.ts (addition)
export const InstallationConfigSchema = z.object({
  id: z.string().uuid(),
  mode: ModeSchema,
  active_term: z.string().nullable(),
  active_text_id: z.string().nullable(),
  program: z.string().default('aphorism'),  // NEW
  updated_at: z.string().datetime({ offset: true }),
});
```

### Updated ConfigResponseSchema (api.ts)

```typescript
export const ConfigResponseSchema = z.object({
  mode: ModeSchema,
  term: z.string(),
  program: z.string().default('aphorism'),  // NEW
  // ... rest unchanged
});
```

### Second Program: free_association

```typescript
// packages/shared/src/programs/free-association.ts

import type { ConversationProgram, PromptParams } from './types.js';

export const freeAssociationProgram: ConversationProgram = {
  id: 'free_association',
  name: 'Free Association',
  description: 'No text, no predefined term. Open-ended exploration -> raw output.',

  stages: {
    textReading: false,  // No text to read
    termPrompt: false,   // No predefined term
    portrait: false,     // No portrait
    printing: true,      // Still print a card
  },

  buildSystemPrompt: (params: PromptParams): string => {
    return `You are an interviewer in an art installation called "MeinUngeheuer."

A visitor has just sat down in front of you. You know nothing about them.
No text was read. No topic was given.

Start with: "What is on your mind right now?"

Then follow wherever they go. Use the same Socratic moves as always:
MIRROR, EXAMPLE, CONTRAST, IMPLICATION, REVERSAL, META.

RULES: (same core rules as aphorism...)

When stopping, call save_definition with:
- term: Whatever emerged as the core of what they were exploring
- definition_text: Their sharpest formulation, compressed
- citations: 2-3 of their exact words
- language: "de" or "en"`;
  },

  buildFirstMessage: (params: PromptParams): string => {
    const isGerman = params.language.startsWith('de');
    return isGerman
      ? 'Was geht dir gerade durch den Kopf?'
      : 'What is on your mind right now?';
  },

  printLayout: 'dictionary',
  resultDisplay: 'definition',
  sessionMode: 'term_only',
};
```

### App.tsx Integration (Simplified)

```typescript
// In InstallationApp:
import { getProgram } from '@meinungeheuer/shared';

// After config fetch:
const program = getProgram(config.program ?? 'aphorism');

// Pass to useConversation:
const systemPrompt = program.buildSystemPrompt({ term, contextText, language });
const firstMessage = program.buildFirstMessage({ term, contextText, language });

// Portrait capture gated by program:
if (program.stages.portrait) {
  // ... existing portrait capture logic
}

// Print job includes template:
void persistPrintJob(result, state.sessionId, program.printLayout);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mode enum switches everywhere | Program interface with atoms | This phase | All mode-specific logic consolidated in program objects |
| Hardcoded prompt in systemPrompt.ts | Program.buildSystemPrompt() | This phase | New programs can define entirely different conversation styles |
| Single PrintPayload shape | Template-discriminated payloads | This phase | Different card layouts per program |
| Mode column only in config | Mode + program columns | This phase | Program selects behavior; mode records what type of session it was |

**Deprecated/outdated:**
- Direct mode-switching in `buildSystemPrompt(mode, ...)` — replaced by `program.buildSystemPrompt(params)`
- Direct mode-switching in `buildFirstMessage(mode, ...)` — replaced by `program.buildFirstMessage(params)`
- Mode-based branching in the state machine for text_display/term_prompt — replaced by `program.stages` booleans

## Open Questions

1. **How should installation_config store stage overrides?**
   - What we know: The `program` column selects a base program. But the user wants to toggle individual stages (e.g., aphorism without portrait).
   - What's unclear: Should stage overrides be a JSON column on installation_config, or should each toggle combination be a separate program?
   - Recommendation: Add a `stage_overrides` JSONB column to installation_config. Programs provide default stages, overrides merge on top. Keeps programs reusable while allowing per-installation customization.

2. **Should the program interface include text source selection?**
   - What we know: Text source is one of the 5 atoms. Currently `active_text_id` on installation_config selects the text.
   - What's unclear: Should the program interface include a `defaultTextId` or should text selection remain independent?
   - Recommendation: Keep text selection on installation_config (already works). Programs don't prescribe a specific text — they prescribe whether text is shown at all (via `stages.textReading`). Text content is orthogonal to program behavior.

3. **How to handle the existing Mode enum going forward?**
   - What we know: The `Mode` type ('text_term' | 'term_only' | 'chain') is used in DB sessions, the state machine, and prompts. Programs have a `sessionMode` field.
   - What's unclear: Should new programs invent new modes, or reuse existing ones?
   - Recommendation: Keep the existing Mode enum for DB records. Programs map to an existing mode via `sessionMode`. Don't add new modes for now — the 3 existing modes capture the meaningful distinctions (text context, term-only, chained context). New programs are behavioral variations within these modes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0+ |
| Config file | Inline in vite.config.ts (tablet); dedicated vitest.config.ts (karaoke-reader) |
| Quick run command | `pnpm --filter @meinungeheuer/tablet exec vitest run` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R9-01 | ConversationProgram interface exports correctly | unit | `pnpm --filter @meinungeheuer/shared exec vitest run src/programs/index.test.ts -x` | No — Wave 0 |
| R9-02 | Aphorism program produces identical prompts to current systemPrompt.ts | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Yes (6 tests) |
| R9-03 | Program registry returns correct program by ID | unit | `pnpm --filter @meinungeheuer/shared exec vitest run src/programs/index.test.ts -x` | No — Wave 0 |
| R9-04 | Program registry falls back to default for unknown ID | unit | `pnpm --filter @meinungeheuer/shared exec vitest run src/programs/index.test.ts -x` | No — Wave 0 |
| R9-05 | State machine transitions correctly with stages.textReading=false | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts -x` | Yes (15 tests) — needs extension |
| R9-06 | Second program (free_association) builds valid prompt and first message | unit | `pnpm --filter @meinungeheuer/shared exec vitest run src/programs/free-association.test.ts -x` | No — Wave 0 |
| R9-07 | PrintPayload accepts template field | unit | `pnpm --filter @meinungeheuer/shared exec vitest run src/programs/index.test.ts -x` | No — Wave 0 |
| R9-08 | Existing state machine tests still pass after refactor | regression | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts -x` | Yes (15 tests) |
| R9-09 | Existing systemPrompt tests still pass after refactor | regression | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | Yes (6 tests) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @meinungeheuer/shared exec vitest run && pnpm --filter @meinungeheuer/tablet exec vitest run`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green + both programs produce correct output

### Wave 0 Gaps
- [ ] `packages/shared/src/programs/index.test.ts` — covers R9-01, R9-03, R9-04
- [ ] `packages/shared/src/programs/free-association.test.ts` — covers R9-06
- [ ] Vitest config for shared package — currently shared has no test setup; needs `vitest.config.ts` or inline config in package.json
- [ ] Extend `useInstallationMachine.test.ts` with stage-config-aware transition tests — covers R9-05

## Sources

### Primary (HIGH confidence)
- Direct code analysis of all 15 source files in `apps/tablet/src/`, `packages/shared/src/`, `apps/printer-bridge/src/`, `apps/pos-server/`
- `CLAUDE.md` — project architecture, conventions, key tech decisions
- `CONTEXT.md` — user's locked decisions on modular atoms, testability, architecture direction
- `STATE.md` — key decision: programs as TypeScript code, not DB records; one ElevenLabs agent
- `REQUIREMENTS.md` — R9 specification
- Supabase migration `002_tables.sql` — current schema for installation_config
- POS server `config.yaml` — existing template system (dictionary, helvetica, acidic)
- POS server `templates.py` — existing print templates (receipt, dictionary_entry, message, label, markdown)
- POS server `print_server.py` — existing HTTP endpoints for each template

### Secondary (MEDIUM confidence)
- TypeScript discriminated union pattern for program types — well-established pattern, high confidence in approach
- Registry pattern (Record<string, T>) — standard TypeScript pattern, no external dependencies

### Tertiary (LOW confidence)
- None — this phase is entirely an internal refactoring with no new external dependencies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, pure refactoring of existing code
- Architecture: HIGH — based on deep analysis of all 15 current source files and their coupling points
- Pitfalls: HIGH — identified from concrete code analysis (e.g., systemPrompt.test.ts exists and must pass, PrintPayloadSchema validation in printer bridge)

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable — internal refactoring, no external API changes)
