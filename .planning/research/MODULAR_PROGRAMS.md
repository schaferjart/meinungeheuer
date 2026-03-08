# Research: Modular Conversation Program Architecture

**Domain:** Pluggable conversation programs for art installation
**Researched:** 2026-03-08
**Overall confidence:** HIGH (based on codebase analysis + ElevenLabs SDK type inspection)

---

## Executive Summary

The existing MeinUngeheuer codebase already has the skeleton of a program system -- it just doesn't know it yet. The current `buildSystemPrompt()` and `buildFirstMessage()` functions switch behavior based on `Mode` (text_term, term_only, chain). The current `save_definition` tool is hardcoded everywhere. The print pipeline expects a fixed `PrintPayload` shape. Making this pluggable requires extracting these scattered mode-switches into a single `ConversationProgram` interface, then letting the installation config point at a program ID instead of (or in addition to) a mode.

The critical constraint is the ElevenLabs SDK. Per-session overrides support **system prompt, first message, language, voice, and TTS settings** -- but NOT tool definitions. Tools (both webhook and client-side) are configured at the **agent level** in the ElevenLabs dashboard or via `clientTools` in the SDK hook initialization. This means: all programs must share the same set of tool definitions on the ElevenLabs agent, but can invoke different ones via prompt instructions. Client tools are defined once in `useConversation` hook initialization and are available for all programs -- the system prompt simply tells the agent which tool to call and with what shape.

This is workable. The recommended architecture is: **one ElevenLabs agent, all tool definitions registered on it, programs differentiated entirely through prompt overrides + client-side tool routing.**

---

## 1. The ConversationProgram Interface

### What a "Program" Is

A program is a self-contained conversation recipe. It bundles everything that varies between conversation types:

```typescript
interface ConversationProgram {
  // Identity
  id: string;                    // e.g., "aphorism", "haiku", "debate", "word-portrait"
  name: string;                  // Human-readable label for admin UI
  description: string;           // What this program does (admin tooltip)

  // Conversation behavior
  systemPrompt: PromptBuilder;   // Function that builds prompt from context
  firstMessage: FirstMessageBuilder;
  conversationRules: {
    maxTurns?: number;           // Optional hard limit
    minTurns?: number;           // Don't allow early termination before N
    autoEnd?: boolean;           // Does the program end itself or wait for visitor?
  };

  // Tool configuration
  outputTool: ToolDefinition;    // What tool the agent calls when done
  clientTools?: Record<string, ClientToolHandler>;  // Additional client tools

  // Output
  resultType: string;            // "definition" | "haiku" | "portrait" | etc.
  displayComponent: string;      // Which React component shows the result
  printTemplate: PrintTemplate;  // How to format for thermal printer

  // Post-conversation flow
  postConversationScreens: StateName[];  // Which screens follow conversation end
}
```

### Why This Shape

Each field addresses a concrete concern discovered in the codebase:

- **systemPrompt/firstMessage**: Currently hardcoded in `lib/systemPrompt.ts` and `lib/firstMessage.ts`. These are the primary differentiators -- the existing code already parameterizes them, just not extensibly.

- **outputTool**: Currently `save_definition` everywhere. A "haiku" program would call `save_haiku` with different parameters. A "word portrait" program might call `save_portrait`. The tool name and parameter schema must vary.

- **displayComponent**: Currently `DefinitionScreen` is hardcoded in the switch statement in `App.tsx`. A haiku program would show a `HaikuScreen`. Rather than adding more cases, map program ID to component.

- **printTemplate**: Currently the printer bridge always calls `/print/dictionary` with the `PrintPayload` shape. A haiku would need a different layout.

- **postConversationScreens**: Currently fixed: `synthesizing -> definition -> printing -> farewell`. Some programs might skip synthesizing, or add a "reflection" screen.

---

## 2. ElevenLabs Agent Configuration Per Program

### Confirmed: What Can Be Overridden Per Session

Verified by reading the **actual installed SDK types** (`@11labs/client@0.2.0` and `@elevenlabs/client@0.15.0`), the `BaseSessionConfig.overrides` object supports:

