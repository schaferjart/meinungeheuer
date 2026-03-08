# Architecture Patterns

**Domain:** Modular conversation programs for art installation
**Researched:** 2026-03-08

## Recommended Architecture

### High-Level: Program as Configuration Object

```
                    ConversationProgram
                    /        |        \
            Prompt       Output Tool    Print
            Builder      + Handler      Template
               |              |            |
        ElevenLabs      Client Tool    Printer
        Override        + Webhook      Bridge
```

A ConversationProgram is a plain TypeScript object (not a class) that bundles:
1. Functions for building prompts from runtime context
2. Tool handling configuration
3. Result display + print formatting references

Programs are resolved at runtime from a registry. The same ElevenLabs agent handles all programs via per-session overrides.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `packages/shared/src/programs/types.ts` | ConversationProgram interface | All consumers import this |
| `packages/shared/src/programs/registry.ts` | Program lookup by ID | Tablet app, backend |
| `packages/shared/src/programs/aphorism.ts` | First program (current behavior) | Registry |
| `apps/tablet/src/hooks/useConversation.ts` | Passes program's prompt + tools to ElevenLabs SDK | Programs, ElevenLabs SDK |
| `apps/tablet/src/App.tsx` | Component registry: maps program to result screen | Programs, screen components |
| `apps/backend/src/routes/webhook.ts` | Routes result by program_id to correct handling | Programs, Supabase |
| `apps/backend/src/routes/config.ts` | Returns active program_id to tablet | installation_config table |
| `apps/printer-bridge/src/printer.ts` | Routes print by template name | POS server |

### Data Flow

```
1. Admin sets active_program_id in installation_config (via admin dashboard)
2. Tablet fetches config: gets mode + program_id
3. Tablet resolves program from registry: getProgram(program_id)
4. Visitor goes through pre-conversation flow (mode-dependent, program-independent)
5. Conversation starts:
   a. program.buildSystemPrompt(mode, term, context) -> override prompt
   b. program.buildFirstMessage(mode, term, context, lang) -> override firstMessage
   c. program.clientTools -> merged with useConversation clientTools
   d. ElevenLabs session starts with overrides
6. Agent calls output tool (e.g., save_definition) per prompt instructions
   a. Client tool handler fires: tablet gets result immediately
   b. Webhook fires: backend persists + enqueues print
7. Tablet shows result via program's ResultComponent
8. Print queue entry includes template name from program
9. Printer bridge routes to correct POS endpoint
```

## Patterns to Follow

### Pattern 1: Strategy Pattern via Object Registry

**What:** Programs are plain objects implementing a common interface, stored in a Record and looked up by ID.

**When:** Always. This is the core pattern.

**Example:**

```typescript
// packages/shared/src/programs/types.ts
export interface ConversationProgram {
  id: string;
  name: string;
  description: string;
  buildSystemPrompt: (mode: Mode, term: string, contextText: string | null) => string;
  buildFirstMessage: (mode: Mode, term: string, contextText: string | null, language: string) => string;
  outputToolName: string;
  resultType: string;
  displayComponent: string;
  printTemplate: string;
}

// packages/shared/src/programs/registry.ts
import { aphorismProgram } from './aphorism.js';

const PROGRAMS: Record<string, ConversationProgram> = {
  aphorism: aphorismProgram,
};

export function getProgram(id: string): ConversationProgram {
  return PROGRAMS[id] ?? PROGRAMS['aphorism'];
}

export function getAllPrograms(): ConversationProgram[] {
  return Object.values(PROGRAMS);
}
```

### Pattern 2: Component Registry for Result Screens

**What:** Map program's `displayComponent` string to React components at the app level.

**When:** When rendering the result screen (currently `DefinitionScreen`).

**Example:**

```typescript
// apps/tablet/src/components/screens/results/index.ts
import { DefinitionScreen } from './DefinitionScreen';
// import { HaikuScreen } from './HaikuScreen';

export const RESULT_COMPONENTS: Record<string, React.ComponentType<ResultProps>> = {
  aphorism: DefinitionScreen,
  // haiku: HaikuScreen,
};

// apps/tablet/src/App.tsx
import { RESULT_COMPONENTS } from './components/screens/results';

// In renderScreen():
case 'definition': {
  const ResultComponent = RESULT_COMPONENTS[program.resultType] ?? DefinitionScreen;
  return <ResultComponent result={definition} />;
}
```

