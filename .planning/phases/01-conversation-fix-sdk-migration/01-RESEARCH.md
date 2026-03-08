# Phase 1: Conversation Fix + SDK Migration - Research

**Researched:** 2026-03-08
**Domain:** ElevenLabs SDK migration, conversation lifecycle, system prompt engineering
**Confidence:** HIGH

## Summary

The migration from `@11labs/react@0.2.0` to `@elevenlabs/react@0.14.1` is straightforward because the old package (`@11labs/react@0.2.0`) is literally a thin wrapper around `@elevenlabs/client@0.15.0` -- it already re-exports all types from the new client. The primary change is the import path and two type-level breaking changes: `Role` changed from `"user" | "ai"` to `"user" | "agent"`, and `onMessage` callback payload changed from `{ message, source }` to `{ message, source, role, event_id }` where `source` is deprecated in favor of `role`.

The conversation premature ending fix has two parts: (1) the `end_call` tool has already been removed from the ElevenLabs dashboard (done), and (2) system prompt guardrails need strengthening plus disconnect reason logging needs to be added for debugging. The new SDK's `DisconnectionDetails` type adds `closeCode` and `closeReason` fields that were not available in the old `@11labs/client@0.2.0` base type.

**Primary recommendation:** Replace `@11labs/react` and `@11labs/client` with `@elevenlabs/react@0.14.1` in package.json. Update the single import in `useConversation.ts`. Fix the two type-level breaking changes. Add disconnect reason logging with close codes. Strengthen system prompt anti-ending guardrails.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R1 | Fix Conversation Premature Ending -- Remove `end_call` tool, ensure only `save_definition` can end conversations | `end_call` already removed (done). Research identifies remaining causes: WebSocket inactivity timeout (20s default), turn timeout, LLM judgment. Mitigations: `sendUserActivity()` keep-alive, system prompt hardening, disconnect logging. |
| R2 | Migrate ElevenLabs SDK -- Update from deprecated `@11labs/react@0.2.0` to `@elevenlabs/react@0.14.1`, fix types, log disconnect close codes | Full migration path documented with exact type changes: `Role` type change, `onMessage` payload change, `DisconnectionDetails` enhanced fields. Migration is low-risk because old package already wraps new client internally. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@elevenlabs/react` | `0.14.1` | React hook for ElevenLabs Conversational AI | Active replacement for deprecated `@11labs/react`. Provides `useConversation` hook. |
| `@elevenlabs/client` | `0.15.0` | Core ElevenLabs conversation client | Transitive dependency of `@elevenlabs/react`. Contains `Conversation`, types, connection logic. |
| `@elevenlabs/types` | `0.6.0` | Shared type definitions | Transitive dependency. Contains `Role`, `DisconnectionDetails`, `Callbacks`, `MessagePayload`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^3.0.5` | Test framework | Already in project. Use for unit testing role mapping, system prompt generation. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@elevenlabs/react` hook | `@elevenlabs/client` `Conversation.startSession()` directly | Direct client gives more control but loses React lifecycle management. Hook is correct for React app. |

**Installation:**
```bash
pnpm --filter @meinungeheuer/tablet remove @11labs/react @11labs/client
pnpm --filter @meinungeheuer/tablet add @elevenlabs/react@0.14.1
```

Note: `@elevenlabs/client@0.15.0` is already installed as a dependency in `apps/tablet/package.json`. After adding `@elevenlabs/react`, the old `@11labs/*` packages can be removed.

## Architecture Patterns

### Recommended Project Structure
```
apps/tablet/src/
  hooks/
    useConversation.ts       # Wrapper around @elevenlabs/react useConversation
  lib/
    systemPrompt.ts          # System prompt builder (already exists)
    firstMessage.ts          # First message builder (already exists)
```

No new files needed. This phase modifies existing files only.

### Pattern 1: SDK Hook Wrapper
**What:** Wrap the SDK's `useConversation` in a project-specific hook that handles role mapping, transcript management, and client tool registration.
**When to use:** Always -- the existing `useConversation.ts` already does this correctly.
**Current code (needs update):**
```typescript
// OLD: from @11labs/react
import {
  useConversation as useElevenLabsConversation,
  type Status,
  type DisconnectionDetails,
  type Role as ElevenLabsRole,
} from '@11labs/react';

// NEW: from @elevenlabs/react
import {
  useConversation as useElevenLabsConversation,
  type Status,
  type DisconnectionDetails,
} from '@elevenlabs/react';
import type { Role as ElevenLabsRole, MessagePayload } from '@elevenlabs/client';
```

### Pattern 2: onMessage Callback Update
**What:** The `onMessage` callback signature changed between old and new SDK.
**When to use:** In `useConversation.ts` onMessage handler.

Old SDK (`@11labs/client@0.2.0`):
```typescript
// Callbacks.onMessage type:
onMessage: (props: { message: string; source: Role }) => void;
// where Role = "user" | "ai"
```

New SDK (`@elevenlabs/types@0.6.0`):
```typescript
// Callbacks.onMessage type:
onMessage?: (props: MessagePayload) => void;
// where MessagePayload = {
//   message: string;
//   event_id?: number;
//   source: "user" | "ai";  // DEPRECATED
//   role: Role;              // NEW: "user" | "agent"
// }
```

**Migration:**
```typescript
// OLD
onMessage: ({ message, source }: { message: string; source: ElevenLabsRole }) => {
  setTranscript((prev) => [
    ...prev,
    { role: mapRole(source), content: message, timestamp: Date.now() },
  ]);
},

// NEW
onMessage: ({ message, role }: MessagePayload) => {
  setTranscript((prev) => [
    ...prev,
    { role: mapRole(role), content: message, timestamp: Date.now() },
  ]);
},
```

### Pattern 3: Role Mapping Update
**What:** The `Role` type changed from `"user" | "ai"` to `"user" | "agent"`.
**Impact:** The existing `mapRole` function maps `"user"` to `"visitor"` and defaults to `"agent"` for everything else. This works correctly with both old and new types. However, it should be updated for clarity:

```typescript
// OLD
function mapRole(elevenLabsRole: ElevenLabsRole): TranscriptEntry['role'] {
  return elevenLabsRole === 'user' ? 'visitor' : 'agent';
}

// NEW (clearer, same behavior)
function mapRole(elevenLabsRole: ElevenLabsRole): TranscriptEntry['role'] {
  return elevenLabsRole === 'user' ? 'visitor' : 'agent';
}
// No functional change needed -- the default branch already maps "ai" and "agent" to "agent"
```

### Pattern 4: Disconnect Reason Logging with Close Codes
**What:** The new `DisconnectionDetails` type adds `closeCode` and `closeReason` fields.
**When to use:** In `onDisconnect` callback.

```typescript
onDisconnect: (details: DisconnectionDetails) => {
  // Log full details including new close code fields
  if (details.reason === 'agent') {
    console.warn(
      '[MeinUngeheuer] Agent-initiated disconnect',
      'closeCode:', details.closeCode,
      'closeReason:', details.closeReason,
    );
  } else if (details.reason === 'error') {
    console.error(
      '[MeinUngeheuer] Error disconnect:',
      details.message,
      'closeCode:', details.closeCode,
      'closeReason:', details.closeReason,
    );
  } else {
    console.log('[MeinUngeheuer] User-initiated disconnect');
  }
  onConversationEndRef.current?.(details.reason);
},
```

### Pattern 5: sendUserActivity Keep-Alive
**What:** The SDK exposes `sendUserActivity()` which resets the WebSocket inactivity timer without sending audio.
**When to use:** During silence periods when face detection confirms the visitor is still present.

```typescript
// In the component that manages conversation + face detection:
// Call sendUserActivity() every 15 seconds while face is detected
// and conversation is active, to prevent the 20s WebSocket timeout.
useEffect(() => {
  if (screen !== 'conversation' || conversationStatus !== 'connected') return;
  const interval = setInterval(() => {
    conversation.sendUserActivity();
  }, 15_000);
  return () => clearInterval(interval);
}, [screen, conversationStatus, conversation]);
```

### Anti-Patterns to Avoid
- **Importing from `@11labs/*`:** These packages are deprecated. Always import from `@elevenlabs/*`.
- **Using `source` instead of `role` in onMessage:** The `source` field is deprecated. Use `role` from `MessagePayload`.
- **Hardcoding connection type:** The SDK defaults to `"websocket"`. Do not set `connectionType: "webrtc"` unless specifically needed -- WebSocket is correct for this use case.
- **Adding `end_call` back:** Never re-add the `end_call` system tool. It was the root cause of premature endings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket keep-alive | Custom ping/pong mechanism | `sendUserActivity()` from SDK | SDK already handles the protocol; custom pings would conflict |
| Conversation timeout detection | Timer-based disconnect detector | `onDisconnect` with `closeCode` analysis | SDK reports exact reasons; guessing from timers is unreliable |
| Audio playback management | Custom audio buffer manager | SDK's built-in audio pipeline | SDK handles audio concat, interruption, and playback natively |
| Role type mapping | Custom string union type | Import `Role` from `@elevenlabs/client` | SDK's type is the source of truth |

**Key insight:** The ElevenLabs SDK handles the entire voice pipeline. Our code should only wrap the SDK hook, map roles to our domain types, register client tools, and handle disconnection. Everything else is SDK territory.

## Common Pitfalls

### Pitfall 1: Type Mismatch Between Old and New Role
**What goes wrong:** Importing `Role` from `@11labs/client` gives `"user" | "ai"` but the new SDK returns `"agent"` instead of `"ai"` in the `onMessage` callback's `role` field.
**Why it happens:** The old `@11labs/client@0.2.0` defines `Role = "user" | "ai"`. The new `@elevenlabs/types@0.6.0` defines `Role = "user" | "agent"`. Since `@11labs/react@0.2.0` actually wraps `@elevenlabs/client@0.15.0` internally, the RUNTIME value is already `"agent"` even in the old package -- but the old TYPE still says `"ai"`.
**How to avoid:** After migration, import `Role` from `@elevenlabs/react` or `@elevenlabs/client`. Do NOT import from `@11labs/*`.
**Warning signs:** TypeScript errors about `"ai"` not being assignable, or runtime `role === "ai"` checks that never match.

### Pitfall 2: onMessage Source vs Role
**What goes wrong:** Using the deprecated `source` property instead of the new `role` property.
**Why it happens:** Old code destructures `{ message, source }` from onMessage callback. New `MessagePayload` still has `source` for backwards compatibility but it uses the old `"user" | "ai"` values.
**How to avoid:** Destructure `{ message, role }` instead. The `role` field uses the current `"user" | "agent"` type.
**Warning signs:** Code that checks for `source === "ai"` -- this still works at runtime but is deprecated.

### Pitfall 3: WebSocket Inactivity Timeout (20s default)
**What goes wrong:** Conversation drops during silence periods (visitor thinking).
**Why it happens:** ElevenLabs WebSocket has a 20-second inactivity timeout by default. In an art installation, visitors may pause for 20+ seconds to think.
**How to avoid:** Call `sendUserActivity()` periodically (every 15s) while the visitor's face is detected. This resets the inactivity timer.
**Warning signs:** Conversations dropping with `reason: "error"` after silence periods.

### Pitfall 4: Override Configuration Not Enabled
**What goes wrong:** WebSocket connection is immediately rejected by the server.
**Why it happens:** If overrides (prompt, firstMessage, language) are not enabled in the ElevenLabs dashboard for the agent, the server rejects connections that send override parameters. See [GitHub issue #87](https://github.com/elevenlabs/packages/issues/87).
**How to avoid:** Verify in the ElevenLabs dashboard that overrides are enabled for the agent. The current setup already uses overrides (system prompt, first message, language).
**Warning signs:** `onDisconnect` fires immediately after `startSession` with `reason: "error"`.

### Pitfall 5: Audio Cutoff on Agent-Initiated End
**What goes wrong:** Agent's final words get cut off when conversation ends.
**Why it happens:** Known bug [#419](https://github.com/elevenlabs/packages/issues/419). When the server initiates disconnect, the SDK stops audio playback immediately.
**How to avoid:** Since we control `save_definition` as a client tool and removed `end_call`, the agent cannot end the call. We call `endSession()` from the client after receiving the definition. Add a small delay (1-2s) before calling `endSession()` to allow the final audio buffer to finish playing.
**Warning signs:** The agent's farewell message getting cut off mid-sentence.

### Pitfall 6: HookCallbacks Subset
**What goes wrong:** Passing callbacks like `onVadScore` or `onAgentToolRequest` to the hook but they are silently ignored.
**Why it happens:** The `@elevenlabs/react` `useConversation` hook only forwards a subset of `Callbacks` defined as `HookCallbacks`. In `@11labs/react@0.2.0`, `HookCallbacks` includes: `onConnect`, `onDisconnect`, `onError`, `onMessage`, `onAudio`, `onDebug`, `onUnhandledClientToolCall`. In `@elevenlabs/react@0.14.1`, it adds `onModeChange`, `onStatusChange`, `onCanSendFeedbackChange`, `onVadScore` -- but NOT all callbacks.
**How to avoid:** Check the `HookCallbacks` type before assuming a callback will work. For advanced callbacks not in `HookCallbacks`, use the raw `Conversation` class from `@elevenlabs/client` instead.
**Warning signs:** Callbacks that compile but never fire.

## Code Examples

### Complete Migration: useConversation.ts

The following shows the exact changes needed in `apps/tablet/src/hooks/useConversation.ts`:

```typescript
// === IMPORT CHANGES ===

// REMOVE:
import {
  useConversation as useElevenLabsConversation,
  type Status,
  type DisconnectionDetails,
  type Role as ElevenLabsRole,
} from '@11labs/react';

// ADD:
import {
  useConversation as useElevenLabsConversation,
  type Status,
  type DisconnectionDetails,
} from '@elevenlabs/react';
import type { Role as ElevenLabsRole, MessagePayload } from '@elevenlabs/client';

// === onMessage CALLBACK CHANGE ===

// REMOVE:
onMessage: ({ message, source }: { message: string; source: ElevenLabsRole }) => {
  setTranscript((prev) => [
    ...prev,
    { role: mapRole(source), content: message, timestamp: Date.now() },
  ]);
},

// ADD:
onMessage: ({ message, role }: MessagePayload) => {
  setTranscript((prev) => [
    ...prev,
    { role: mapRole(role), content: message, timestamp: Date.now() },
  ]);
},

// === onDisconnect ENHANCED LOGGING ===

// REMOVE:
onDisconnect: (details: DisconnectionDetails) => {
  console.log('[MeinUngeheuer] Disconnected, reason:', details.reason);
  onConversationEndRef.current?.(details.reason);
},

// ADD:
onDisconnect: (details: DisconnectionDetails) => {
  if (details.reason === 'agent') {
    console.warn(
      '[MeinUngeheuer] Agent-initiated disconnect.',
      'closeCode:', details.closeCode,
      'closeReason:', details.closeReason,
    );
  } else if (details.reason === 'error') {
    console.error(
      '[MeinUngeheuer] Error disconnect:',
      details.message,
      'closeCode:', details.closeCode,
      'closeReason:', details.closeReason,
    );
  } else {
    console.log('[MeinUngeheuer] User-initiated disconnect');
  }
  onConversationEndRef.current?.(details.reason);
},
```

### System Prompt Anti-Ending Guardrails

Add to both `buildTextTermPrompt` and `buildTermPrompt` in `systemPrompt.ts`:

```typescript
// Add this block to the RULES section of both prompt variants:
`
CRITICAL CONSTRAINT:
You do NOT have the ability to end this conversation.
The ONLY way this conversation ends is when the visitor signals they are done.
When they signal readiness, call save_definition. That is the ONLY tool you have.
Do NOT preemptively decide the conversation is "done" or "complete."
If the visitor is still talking, you keep going.
If you have been talking for a long time, that is GOOD. Long conversations are the goal.
`
```

### sendUserActivity Keep-Alive Integration

In `App.tsx`, add keep-alive during active conversation:

```typescript
// Add to the conversation management section in InstallationApp
const conversationRef = useRef(/* the conversation object */);