```typescript
overrides?: {
  agent?: {
    prompt?: { prompt?: string };     // System prompt -- YES, fully overridable
    firstMessage?: string;             // First agent message -- YES
    language?: Language;               // Language code -- YES
  };
  tts?: {
    voiceId?: string;                  // Voice -- YES
    speed?: number;                    // TTS speed -- YES (v0.15+)
    stability?: number;                // Stability -- YES (v0.15+)
    similarityBoost?: number;          // Similarity boost -- YES (v0.15+)
  };
  conversation?: {
    textOnly?: boolean;                // Text-only mode -- YES
  };
};
```

**Confidence: HIGH** -- verified from installed `node_modules` type definitions.

### Confirmed: What CANNOT Be Overridden Per Session

- **Tool definitions** (webhook tools): Configured at the agent level in the ElevenLabs dashboard. Cannot be swapped per session.
- **Tool schemas** (parameter definitions): Same -- agent-level only.
- **LLM model**: Configured at agent level (though `customLlmExtraBody` can pass extra params).

### The Consequence: Shared Tool Strategy

All programs share one ElevenLabs agent with all tool definitions registered. The system prompt tells the agent which tool to call:

**Option A (recommended): One generic tool, program-specific instructions.**

Register a single `save_result` tool on the ElevenLabs agent with a flexible schema:

```
tool: save_result
parameters:
  - program_id: string (which program produced this)
  - result_type: string (e.g., "aphorism", "haiku", "portrait")
  - primary_text: string (the main output)
  - term: string (concept label, optional for some programs)
  - citations: string[] (quotes from visitor, optional)
  - metadata: object (program-specific extras)
  - language: string
```

The system prompt says: "When done, call save_result with result_type='aphorism'" or "...with result_type='haiku'".

**Why this over multiple tools:** The ElevenLabs dashboard tool configuration is manual. Adding a new program shouldn't require dashboard changes. With a generic tool, new programs only need new prompt text + client-side handling.

**Option B (simpler, current): Keep `save_definition` as-is, overload its fields.**

The current `save_definition` tool has `term`, `definition_text`, `citations`, `language`. A haiku program could put the haiku in `definition_text` and ignore `term`. This is ugly but zero-change on the ElevenLabs side.

**Recommendation: Start with Option B, migrate to Option A when adding the second program.** The first new program will reveal whether the current tool schema is genuinely limiting or just aesthetically unpleasant.

### Client Tools Per Program

Client tools ARE configurable per session -- they are set in the `useConversation` hook options. The current code already defines `save_definition` as a client tool:

```typescript
clientTools: {
  save_definition: (parameters) => { ... }
}
```

A program system can pass different `clientTools` per program. The `useConversation` hook would accept the program's `clientTools` config and merge or replace.

**Important subtlety:** Client tools and webhook tools are independent. A tool can be both (dashboard webhook + client handler). The client tool fires immediately for UI responsiveness; the webhook fires for backend persistence. Both can coexist for the same tool name.

---

## 3. Print Template System

### Current State

The printer bridge is a thin relay: it receives a `PrintPayload` from the Supabase `print_queue` and POSTs it to an external POS server at `/print/dictionary`. The POS server handles ESC/POS formatting.

The `PrintPayload` schema is:
```typescript
{
  term: string;
  definition_text: string;
  citations: string[];
  language: string;
  session_number: number;
  chain_ref: string | null;
  timestamp: string;
}
```

### Recommended Approach: Extend PrintPayload, Route by Template

**Step 1: Add `template` field to print_queue payload.**

```typescript
interface PrintPayload {
  template: string;              // "dictionary" | "haiku" | "portrait" | etc.
  data: Record<string, unknown>; // Template-specific data
  session_number: number;
  language: string;
  timestamp: string;
}
```

**Step 2: Printer bridge routes to correct POS endpoint.**

```typescript
const endpoint = `/print/${payload.template}`;  // /print/dictionary, /print/haiku
await fetch(`${posServerUrl}${endpoint}`, { body: JSON.stringify(payload.data) });
```

**Step 3: POS server adds endpoints per template.**

Each template is a function that builds ESC/POS commands from the data payload. Template definitions live on the POS server side (they deal with physical formatting -- column widths, fonts, paper cuts).

**Alternative considered: Client-side template rendering (XML/JSON template engine).**

Libraries like `xml-escpos-helper` allow defining templates as XML with placeholders. This would let the printer bridge interpret templates without the POS server knowing about each format. However, this adds complexity to the bridge, which is currently intentionally thin. The POS server (which is external and already handles ESC/POS formatting) is the right place for layout logic.