### Pattern 3: Prompt Composition (Mode Block + Program Block)

**What:** The system prompt is composed of two independent parts: a mode block (how the visitor entered) and a program block (what the conversation does).

**When:** Every conversation session.

**Example:**

```typescript
// In the aphorism program:
buildSystemPrompt(mode, term, contextText) {
  const modeBlock = buildModeBlock(mode, term, contextText);  // shared util
  return `You are an interviewer in an art installation.

${modeBlock}

${APHORISM_CONVERSATION_RULES}

${APHORISM_OUTPUT_INSTRUCTIONS}`;
}
```

The `buildModeBlock()` function is shared across all programs -- it describes the text/term/chain context. Each program adds its own conversation rules and output instructions.

### Pattern 4: Fallback-First Design

**What:** Every lookup has a sensible fallback. Unknown program ID -> aphorism. Unknown template -> dictionary. Unknown result type -> DefinitionScreen.

**When:** All registry lookups.

**Why:** Art installation must never crash. An operator might configure a program ID that doesn't exist in the tablet's build. The system must still work.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Dynamic State Machine

**What:** Making the state machine flow configurable per program.

**Why bad:** The 9 states map to the physical visitor experience. You always approach, optionally read, always talk, always see a result, always get a card. Changing the state graph per program creates untested code paths and breaks the simple reducer pattern.

**Instead:** Keep 9 states. Vary what CONTENT appears at each state. If a program doesn't need synthesizing, dispatch DEFINITION_READY with 0ms delay. If it doesn't need printing, dispatch PRINT_DONE immediately.

### Anti-Pattern 2: One Agent Per Program

**What:** Creating a separate ElevenLabs agent for each conversation program.

**Why bad:** Agent management is manual via the ElevenLabs dashboard. Each agent needs its own tool configuration, knowledge base, etc. Scaling to N programs means N agents to maintain.

**Instead:** One agent. All tool definitions on that agent. Per-session prompt overrides determine behavior.

### Anti-Pattern 3: Program Logic in the State Machine

**What:** Adding program-specific cases to the reducer.

**Why bad:** The reducer is program-agnostic. It knows about screen transitions, not about aphorisms vs haikus. Adding `if (program === 'haiku')` to the reducer breaks separation of concerns.

**Instead:** Program logic lives in the program definition and the components. The reducer only knows: conversation started, result received, print done.

### Anti-Pattern 4: Storing Prompts in the Database

**What:** Putting system prompts in Supabase so they can be edited at runtime.

**Why bad:** System prompts are complex multi-paragraph texts with embedded instructions for tool usage, conversation flow, edge cases. They need version control, code review, and testing. A textarea in the admin UI is not the right editing environment.

**Instead:** Prompts as TypeScript template literals in the program source files. Deploy to update.

## Scalability Considerations

| Concern | At 1 program | At 5 programs | At 20+ programs |
|---------|-------------|---------------|-----------------|
| Registry size | Trivial | Trivial | Still trivial -- programs are small objects |
| ElevenLabs tools | 1 tool (save_definition) | 1 tool (save_result) | 1 generic tool handles all |
| Result components | 1 screen component | 5 components, lazy loaded | Lazy load all, code split per program |
| Print templates | 1 POS endpoint | 5 POS endpoints | Consider template engine in POS server |
| Admin UI | Dropdown | Dropdown with descriptions | Searchable list, program preview |
| Prompt maintenance | 1 file | 5 files | Consider shared prompt snippets/mixins |
| Testing | 1 test suite | 5 suites | Each program has isolated prompt tests |

At the 20+ scale, the main pressure point is prompt maintenance. Consider extracting shared conversation rules (tone, voice constraints, edge cases) into reusable snippets that programs compose.

## Sources

- Strategy pattern: established software design pattern, applied to React component architecture
- [Martin Fowler: Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html)
- Codebase analysis: current architecture in apps/tablet/src/, apps/backend/src/