useEffect(() => {
  if (screen !== 'conversation' || conversationStatus !== 'connected') return;

  const interval = setInterval(() => {
    // Signal to the server that the user is still present,
    // preventing the 20s WebSocket inactivity timeout
    try {
      // sendUserActivity is exposed by the useConversation hook return
      // We need to expose it from our useConversation wrapper
    } catch {
      // Ignore errors -- connection may be closing
    }
  }, 15_000);

  return () => clearInterval(interval);
}, [screen, conversationStatus]);
```

Note: To use `sendUserActivity()`, our `useConversation` wrapper must expose it from the underlying SDK hook. Currently, our wrapper only returns `status`, `isSpeaking`, `transcript`, `conversationId`, `startConversation`, `endConversation`. We need to add `sendUserActivity` to the return.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@11labs/react` package | `@elevenlabs/react` package | 2025 (exact date unknown) | Old package deprecated, no longer receives fixes |
| `Role = "user" \| "ai"` | `Role = "user" \| "agent"` | `@elevenlabs/types@0.6.0` | Breaking type change, runtime values also changed |
| `onMessage({ source })` | `onMessage({ role })` | `@elevenlabs/types@0.6.0` | `source` is deprecated, use `role` instead |
| `DisconnectionDetails` without close codes | `DisconnectionDetails` with `closeCode`, `closeReason` | `@elevenlabs/types@0.6.0` | Better debugging of disconnection causes |
| `end_call` system tool for agent-initiated endings | Agent has no end_call; only client tools like `save_definition` | Project decision | Prevents premature conversation endings |

