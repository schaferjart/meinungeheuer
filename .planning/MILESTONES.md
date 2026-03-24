# Milestones

## v2.0 End-to-End Autonomous Installation (Shipped: 2026-03-24)

**Phases completed:** 6 phases, 10 plans, 19 tasks

**Key accomplishments:**

- Migrated from deprecated @11labs/react to @elevenlabs/react@0.14.1 with disconnect close code logging and 15s WebSocket keep-alive to prevent conversation drops
- CRITICAL CONSTRAINT anti-ending guardrails in both system prompts, with 10 unit tests verifying guardrails and SDK role mapping across all modes
- PWA standalone detection with conditional fullscreen, viewport-fit=cover for iOS status bar, and audio unlock utility for autonomous kiosk operation
- POS-thermal-printer Flask server cloned into apps/pos-server/ with pnpm scripts, /health and /print/dictionary endpoints verified working in dummy mode
- RLS policy for anon print_queue INSERT, persistPrintJob wired in tablet save_definition flow, 8 unit tests covering printer-bridge field mapping (term->word, definition_text->definition), retry logic, and config defaults
- Canvas-based portrait frame capture from shared camera stream with fire-and-forget FormData POST to POS server /portrait/capture endpoint
- Paragraph-numbered text injection with QUOTE move citation format and TEXT ENGAGEMENT minimum for text_term mode
- ConversationProgram interface with registry pattern, aphorism program (text_term extraction), free_association program, and schema updates for program-driven installation behavior
- Stage-config-driven state machine replacing mode strings, program-based prompt building in useConversation, and template-aware print persistence wired through App.tsx
- Three surgical gap-closure fixes wiring program field through backend config, template through printer-bridge, and stages.printing through state machine

---
