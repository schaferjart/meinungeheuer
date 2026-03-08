# Feature Landscape

**Domain:** Modular conversation programs for art installation
**Researched:** 2026-03-08

## Table Stakes

Features the program system must have. Missing = the architecture doesn't work.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| ConversationProgram type definition | Foundation for everything else | Low | TypeScript interface in shared package |
| Program registry with getProgram(id) | Tablet + backend need to resolve programs | Low | Simple Record lookup |
| Per-session prompt override | Programs MUST be able to set their own system prompt | Low | Already working in current code |
| Per-session first message override | Programs need custom opening lines | Low | Already working |
| Program selection via installation_config | Admin must be able to switch programs | Low | One new column + admin UI dropdown |
| Config endpoint returns program_id | Tablet needs to know which program is active | Low | Extend existing GET /api/config |
| Current behavior preserved as "aphorism" program | No regression; existing flow continues to work | Med | Extraction + refactoring |
| Client tool routing per program | Different programs may handle tool results differently | Med | Pass program's clientTools to useConversation |

## Differentiators

Features that make the system genuinely useful for adding new programs.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Component registry for result screens | New programs can show custom result UI without touching state machine | Low | Record<string, Component> lookup in App.tsx |
| Print template routing | Different programs produce differently formatted cards | Med | Requires POS server endpoint per template |
| Mode/program orthogonality | Any program works with any mode (text, term, chain) | Med | Prompt builder takes mode context as input |
| Generic save_result tool | Programs don't overload definition_text semantics | Med | ElevenLabs dashboard change + backend webhook |
| Per-program voice override | Different artistic voices for different conversation types | Low | Already supported by SDK overrides |
| Per-program TTS settings | Speed, stability, similarity can vary by program | Low | Supported in @elevenlabs/client@0.15.0 |
| Dev mode: jump-to-conversation | Test programs without sitting through reading phase | Low | Admin UI button, dispatch SET_CONFIG + WAKE + skip to conversation |
| CLI prompt tester | Iterate on prompts without full ElevenLabs round-trip | Med | Script that calls OpenRouter directly with built prompt |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Dynamic state machine per program | Physical visitor flow doesn't change; over-engineering | Component swap within fixed states |
| Runtime program loading from database | Programs are authored by developer, not by operator | TypeScript code with version control |
| Multiple ElevenLabs agents | Dashboard management nightmare; one agent handles everything | Per-session prompt overrides |
| Program-specific database tables | Fragmentation; harder to query across programs | Widen existing definitions table |
| Hot-reload programs without rebuild | Art installation, not a SaaS platform | Rebuild + deploy (Coolify handles this) |
| Program editor in admin UI | Prompts are too complex for a textarea; need version control | Edit in code, deploy |
| Automatic program switching | Operator should control which program runs | Manual selection via admin dashboard |

## Feature Dependencies

```
ConversationProgram type -> Program registry -> Config endpoint returns program_id
                        -> Current behavior extracted as "aphorism" program

Program registry -> Component registry for result screens
                -> Client tool routing per program
                -> Admin UI program selector

Component registry -> Print template routing (needs template field in payload)
                   -> Generic save_result tool (optional, can defer)

Mode/program orthogonality -> Mode block builder shared across programs
```

## MVP Recommendation

Prioritize:
1. ConversationProgram type + aphorism extraction (proves the interface without new behavior)
2. Program registry + config endpoint (enables switching, even with one program)
3. Component registry for result screens (needed before second program)
4. Second program implementation (proves everything works)

Defer:
- Generic save_result tool: Not needed until save_definition field overloading becomes painful
- CLI prompt tester: Nice-to-have, can test prompts via ElevenLabs text mode
- Per-program voice/TTS: Artistic decision, can add when programs exist
- Print template routing: Can use dictionary template for all programs initially

## Sources

- Codebase analysis: existing switch points in systemPrompt.ts, firstMessage.ts, App.tsx
- [ElevenLabs SDK override types](https://elevenlabs.io/docs/agents-platform/customization/personalization/overrides)