**Deprecated/outdated:**
- `@11labs/react`: Deprecated. Migration target is `@elevenlabs/react`.
- `@11labs/client`: Deprecated. Migration target is `@elevenlabs/client`.
- `MessagePayload.source`: Deprecated in favor of `MessagePayload.role`.

## Open Questions

1. **sendUserActivity interval timing**
   - What we know: WebSocket inactivity timeout is 20s by default (configurable up to 180s in dashboard). `sendUserActivity()` resets it.
   - What's unclear: Whether the dashboard's inactivity timeout is already set higher than 20s for this agent. The exact behavior when `sendUserActivity` is called -- does it also reset the turn timeout?
   - Recommendation: Set interval to 15s as a safe margin below 20s. Verify dashboard settings during implementation.

2. **Whether overrides are enabled in dashboard**
   - What we know: The code already sends overrides (prompt, firstMessage, language) and conversations work, so overrides are likely enabled.
   - What's unclear: Whether all override categories are enabled (prompt, firstMessage, language, tts).
   - Recommendation: Verify during implementation. If TTS overrides are enabled, we can pass `stability` and `similarityBoost` in session config instead of relying on dashboard-only settings.

3. **Audio cutoff mitigation timing**
   - What we know: There's a known bug (#419) where agent-initiated disconnects cut off audio. We control disconnect timing since `end_call` is removed.
   - What's unclear: The exact delay needed between receiving `save_definition` result and calling `endSession()`. The current code calls `endSession()` when the screen transitions away from 'conversation'.
   - Recommendation: The current approach (end session when screen leaves conversation) already provides a natural delay. Monitor whether audio cutoff occurs in practice.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 |
