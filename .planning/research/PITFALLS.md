# Domain Pitfalls

**Domain:** Modular conversation programs for art installation
**Researched:** 2026-03-08

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Tool Definitions Are Agent-Level, Not Session-Level

**What goes wrong:** You design programs that each define their own ElevenLabs tool (save_haiku, save_portrait, etc.), then discover at implementation time that tool definitions cannot be overridden per session.

**Why it happens:** The ElevenLabs documentation mentions "overrides" broadly, but the SDK's `BaseSessionConfig.overrides` type only includes `agent.prompt`, `agent.firstMessage`, `agent.language`, `tts.*`, and `conversation.textOnly`. No tool override field exists.

**Consequences:** You either need one agent per program (management nightmare) or must redesign the tool strategy entirely.

**Prevention:** Use a single shared tool (save_definition or save_result) across all programs. The system prompt instructs the agent what to put in each field. Client-side tool routing handles the UI response.

**Detection:** Read the SDK type definitions before designing the tool strategy. The types are the source of truth, not the marketing docs.

### Pitfall 2: Premature Abstraction Without a Second Program

**What goes wrong:** You build an elaborate program framework, generic result pipeline, template engine, dynamic component loader -- then the second program doesn't fit the abstractions. Rewrite.

**Why it happens:** Designing for flexibility without concrete use cases produces over-general abstractions that miss important details.

**Consequences:** Wasted effort. The abstraction layer becomes more complex than the programs it serves.

**Prevention:** Build the interface by EXTRACTING from the current working code (aphorism program), not by designing in advance. Only generalize when the second program reveals what actually varies. Start with the simplest possible interface.

**Detection:** If your interface has more than 10 fields before you have a second program, you're over-abstracting. The first version should have ~6-8 fields.

### Pitfall 3: Breaking the Save Pipeline

**What goes wrong:** You refactor the save_definition webhook to be "generic" and break the existing working flow. The webhook, client tool handler, database insert, and print queue insert are tightly coupled, and changing one without updating all of them causes silent data loss.

**Why it happens:** The save pipeline spans 4 systems (ElevenLabs agent -> client tool -> webhook -> Supabase -> printer bridge). A change in the payload schema must propagate through all of them atomically.

**Consequences:** Definitions silently fail to save, print queue gets malformed payloads, cards come out wrong or don't print.

**Prevention:** Keep the existing save_definition pipeline working as-is until the generic version is fully tested. Add the generic path alongside, not replacing. Switch over only after end-to-end validation.

**Detection:** Test the full pipeline after any schema change: trigger save_definition from ElevenLabs -> verify client tool fires -> verify webhook receives correct payload -> verify Supabase insert -> verify print queue insert -> verify printer bridge processes it.

## Moderate Pitfalls

### Pitfall 4: Mode/Program Confusion in the System Prompt

**What goes wrong:** A program's system prompt hardcodes assumptions about the mode. For example, the haiku program assumes there's always a text to reference, but in term_only mode there's no text.

**Prevention:** The prompt builder takes mode as input and the shared `buildModeBlock()` function handles mode-specific context. Programs should never access mode-specific data directly -- they receive it through the mode block.

### Pitfall 5: State Machine Corruption from Program-Specific Timing

**What goes wrong:** A program dispatches DEFINITION_RECEIVED before the conversation screen is active (race condition), or dispatches multiple DEFINITION_RECEIVED events (the agent calls save_definition twice).

**Prevention:** The state machine already guards transitions with screen-state checks (`if (state.screen !== 'conversation') return state`). Keep these guards. Add idempotency: once a definition is received, ignore subsequent tool calls for the same session.

### Pitfall 6: Admin Dashboard Config Race

**What goes wrong:** Admin switches program while a visitor is mid-conversation. The tablet is using program A's prompt, but the backend is now configured for program B. The webhook processes the result with the wrong program's expectations.

**Prevention:** The program is determined at session start and stored with the session, not re-read from installation_config mid-conversation. The session row should include `program_id`. The webhook reads the program from the session, not from the config.

### Pitfall 7: Print Payload Schema Drift

**What goes wrong:** A program puts unexpected data in the print payload. The printer bridge's Zod validation rejects it. The card never prints.

**Prevention:** All print payloads go through PrintPayloadSchema validation. When widening the schema for new programs, use discriminated unions or optional fields so existing programs still pass validation. Test each new program's print output against the schema.

## Minor Pitfalls

### Pitfall 8: Component Registry Miss

**What goes wrong:** Program specifies `displayComponent: 'haiku'` but nobody registered a HaikuScreen in the component registry. The result screen shows nothing or crashes.

**Prevention:** The registry lookup always falls back to DefinitionScreen: `RESULT_COMPONENTS[program.resultType] ?? DefinitionScreen`. New programs work (albeit with a generic display) even before their custom component is built.

### Pitfall 9: Prompt Length Limits

**What goes wrong:** A complex program prompt + mode block + text context exceeds the LLM's context window. The conversation starts with truncated instructions and behaves erratically.

**Prevention:** Monitor prompt token counts. The text_term mode includes the full reading text in the prompt (Kleist text is ~2000 words). With a complex program prompt on top, this could be 3000+ tokens of system prompt. Gemini Flash has a large context window, but keep an eye on it.

### Pitfall 10: Voice Mismatch Across Programs

**What goes wrong:** A program overrides the voice to a different one, but the text reader (pre-conversation) still uses the default voice. The visitor hears one voice reading the text and a completely different voice in the conversation.

**Prevention:** If programs override voice, the text reader should also use the program's voice. Or: keep voice consistent across all phases and don't override per program.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Extract interface | Over-abstracting before second program | Start with exactly what aphorism needs, nothing more |
| Program registry | Circular dependency shared <-> tablet | Programs in shared/ depend only on shared types, not on React |
| Config endpoint | Breaking tablet startup | Add program_id as optional field, default to "aphorism" |
| Generic result | Breaking existing save pipeline | Run existing and new paths in parallel during transition |
| Component registry | Import bloat from lazy-loading all screens | Use React.lazy() for non-default result components |
| Second program | Prompt engineering iteration time | Build CLI prompt tester to bypass ElevenLabs |
| Print templates | POS server changes needed | Start by using dictionary template for all programs |

## Sources

- Codebase analysis: identified tight coupling in save pipeline across 4 systems
- ElevenLabs SDK type analysis: confirmed tool override limitation
- [ElevenLabs Overrides Documentation](https://elevenlabs.io/docs/agents-platform/customization/personalization/overrides)