**Recommendation:** Keep the bridge thin. Add the `template` field to the payload schema. Each new program provides a template name, and the POS server gets a corresponding endpoint. The fallback is always the `dictionary` template.

---

## 4. State Machine Implications

### Current Screen Flow

```
sleep -> welcome -> text_display -> term_prompt -> conversation ->
synthesizing -> definition -> printing -> farewell
```

The state machine already has mode-based branching:
- text_term: skips `term_prompt`, goes straight from `text_display` to `conversation`
- term_only: skips `text_display`, goes from `welcome` to `term_prompt`
- chain: shows `text_display` then `term_prompt`

### Problem: The Post-Conversation Flow is Fixed

After `conversation`, it always goes: `synthesizing -> definition -> printing -> farewell`. A different program might:
- Skip `synthesizing` (result is immediate)
- Show a different result screen (not `DefinitionScreen`)
- Skip printing entirely
- Add an extra "reflection" screen before farewell

### Recommended Approach: Minimal State Machine Changes

Do NOT make the state machine fully dynamic. The installation has a fixed physical flow (visitor approaches, reads, talks, gets a card, leaves). What varies is:

1. **Which screens appear between conversation end and farewell**
2. **Which component renders for each screen**

**Strategy: Keep the state machine as-is, add a "result" screen alias.**

The `definition` screen state already serves as "show the result". Rather than adding new states, make the `definition` state generic -- it shows whatever the program produced. The component selection happens in `App.tsx`:

```typescript
// Instead of:
case 'definition':
  return <DefinitionScreen definition={definition} />;

// Do:
case 'definition':
  return program.ResultComponent({ result: definition });
```

Where `program.ResultComponent` is resolved from the active program config.

**For programs that skip synthesizing:** Use a duration of 0 or dispatch `DEFINITION_READY` immediately.

**For programs that skip printing:** Have the farewell transition trigger directly from the result screen instead of going through `printing`.

**Key insight:** The state machine's 9 states map to physical phases of the visitor experience, not to program logic. Keep them. What changes is the CONTENT shown in each phase, not the phases themselves.

### Component Registry Pattern

```typescript
// programs/registry.ts
const RESULT_COMPONENTS: Record<string, React.ComponentType<ResultProps>> = {
  aphorism: DefinitionScreen,    // Current behavior
  haiku: HaikuScreen,
  portrait: PortraitScreen,
};

// App.tsx
const ResultComponent = RESULT_COMPONENTS[program.resultType] ?? DefinitionScreen;
```

This keeps the state machine untouched while allowing programs to customize the visual output.

---

## 5. Program Storage and Selection

### Where Programs Live

Programs should be **code, not database records**. Reasons:

1. System prompts are complex prose that benefits from version control
2. Tool definitions are TypeScript functions that need type safety
3. Print templates are tightly coupled to POS server endpoints
4. Programs change rarely; they're authored, not user-generated

```
packages/shared/src/programs/
  index.ts                    // Program registry, getProgramById()
  types.ts                    // ConversationProgram interface
  aphorism.ts                 // Current "definition extraction" program
  haiku.ts                    // Example: compress to haiku
  debate.ts                   // Example: Socratic debate format
```

### How Programs Are Selected

The `installation_config` table gets a new column: `active_program_id: string`.

```sql
ALTER TABLE installation_config ADD COLUMN active_program_id TEXT DEFAULT 'aphorism';
```

The admin dashboard gets a program selector dropdown. The tablet fetches the program ID from the config endpoint and loads the program definition from the registry.

### Relationship Between Mode and Program

Mode (text_term, term_only, chain) and program are **orthogonal concerns**:

- **Mode** = how the visitor enters the conversation (read text first? see a term? continue a chain?)
- **Program** = what the conversation does and produces (extract an aphorism? write a haiku? Socratic debate?)

Any program can work with any mode. The mode determines the pre-conversation flow and the context available. The program determines the conversation behavior and output.

```
Mode: text_term + Program: aphorism  = Read text, discuss, get an aphorism
Mode: text_term + Program: haiku     = Read text, discuss, get a haiku
Mode: term_only + Program: aphorism  = See term, discuss, get an aphorism
Mode: term_only + Program: debate    = See term, have a structured debate
```