| Config file | Inherited from root (no tablet-specific vitest config) |
| Quick run command | `pnpm --filter @meinungeheuer/tablet exec vitest run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1 | System prompt includes anti-ending guardrails | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts -x` | No -- Wave 0 |
| R1 | Disconnect handler logs close codes | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useConversation.test.ts -x` | No -- Wave 0 |
| R2 | Role mapping handles new "agent" role | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useConversation.test.ts -x` | No -- Wave 0 |
| R2 | onMessage uses role not source | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useConversation.test.ts -x` | No -- Wave 0 |
| R1 | 10+ minute conversation without bot ending | manual-only | N/A -- requires live ElevenLabs connection | N/A |
| R2 | Conversation starts and ends cleanly with new SDK | manual-only | N/A -- requires live ElevenLabs connection | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @meinungeheuer/tablet exec vitest run`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green + manual conversation test

### Wave 0 Gaps
- [ ] `apps/tablet/src/lib/systemPrompt.test.ts` -- covers R1 (verify anti-ending guardrails in prompt text)
- [ ] `apps/tablet/src/hooks/useConversation.test.ts` -- covers R1+R2 (role mapping, but mocking the SDK hook is complex; may need to test `mapRole` as a pure function export)

Note: Testing `useConversation.ts` as a React hook requires mocking `@elevenlabs/react`'s `useConversation`. The highest-value testable units are:
1. `mapRole()` -- pure function, easy to test
2. `buildSystemPrompt()` -- pure function, already exists, test that guardrails are present
3. `buildFirstMessage()` -- pure function, already exists

