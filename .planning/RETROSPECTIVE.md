# Retrospective

## Milestone: v2.0 — End-to-End Autonomous Installation

**Shipped:** 2026-03-24
**Phases:** 6 | **Plans:** 10 | **Tasks:** 19

### What Was Built
- ElevenLabs SDK migration with anti-ending guardrails and keep-alive
- PWA kiosk with face-triggered wake/sleep
- Full thermal print pipeline (tablet → Supabase → bridge → POS server)
- Portrait capture from shared camera stream
- Paragraph-numbered text with citation format improvements
- Pluggable program architecture (aphorism + free_association)
- Complete integration wiring across all services

### What Worked
- **Parallel phase execution** — Phases 1 and 3 ran concurrently, cutting calendar time
- **GSD workflow** — Research → plan → execute → verify loop caught integration gaps before they became bugs (Phase 6 closed 3 gaps found by audit)
- **Specialized subagents** — Frontend, printer, ElevenLabs, and Supabase agents worked in their domains without stepping on each other
- **Stage-driven state machine** — Abstracting modes into stage booleans made program switching trivial
- **Integration checker** — Caught all 3 R9 wiring gaps that manual review missed

### What Was Inefficient
- **Phases 02/03 skipped formal VERIFICATION.md** — accepted as "verified by integration checker" but created audit noise
- **Portrait capture required shared videoRef architecture** — iOS Safari single-stream constraint wasn't discovered until implementation, causing App.tsx restructuring
- **POS server template field ignored** — Known from the start but deferred; will block future print layouts

### Patterns Established
- CRITICAL CONSTRAINT block placement in system prompts (after RULES, before conversation content)
- Programs as TypeScript interfaces with registry pattern (not DB records)
- Fire-and-forget persistence with silent error swallowing (check Supabase directly when debugging)
- Callback ref pattern for bridging React 18 RefObject typing with shared refs

### Key Lessons
- **iOS Safari constraints dominate tablet architecture** — camera streams, fullscreen, audio autoplay all need special handling
- **Integration gaps hide in the seams** — config→tablet→printer chain had 3 missing field forwards that unit tests couldn't catch
- **System prompt engineering is fragile** — any descriptive text WILL be quoted by the AI to visitors; write imperatives only
- **RLS blocks are truly silent** — multiple debugging sessions traced to missing Supabase policies with zero error output

### Cost Observations
- Model mix: Opus for ElevenLabs integration (complex reasoning), Sonnet for everything else, Haiku for codebase mapping
- 10 plans executed in ~120 min total automated time
- Most plans completed in 3-8 minutes; PWA (45min) and portrait (39min) were outliers due to iOS Safari complexity

---

## Cross-Milestone Trends

| Metric | v2.0 |
|--------|------|
| Phases | 6 |
| Plans | 10 |
| Tasks | 19 |
| Avg plan duration | ~12 min |
| Tests at completion | 207+ |
| Integration gaps found by audit | 3 |
| Integration gaps at ship | 0 |
