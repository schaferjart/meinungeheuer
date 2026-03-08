---
phase: 01-conversation-fix-sdk-migration
verified: 2026-03-08T16:17:37Z
status: human_needed
score: 8/9 must-haves verified
human_verification:
  - test: "Run a conversation for 10+ minutes without the bot ending it prematurely"
    expected: "Agent continues as long as visitor is engaged. Only save_definition call (visitor-initiated) ends the conversation."
    why_human: "Requires live ElevenLabs session to verify LLM behavior respects prompt guardrails at runtime"
  - test: "Verify end_call tool is removed from ElevenLabs dashboard"
    expected: "Agent configuration shows no end_call tool -- only save_definition"
    why_human: "Dashboard configuration is external to codebase, cannot verify programmatically"
  - test: "Verify disconnect close codes are logged when conversation ends"
    expected: "Console shows closeCode and closeReason for agent-initiated or error disconnects"
    why_human: "Requires live WebSocket session to trigger disconnect events"
---

# Phase 1: Conversation Fix + SDK Migration Verification Report

**Phase Goal:** Conversations no longer end prematurely. SDK is on maintained version.
**Verified:** 2026-03-08T16:17:37Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | useConversation imports come from @elevenlabs/react and @elevenlabs/client, not @11labs/* | VERIFIED | `useConversation.ts` lines 3-7: imports from `@elevenlabs/react`. Zero `@11labs` references in entire `apps/tablet/src/` (grep confirmed). |
| 2 | onMessage callback uses role field (not deprecated source field) | VERIFIED | `useConversation.ts` line 110: `({ message, role }: { message: string; role: ElevenLabsRole })`. No `source` field usage. |
| 3 | Disconnect handler logs closeCode and closeReason for agent and error disconnects | VERIFIED | `useConversation.ts` lines 121-139: Discriminated union on `details.reason` with `closeCode`/`closeReason` logging for `agent` and `error` cases. |
| 4 | sendUserActivity is exposed from useConversation hook and called every 15s during active conversation | VERIFIED | `useConversation.ts` line 61: in `UseConversationReturn` interface. Line 221: returned from hook. `App.tsx` lines 159, 204-216: destructured and used in 15s interval guarded by `screen === 'conversation'` and `conversationStatus === 'connected'`. |
| 5 | pnpm typecheck passes with zero errors | VERIFIED | `pnpm typecheck` runs cleanly across all 5 workspace projects (shared, karaoke-reader, backend, tablet, printer-bridge). |
| 6 | System prompt explicitly tells the agent it cannot end the conversation | VERIFIED | `systemPrompt.ts` lines 89-97 (buildTextTermPrompt) and lines 207-215 (buildTermPrompt): Both contain "CRITICAL CONSTRAINT" block with "You do NOT have the ability to end this conversation". Count = 2 occurrences confirmed. |
| 7 | System prompt states save_definition is the ONLY tool available | VERIFIED | `systemPrompt.ts` line 92 and line 210: "That is the ONLY tool you have" in both prompt variants. |
| 8 | mapRole correctly maps 'user' to 'visitor' and 'agent' to 'agent' | VERIFIED | `useConversation.ts` lines 68-70: exported `mapRole` function. `useConversation.test.ts`: 3 tests pass (user->visitor, agent->agent, ai->agent fallback). |
| 9 | Tests verify guardrail text is present in generated prompts | VERIFIED | `systemPrompt.test.ts`: 7 tests pass. Covers CRITICAL CONSTRAINT in all 3 modes, save_definition as ONLY tool, mode-specific content (context text, term, chain text). |

**Score:** 9/9 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/tablet/package.json` | @elevenlabs/react dependency, no @11labs/* | VERIFIED | Has `@elevenlabs/react: "0.14.1"` and `@elevenlabs/client: "^0.15.0"`. No `@11labs` entries. |
| `apps/tablet/src/hooks/useConversation.ts` | Migrated hook with new SDK, disconnect logging, sendUserActivity | VERIFIED | 223 lines. Exports `useConversation`, `TranscriptEntry`, `UseConversationReturn`, `mapRole`. Imports from `@elevenlabs/react`. Logs closeCode/closeReason. Returns `sendUserActivity`. |
| `apps/tablet/src/App.tsx` | Keep-alive integration calling sendUserActivity every 15s | VERIFIED | 310 lines. Line 159: destructures `sendUserActivity`. Lines 204-216: 15s interval useEffect with proper guard and cleanup. |
| `apps/tablet/src/lib/systemPrompt.ts` | System prompt with anti-ending guardrails | VERIFIED | 302 lines. CRITICAL CONSTRAINT block in both `buildTextTermPrompt` (line 89) and `buildTermPrompt` (line 207). |
| `apps/tablet/src/lib/systemPrompt.test.ts` | Unit tests for system prompt guardrails | VERIFIED | 47 lines (>20 min). 7 test cases covering all modes and guardrail text. All pass. |
| `apps/tablet/src/hooks/useConversation.test.ts` | Unit tests for mapRole function | VERIFIED | 18 lines (>15 min). 3 test cases. All pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useConversation.ts` | `@elevenlabs/react` | `import useConversation` | WIRED | Line 3: `from '@elevenlabs/react'` |
| `useConversation.ts` | `@elevenlabs/react` | `import Role type` | WIRED | Line 6: `type Role as ElevenLabsRole` imported from `@elevenlabs/react` (re-exported from client) |
| `App.tsx` | `useConversation.ts` | `sendUserActivity in keep-alive interval` | WIRED | Line 159: destructured. Lines 204-216: called in setInterval. |
| `systemPrompt.test.ts` | `systemPrompt.ts` | `import buildSystemPrompt` | WIRED | Line 2: `import { buildSystemPrompt } from './systemPrompt'` |
| `useConversation.test.ts` | `useConversation.ts` | `import mapRole` | WIRED | Line 2: `import { mapRole } from './useConversation'` |

**Note on key_links deviation:** Plan 01-01 specified import of `MessagePayload` from `@elevenlabs/client`. The executor discovered `MessagePayload` is not directly importable (only available in transitive `@elevenlabs/types`). Used inline type annotation `{ message: string; role: ElevenLabsRole }` instead. This is functionally equivalent and documented in the SUMMARY as an auto-fixed deviation. The import of `Role` comes from `@elevenlabs/react` (which re-exports it) rather than `@elevenlabs/client`. This is a minor import path difference, not a functional gap.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| R1 | 01-01, 01-02 | Fix Conversation Premature Ending | NEEDS HUMAN | Code-side: CRITICAL CONSTRAINT guardrails in both prompt variants. save_definition stated as only tool. sendUserActivity keep-alive prevents inactivity timeout. Dashboard-side: end_call removal documented as done in RESEARCH.md but needs human verification. UAT: 10+ minute conversation test needed. |
| R2 | 01-01, 01-02 | Migrate ElevenLabs SDK | SATISFIED | @elevenlabs/react@0.14.1 installed. No @11labs/* imports remain. Typecheck passes. Build succeeds. role field used (not deprecated source). Disconnect closeCode/closeReason logged. All 10 tests pass. |

No orphaned requirements -- ROADMAP maps exactly R1 and R2 to Phase 1, and both plans claim exactly R1 and R2.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO/FIXME/HACK/placeholder comments, no empty implementations, no stub returns found in any modified file. |

### Human Verification Required

### 1. End-to-end conversation duration test (R1 UAT)

**Test:** Start a Mode B (term_only) or Mode A (text_term) conversation via the tablet. Engage in natural dialogue for 10+ minutes. Do not signal you want to stop.
**Expected:** The agent continues the conversation without attempting to end it, wrap up, or say goodbye. Only calling save_definition (triggered by visitor signaling readiness) ends it.
**Why human:** Requires a live ElevenLabs WebSocket session. LLM behavior under prompt constraints cannot be verified statically.

### 2. ElevenLabs dashboard verification (R1 prerequisite)

**Test:** Log into the ElevenLabs dashboard. Navigate to the MeinUngeheuer agent configuration. Check the available tools.
**Expected:** Only `save_definition` is listed. No `end_call` tool is present.
**Why human:** Dashboard configuration is external to the codebase.

### 3. Disconnect close code logging (R2 UAT detail)

**Test:** Start a conversation, then disconnect by closing the tab or navigating away. Also: start a conversation and let the agent call save_definition.
**Expected:** Browser console shows `[MeinUngeheuer] User-initiated disconnect` or `[MeinUngeheuer] Agent-initiated disconnect. closeCode: <number> closeReason: <string>` depending on how the session ended.
**Why human:** Requires live WebSocket session to trigger disconnect events and inspect console output.

### Gaps Summary

No automated gaps found. All 9 observable truths verified. All artifacts exist, are substantive, and are properly wired. All key links confirmed. TypeScript compiles cleanly. All 10 unit tests pass. No anti-patterns detected.

The only items requiring attention are the three human verification tests above, all related to runtime behavior that cannot be verified statically:
- R1's core UAT (10+ minute conversation without premature ending) requires a live session
- R1's dashboard prerequisite (end_call removal) requires dashboard access
- R2's disconnect logging requires triggering actual WebSocket disconnects

R2 is fully satisfied from a code perspective. R1 is code-complete but its effectiveness depends on LLM behavior at runtime.

---

_Verified: 2026-03-08T16:17:37Z_
_Verifier: Claude (gsd-verifier)_