The `buildSystemPrompt()` function combines both: the mode block (text context, chain context, or term-only intro) + the program's conversation instructions + the program's output instructions.

---

## 6. Backend Webhook Handling

### Current: Hardcoded to `save_definition`

The webhook at `POST /webhook/definition` expects a specific payload shape and always inserts into the `definitions` table.

### Recommended: Generic Result Webhook

```
POST /webhook/result
{
  tool_call_id: string,
  tool_name: "save_result",
  parameters: {
    program_id: string,
    result_type: string,
    primary_text: string,
    term?: string,
    citations?: string[],
    metadata?: object,
    language: string
  },
  conversation_id: string
}
```

**But for now**: Keep the existing `/webhook/definition` endpoint working. Add a new `/webhook/result` endpoint that handles the generic case. The old endpoint becomes a special case of the new one.

The database can either:
- Keep the `definitions` table and widen it (add `program_id`, `result_type`, make `term` nullable)
- Create a generic `results` table alongside `definitions`

**Recommendation:** Widen the `definitions` table. Renaming it to `results` is cleaner but breaks existing queries, admin dashboard, etc. Add the columns, keep backward compatibility.

---

## 7. Testing Programs Independently

### CLI Test Mode

Each program should be testable without the full tablet UI:

```bash
# Test a program's prompt generation
pnpm --filter @meinungeheuer/shared exec tsx src/programs/haiku.ts --test

# Test with mock context
pnpm test:program haiku --context "Some text context" --language de
```

### Dev Shortcuts in Tablet

The admin page (`?admin=true`) already exists. Add:
- Program selector dropdown
- "Jump to conversation" button (skips sleep/welcome/reading)
- "Mock result" button (tests post-conversation flow with fake data)

### Isolated Prompt Testing

Since the most critical part of each program is its system prompt, provide a way to test the prompt with a real LLM without going through ElevenLabs:

```typescript
// scripts/test-prompt.ts
// Loads a program, builds its prompt, sends to OpenRouter directly
// Shows the conversation in the terminal (text mode)
```

This bypasses ElevenLabs entirely for prompt iteration, which is much faster for development.

---

## 8. Concrete Implementation Plan

### Phase 1: Extract Program Interface (low risk, high value)

1. Define `ConversationProgram` type in `packages/shared/src/programs/types.ts`
2. Extract current behavior into `aphorism` program (`packages/shared/src/programs/aphorism.ts`)
3. Move `buildSystemPrompt()` and `buildFirstMessage()` into the program definition
4. `useConversation` accepts a program object instead of building prompt internally
5. No behavior change -- just reorganization

**Gate:** All existing tests pass. Manual test confirms text_term mode still works.

### Phase 2: Program Registry + Config (low risk)

1. Add `active_program_id` to `installation_config`
2. Build program registry with `getProgram(id)` lookup
3. Config endpoint returns `program_id`
4. Tablet loads program from registry
5. Admin dashboard shows program selector

**Gate:** Can switch between "aphorism" (only program) in admin UI.

### Phase 3: Generic Result Handling (medium risk)

1. Add `template` and `program_id` to `PrintPayload`
2. Widen `definitions` table (or create parallel `results` table)
3. Backend handles generic result webhook
4. Printer bridge routes by template
5. Component registry in App.tsx

**Gate:** Aphorism program works through the full pipeline with new generic handling.

### Phase 4: Second Program (proves the architecture)

1. Implement a second program (e.g., haiku, debate, word-portrait)
2. New prompt, new result display component, new print template
3. Switchable via admin dashboard
4. Full end-to-end test

**Gate:** Two programs work, switchable at runtime via admin.

---

## 9. Example: Haiku Program

To make the architecture concrete, here is what a haiku program would look like:

```typescript
const haikuProgram: ConversationProgram = {
  id: 'haiku',
  name: 'Haiku',
  description: 'Conversation distilled into a haiku (5-7-5)',

  systemPrompt: (mode, term, context) => `
    You are a poet-interviewer in an art installation.
    ${buildModeBlock(mode, term, context)}

    Your goal: through conversation, find the visitor's core feeling
    about the topic. Then compress it into a haiku (5-7-5 syllable structure).

    [... conversation rules ...]

    When ready, call save_definition with:
    - term: the topic word
    - definition_text: the haiku (3 lines, 5-7-5)
    - citations: key phrases the visitor used
    - language: de or en
  `,

  firstMessage: (mode, term, context, lang) =>
    lang === 'de'
      ? 'Lass uns zusammen ein Haiku finden. Was bewegt dich?'
      : "Let's find a haiku together. What moves you?",

  conversationRules: { autoEnd: false },

  outputTool: {
    name: 'save_definition',  // Reuse existing tool
    // Prompt instructs specific format
  },

  resultType: 'haiku',
  displayComponent: 'HaikuScreen',

  printTemplate: {
    name: 'haiku',
    // POS server formats: centered, large font, 3 lines, thin divider
  },

  postConversationScreens: ['synthesizing', 'definition', 'printing', 'farewell'],
};
```

Note: this reuses `save_definition` with haiku text in the `definition_text` field. No ElevenLabs dashboard changes needed.

---

## 10. Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One agent or multiple? | **One agent** | Overrides handle prompt/message/language/voice. No need for separate agents. |
| Tool definition strategy | **Reuse save_definition, overload via prompt** | Dashboard changes are manual/slow. Prompt can instruct any output format. Migrate to generic save_result later if needed. |
| Program storage | **Code (TypeScript), not database** | Version control, type safety, complex prompt text |
| State machine changes | **Minimal -- component swap, not state swap** | States map to physical visitor phases. Vary content, not flow. |
| Print templates | **Route by template name to POS server endpoints** | Keep bridge thin, layout logic lives on POS server |
| Mode vs Program | **Orthogonal** | Mode = how you enter. Program = what happens. |
| Result storage | **Widen definitions table** | Backward compatible, less migration risk |

---

## Sources

- ElevenLabs SDK types: `/node_modules/@11labs/client@0.2.0` and `@elevenlabs/client@0.15.0` -- BaseSessionConfig.overrides (verified from installed types)
- [ElevenLabs Overrides Documentation](https://elevenlabs.io/docs/agents-platform/customization/personalization/overrides)
- [ElevenLabs Client Tools Documentation](https://elevenlabs.io/docs/agents-platform/customization/tools/client-tools)
- [ElevenLabs Server Tools Documentation](https://elevenlabs.io/docs/agents-platform/customization/tools/server-tools)
- [ElevenLabs React SDK](https://elevenlabs.io/docs/agents-platform/libraries/react)
- Codebase analysis: `apps/tablet/src/lib/systemPrompt.ts`, `apps/tablet/src/hooks/useConversation.ts`, `apps/tablet/src/hooks/useInstallationMachine.ts`, `apps/backend/src/routes/webhook.ts`, `apps/printer-bridge/src/printer.ts`

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| ElevenLabs override capabilities | HIGH | Verified from actual SDK type definitions in node_modules |
| ElevenLabs tool limitation (no per-session tool override) | HIGH | Not present in SDK types; confirmed by documentation |
| Program interface design | HIGH | Directly derived from codebase analysis of existing switch points |
| State machine approach | HIGH | Verified by reading the reducer -- minimal changes needed |
| Print template routing | MEDIUM | POS server is external; assumes it can accept new endpoints |
| Generic tool strategy (save_result) | MEDIUM | ElevenLabs agent dashboard config not verified (no access) |
| Mode/program orthogonality | HIGH | Verified from code -- mode controls flow, prompt controls behavior |

---

## Open Questions

1. **POS server endpoint flexibility:** Is the POS server (external to this repo) configurable enough to add new print template endpoints? This needs verification with the actual POS server setup.

2. **ElevenLabs agent dashboard configuration:** Adding/modifying tool definitions requires dashboard access. How many tools can one agent have? Is there a practical limit?

3. **Program hot-reload:** If programs are TypeScript code, changing them requires a rebuild. Is runtime program loading (e.g., from Supabase) ever needed? For an art installation with an operator, probably not -- rebuild and deploy is fine.

4. **Voice per program:** The SDK supports per-session voice override. Should different programs use different voices? (e.g., a poet voice for haiku, a philosopher voice for debate). This is an artistic decision, not a technical one.

5. **customLlmExtraBody:** The SDK exposes this field for passing extra data to the custom LLM. Could be useful for program-specific LLM config (temperature, model selection per program). Needs testing with the OpenRouter custom LLM setup.