The integration behavior (SDK connecting, audio, transcription) requires a live ElevenLabs connection and is manual-only.

## Sources

### Primary (HIGH confidence)
- `@11labs/client@0.2.0` source code in `node_modules` -- BaseConversation.d.ts: `Role = "user" | "ai"`, `Callbacks.onMessage: { message, source }`
- `@elevenlabs/client@0.15.0` source code in `node_modules` -- BaseConversation.d.ts, BaseConnection.d.ts
- `@elevenlabs/types@0.6.0` source code in `node_modules` -- types.d.ts: `Role = "user" | "agent"`, `MessagePayload.role`, `DisconnectionDetails` with closeCode/closeReason
- `@11labs/react@0.2.0` source code in `node_modules` -- re-exports from `@elevenlabs/client`, `HookCallbacks` subset
- `@elevenlabs/react@0.14.1` README via GitHub raw -- full useConversation API documentation
- npm registry -- `@elevenlabs/react@0.14.1` confirmed current, depends on `@elevenlabs/client@0.15.0`

### Secondary (MEDIUM confidence)
- [ElevenLabs system tools docs](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call) -- end_call behavior
- [ElevenLabs conversation flow docs](https://elevenlabs.io/docs/agents-platform/customization/conversation-flow) -- turn timeout, inactivity settings
- [GitHub Issue #419](https://github.com/elevenlabs/packages/issues/419) -- audio cutoff on agent disconnect (open)
- [GitHub Issue #87](https://github.com/elevenlabs/packages/issues/87) -- override configuration errors (closed)
- `.planning/research/ELEVENLABS.md` -- prior research verified against SDK source

### Tertiary (LOW confidence)
- WebSocket inactivity timeout 20s default -- referenced in ElevenLabs blog post, not verified against current dashboard defaults for this specific agent

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified directly from node_modules source code and npm registry
- Architecture: HIGH -- existing codebase examined, migration path is import-level change
- Pitfalls: HIGH -- type differences verified from actual .d.ts files, disconnect behavior from SDK source
- System prompt: MEDIUM -- guardrail language is best-practice, effectiveness requires live testing

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- SDK versions are specific, types are frozen)
