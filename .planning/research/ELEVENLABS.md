# ElevenLabs Conversation Limits and Agent Behavior

**Researched:** 2026-03-08
**Overall confidence:** MEDIUM (mix of official docs, SDK source analysis, and community reports)
**SDK in use:** `@11labs/react@0.2.0` / `@11labs/client@0.2.0` (DEPRECATED)

---

## Executive Summary

The premature conversation ending problem has multiple possible causes: the `end_call` system tool (enabled by default on dashboard-created agents), the LLM itself deciding to end the conversation, the WebSocket inactivity timeout (default 20s, max 180s), and turn timeout settings. There is **no documented hard maximum conversation duration** on the ElevenLabs platform -- the 300-second limit mentioned in some search results applies to the Voice Changer feature, not Conversational AI agents.

The most actionable finding: the `@11labs/react` package is **deprecated** and should be migrated to `@elevenlabs/react@0.14.1` / `@elevenlabs/client@0.15.0`, which includes improved disconnect handling, close code exposure, and new features like VAD scores and audio alignment events.

---

## 1. Session Duration Limits

**Confidence: MEDIUM** (no single authoritative source confirms or denies a hard limit)

### What We Found

| Limit Type | Value | Applies To | Source |
|-----------|-------|------------|--------|
| **Hard max conversation duration** | **NOT DOCUMENTED** | Conversational AI agents | Official docs have no mention |
| Voice Changer max | 300 seconds (5 min) | Voice Changer only | [Help center](https://help.elevenlabs.io/hc/en-us/articles/23864324790289) |
| WebSocket inactivity timeout | 20s default, up to 180s | WebSocket connections | [Blog post](https://elevenlabs.io/blog/websocket-improvements-reliability-and-custom-timeout) |
| Turn timeout | 1-30 seconds | Silence before agent prompts | [Conversation flow docs](https://elevenlabs.io/docs/agents-platform/customization/conversation-flow) |

### Key Insight

There is NO documented hard maximum duration for Conversational AI sessions. The platform bills by the minute (10 cents/min on Creator/Pro, 8 cents/min on Business), which implies indefinite-length conversations are expected. Plans include fixed minute pools (250 min on Creator, up to 13,750 min on Business).

The "300 seconds" number that appears in some search results is consistently about Voice Changer, NOT Conversational AI agents. This is a critical distinction.

### What Likely Causes "Premature Ending"

1. **The `end_call` system tool** -- enabled by default on dashboard-created agents
2. **The LLM deciding the conversation is "done"** -- custom LLM receives end_call as a tool and may call it
3. **WebSocket inactivity timeout** (20s default) -- if no audio flows for 20s
4. **Turn timeout** -- if user is silent past the configured threshold
5. **Override configuration errors** -- if overrides are not enabled in dashboard, the server disconnects (confirmed in [GitHub issue #87](https://github.com/elevenlabs/packages/issues/87))

---

## 2. Agent End-Conversation Behavior

**Confidence: HIGH** (official docs + SDK source)

### The `end_call` System Tool

This is the primary mechanism by which an agent ends a conversation. Key facts:

- **Enabled by default** on agents created via the ElevenLabs dashboard
- **NOT enabled by default** on agents created via API -- must be added manually
- Lives in `prompt.built_in_tools` (not `prompt.tool_ids`)
- When the LLM calls `end_call`, the server closes the WebSocket, which triggers `onDisconnect` with `reason: "agent"`

**Parameters:**
- `reason` (string, required): Why the call is ending
- `message` (string, optional): Farewell message spoken before disconnect

**Configuration options:**
- Leave description blank: Uses default behavior (ends when conversation naturally concludes)
- Custom description: Define exactly when the tool should be triggered (e.g., "Only end the call when the user explicitly says goodbye")

### How It Interacts With Custom LLM (OpenRouter)

When using a custom LLM (as MeinUngeheuer does via OpenRouter), the `end_call` tool is passed to the LLM as a standard OpenAI-format function in the `tools` array of every chat completion request. The LLM decides when to call it based on:

1. The tool description (configurable in dashboard)
2. The system prompt instructions
3. The LLM's own judgment about conversation completion

**This means the LLM (Gemini Flash via OpenRouter) is making the decision to end the call.** The system prompt already says "NEVER stop just because you have had many exchanges" -- but if the `end_call` tool is available with a default description like "end when conversation naturally concludes," the LLM may call it anyway.

### Controlling End Behavior

**Option A: Remove the `end_call` tool entirely.**
If the agent was created in the dashboard, the end_call tool is added by default. You can remove it. Without end_call, the agent cannot terminate the conversation -- only the user (client) can via `endSession()`. This is the nuclear option.

**Option B: Customize the `end_call` tool description.**
Set the description to something very restrictive:
> "ONLY call this when the user explicitly says they want to stop, they say goodbye, or they have been completely silent for 60+ seconds despite multiple prompts. NEVER call this because you feel the conversation has reached a natural conclusion. The conversation continues as long as the visitor wants."

**Option C: Remove end_call and use `save_definition` as the termination signal.**
Since MeinUngeheuer already uses `save_definition` as a client tool, and the system prompt tells the agent when to call it, we can let `save_definition` be the ONLY way conversations end. When the client tool handler receives the definition, it calls `endSession()` from the client side. The agent never has the ability to end the call autonomously.

**Recommendation: Option C.** Remove `end_call` from the agent's system tools in the dashboard. The agent can only end the conversation by calling `save_definition`, and the frontend decides when to actually disconnect. This gives us full control.

---

## 3. SDK Disconnection Reasons

**Confidence: HIGH** (verified from SDK source code in node_modules)

### DisconnectionDetails Type (from `@11labs/client@0.2.0`)

```typescript
type DisconnectionDetails =
  | { reason: "error"; message: string; context: Event }
  | { reason: "agent"; context: CloseEvent }
  | { reason: "user" };
```

### DisconnectionDetails Type (from `@elevenlabs/types@0.6.0`, used by `@elevenlabs/client@0.15.0`)

```typescript
type DisconnectionDetails =
  | { reason: "error"; message: string; context: Event; closeCode?: number; closeReason?: string }
  | { reason: "agent"; context?: CloseEvent; closeCode?: number; closeReason?: string }
  | { reason: "user" };
```

The newer version adds `closeCode` and `closeReason` fields, which provide WebSocket close codes for better debugging.

### What Triggers Each Reason

| Reason | Trigger | What Happened |
|--------|---------|---------------|
| `"agent"` | Server closes the WebSocket | The agent (LLM) called `end_call`, or server-side logic terminated the session. This is the reason you see for premature endings. |
| `"user"` | Client calls `endSession()` | The frontend code explicitly ended the conversation. |
| `"error"` | WebSocket error event fires | Network failure, authentication error, override config error, WebSocket timeout, or server error. The `message` field has details. |

### Common Causes of `reason: "agent"` Disconnections

1. LLM called the `end_call` system tool
2. LLM called a webhook tool that ended the conversation
3. Server-side conversation limit reached (if configured)
4. Agent transfer completed (if using multi-agent workflows)

### Known Bug: Audio Cutoff on Agent Disconnect

[GitHub Issue #419](https://github.com/elevenlabs/packages/issues/419) (opened Dec 15, 2025, STILL OPEN): When the agent ends the conversation, the server initiates disconnection before the audio buffer has fully played. The last sentence gets cut off. This is a server-side timing issue -- the SDK receives the close event and stops playback immediately.

**Workaround:** None from ElevenLabs yet. For MeinUngeheuer, since we control when `save_definition` is called, we could add a small delay between receiving the definition and calling `endSession()` to allow the final audio to finish playing.

---

## 4. Knowledge Base / RAG

**Confidence: HIGH** (official docs)

### Overview

ElevenLabs agents support a Knowledge Base feature that provides RAG (Retrieval-Augmented Generation) during conversations.

### How It Works

1. Upload documents to the Knowledge Base (per workspace, reusable across agents)
2. Attach documents to an agent via `conversation_config.agent.prompt.knowledge_base`
3. During conversation, the agent automatically retrieves relevant chunks from the knowledge base to augment LLM responses

### Supported Document Types

| Type | Formats |
|------|---------|
| Files | PDF, TXT, DOCX, HTML, EPUB |
| URLs | Any web page (no auto-refresh yet) |
| Text | Direct text entry |

### Limits

- **Non-enterprise:** 20MB or 300K characters per document
- **Enterprise:** Expanded limits
- URL-based docs do NOT auto-update (feature coming soon)

### API Methods

```typescript
// Create from text
createFromText({ name, text })

// Create from file
createFromFile({ name, file })

// Create from URL
createFromUrl({ name, url })

// Attach to agent in conversation_config
agent.prompt.knowledge_base = [
  { type: "file", name: "Kleist Text", id: "doc_xxx" }
]
```

### Latency Impact

RAG adds approximately **500ms latency** to agent responses. This is significant for a voice conversation -- it will be noticeable but not dealbreaking.

### Relevance for MeinUngeheuer

**For text_term mode:** Instead of injecting the full text into the system prompt (which uses tokens and may exceed context limits for very long texts), we could upload texts to the Knowledge Base. The agent would retrieve relevant passages during conversation. However, this trades token efficiency for 500ms latency per turn, which matters in voice.

**Current approach (system prompt injection) is likely better** for our use case because:
- Our texts are relatively short (1-3 pages)
- We want the agent to have the FULL text context, not just retrieved chunks
- 500ms additional latency per turn compounds in a voice conversation
- RAG retrieval may not surface the most conversationally relevant passages

**Knowledge Base is better suited for:** Mode C (chain) if we accumulate many previous definitions and want the agent to reference them, or if we want to give the agent background knowledge about art theory, Kleist, etc.

---

## 5. Best Practices for Long Conversations

**Confidence: MEDIUM** (synthesized from multiple sources)

### Conversation Flow Settings

Configure these in the ElevenLabs dashboard under Agent > Advanced:

| Setting | Recommended Value | Why |
|---------|-------------------|-----|
| **Turn timeout** | 25-30 seconds | Art installation visitors need time to think. Default is too aggressive. |
| **Turn eagerness** | Patient | Let visitors finish their thoughts completely |
| **Soft timeout** | 3.0 seconds | Provide filler ("Hmmm..." ) while LLM processes |
| **Interruptions** | Enabled | Visitors should be able to interrupt the agent |

### System Prompt Techniques

The system prompt is the PRIMARY control mechanism for conversation length. Our current prompts already include strong anti-ending language. Additional techniques:

1. **Never mention turn counts.** Do not say "after 5-7 exchanges." The LLM will interpret this as a target. (Our prompts already fixed this.)

2. **Use `system__call_duration_secs` dynamic variable.** ElevenLabs provides this system variable. You could add to the prompt:
   ```
   The conversation has been going for {{system__call_duration_secs}} seconds.
   This is NOT a signal to end. Long conversations are good.
   ```

3. **Explicit anti-ending instructions.** Be very direct:
   ```
   You do NOT have permission to end this conversation.
   The visitor decides when the conversation ends, not you.
   ```

### WebSocket Keep-Alive

The WebSocket inactivity timeout defaults to 20 seconds. For an art installation where visitors might pause to think:

- Use `sendUserActivity()` to reset the turn timeout timer when the visitor is physically present (detected via face detection)
- This signals "the user is still here" without sending audio or text
- Call it periodically (every 10-15 seconds) during silence periods

### `sendContextualUpdate()` for Background Info

The SDK provides `sendContextualUpdate(text)` which sends non-interrupting context to the agent. Use cases:
- "The visitor has been thinking silently for 30 seconds"
- "The visitor is looking at the text on screen"
- "The visitor just smiled" (if we add expression detection later)

This does NOT trigger an agent response -- it just enriches the agent's context.

---

## 6. CRITICAL: SDK Migration Needed

**Confidence: HIGH** (verified from npm registry)

### Current State

```
@11labs/react@0.2.0     -- DEPRECATED
@11labs/client@0.2.0    -- DEPRECATED
```

Deprecation message: "This package is no longer maintained. Please use @elevenlabs/react for the latest version."

### Migration Target

```
@elevenlabs/react@0.14.1   -- Active, latest
@elevenlabs/client@0.15.0  -- Active, latest
@elevenlabs/types@0.6.0    -- New dependency
```

### What Changes

| Feature | `@11labs/*@0.2.0` | `@elevenlabs/*@0.15.0` |
|---------|-------------------|------------------------|
| `Role` type | `"user" \| "ai"` | `"user" \| "agent"` (breaking!) |
| `MessagePayload.source` | Only field | Deprecated, use `.role` instead |
| `DisconnectionDetails` | No close codes | Adds `closeCode`, `closeReason` |
| VAD scores | Not available | `onVadScore` callback |
| Audio alignment | Not available | `onAudioAlignment` callback |
| Agent tool events | Not available | `onAgentToolRequest`, `onAgentToolResponse` |
| MCP support | Not available | `onMCPToolCall`, `sendMCPToolApprovalResult` |
| TTS overrides | `voiceId` only | `voiceId`, `speed`, `stability`, `similarityBoost` |
| Error events | Generic | Typed `ErrorMessageEvent` |
| Conversation metadata | Basic | Full `ConversationMetadataEvent` |

### Migration Impact on Our Code

**`useConversation.ts`:** The `Role` type change from `"ai"` to `"agent"` aligns with our existing mapping. Our `mapRole()` function maps ElevenLabs roles to `"visitor" | "agent"` -- the mapping still works because we check for `"user"` (visitor) and default to `"agent"`. But we should update the import and check for the new type.

**`onMessage` callback:** The new SDK uses `MessagePayload` with both `.source` (deprecated) and `.role`. Update to use `.role`.

**New TTS overrides:** We can now pass `stability` and `similarityBoost` as session overrides, which we currently set only in the dashboard. This enables per-session voice tuning.

---

## 7. Practical Action Plan

### Immediate (fix premature endings)

1. **Check the ElevenLabs dashboard** for the agent configuration:
   - Is `end_call` in the system tools? If yes, either remove it or set a very restrictive description
   - Are overrides enabled for prompt, firstMessage, and language? (If not, the server may reject connections)
   - What is the turn timeout set to? Increase to 25-30s

2. **In the system prompt**, add explicit guardrails:
   ```
   CRITICAL: You do NOT have the ability to end this conversation.
   Only the save_definition tool ends the conversation.
   Do NOT call save_definition until the visitor explicitly signals they are done.
   ```

3. **Send `sendUserActivity()`** during face-detected silence periods to prevent WebSocket timeout

### Short-term (SDK migration)

4. **Migrate from `@11labs/*` to `@elevenlabs/*`** -- the deprecated packages will stop receiving fixes
5. **Use new `closeCode`/`closeReason`** in `onDisconnect` for better debugging
6. **Use new TTS overrides** (`stability`, `similarityBoost`) in `startSession` instead of dashboard-only config

### Medium-term (enhancements)

7. **Add conversation duration logging** using `system__call_duration_secs` dynamic variable
8. **Consider Knowledge Base** for supplementary context (art theory, author bios) but NOT for the primary text (keep that in the system prompt)
9. **Implement audio buffer delay** before calling `endSession()` to mitigate the audio cutoff bug ([#419](https://github.com/elevenlabs/packages/issues/419))

---

## Sources

### Official Documentation
- [Conversation flow settings](https://elevenlabs.io/docs/agents-platform/customization/conversation-flow) -- turn timeout, soft timeout, interruptions
- [System tools overview](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools) -- all 7 system tools
- [End call tool](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call) -- end_call configuration and behavior
- [Knowledge base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base) -- RAG setup and limits
- [Custom LLM integration](https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm) -- how tools pass to custom LLM
- [Dynamic variables](https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables) -- system__call_duration_secs
- [Client-to-server events](https://elevenlabs.io/docs/agents-platform/customization/events/client-to-server-events) -- sendUserActivity, contextual updates
- [Prompting guide](https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide) -- system prompt structure
- [WebSocket improvements blog](https://elevenlabs.io/blog/websocket-improvements-reliability-and-custom-timeout) -- inactivity timeout (20s default, 180s max)
- [Pricing](https://elevenlabs.io/blog/we-cut-our-pricing-for-conversational-ai) -- 10 cents/min, billed by minute

### GitHub Issues
- [#419: Audio cutoff before conversation ended](https://github.com/elevenlabs/packages/issues/419) -- open, server-side disconnect timing
- [#87: WebSocket keeps disconnecting](https://github.com/elevenlabs/packages/issues/87) -- closed, caused by disabled overrides

### SDK Source (verified in node_modules)
- `@11labs/client@0.2.0` -- BaseConversation.d.ts, BaseConnection.d.ts, events.d.ts
- `@elevenlabs/client@0.15.0` -- BaseConversation.d.ts, BaseConnection.d.ts, events.d.ts
- `@elevenlabs/types@0.6.0` -- types.d.ts (DisconnectionDetails, Callbacks, Role)

### npm Registry
- [@11labs/react](https://www.npmjs.com/package/@11labs/react) -- deprecated notice confirmed
- [@elevenlabs/react](https://www.npmjs.com/package/@elevenlabs/react) -- current version 0.14.1
