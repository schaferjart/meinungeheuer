# MeinUngeheuer — Technical Concerns & Debt

**Last Updated:** March 2026
**Scope:** Full monorepo analysis (tablet, backend, printer-bridge, shared)

---

## Technical Debt

### 1. Type Safety Workarounds with ElevenLabs SDK

**File(s):** `apps/tablet/src/hooks/useConversation.ts` (lines 100–164)

**Issue:** The ElevenLabs React SDK (`@11labs/react`) has type mismatches between exported types and actual runtime behavior.

- `useElevenLabsConversation` callback parameters do not strictly match documented types.
- `MessagePayload`, `Role`, `DisconnectionDetails` types have minor incompatibilities.
- No `@ts-ignore` needed currently, but the integration relies on duck typing and assumes SDK stability.

**Risk:** SDK version bumps or API shifts could silently break the conversation flow without type warnings.

**Mitigation:**
- Maintain manual test suite for conversation start/end/tool-call flows.
- Pin `@11labs/react` to a known-good version in `pnpm-lock.yaml`.
- Consider wrapping the SDK hook in a thin validation layer that post-validates callback shapes.

---

### 2. Blob/Uint8Array Incompatibility in TTS Audio Assembly

**File(s):** `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` (lines 229–243)

**Issue:** Browser's `Blob` constructor accepts `(BlobPart[] | string | Blob)[]` but TypeScript's type definitions are strict. The code passes `Uint8Array[]` directly.

```typescript
const blob = new Blob(binaryParts, { type: 'audio/mpeg' }); // binaryParts is Uint8Array[]
```

**Why it works:** JavaScript's Blob constructor is permissive at runtime; `Uint8Array` is a valid BlobPart.

**Risk:** Future TypeScript strictness or bundler changes could fail the build without code changes.

**Mitigation:**
- Cast explicitly: `const blob = new Blob(binaryParts as BlobPart[], ...)`
- Or wrap: `const blob = new Blob([...binaryParts], ...)`

---

### 3. Fire-and-Forget Async Operations Without Error Tracking

**Files affected:**
- `apps/backend/src/routes/webhook.ts` line 253: `void generateEmbedding(definitionId)`
- `apps/tablet/src/lib/ttsCache.ts` lines 47–77: `storeTtsCache()` fire-and-forget
- `apps/tablet/src/lib/persist.ts` lines 7–39: `persistDefinition()` fire-and-forget
- `apps/printer-bridge/src/index.ts` line 176: `processJob().catch()`

**Issue:** These async operations are intentionally not awaited to avoid blocking the UI or main thread. However, failures are only logged to console and not tracked in any metrics/observability system.

**Risk:**
- Silent failures: If embedding generation fails consistently, the system has no alerting mechanism.
- Printer jobs fail but webhook still returns 200 OK.
- TTS cache writes fail but the user doesn't know (they re-fetch from API).

**Current Handling:** Errors logged to console only. No retry logic, no dead-letter queue, no monitoring.

**Mitigation:**
- Add a simple error counter / last-error timestamp to Supabase for observability.
- Implement retry logic with exponential backoff for critical operations (embeddings, print jobs).
- Log to external service (Sentry, LogRocket, etc.) if available.

---

### 4. Insufficient Input Validation at API Boundaries

**Files affected:**
- `apps/backend/src/routes/webhook.ts` line 85: Receives `definition_text` with `.min(1)` only
- `apps/tablet/src/lib/api.ts`: Response validation is lenient (allows optional fields without defaults)
- `apps/backend/src/routes/session.ts`: May be missing validation for visitor input

**Issue:** Zod schemas validate shape but allow minimal/empty values that could degrade UX or cause downstream errors.

**Risk:**
- Empty definition text prints as blank card.
- Missing term on session causes undefined behavior downstream.
- Malformed chain_ref crashes printer layout engine.

**Mitigation:**
- Add stricter Zod rules: `.min(1).trim()` for text fields, disallow all-whitespace.
- Sanitize HTML/control chars if any user input reaches the printer.
- Add integration tests that verify round-trip with edge-case inputs.

---

### 5. Unstable Printer Reconnection Logic

**File(s):** `apps/printer-bridge/src/printer.ts`, `apps/printer-bridge/src/index.ts` (lines 32–42, 196–220)

**Issue:** Printer reconnection happens via `reconnect()` function with fixed retry count and delay.

- If the printer is temporarily unreachable (network hiccup), the bridge may give up after 3 attempts.
- Heartbeat runs every 30s, so a transient 2-minute outage may be missed.
- No exponential backoff; all retries happen at once.

**Risk:**
- Print jobs pile up if printer is briefly unavailable.
- No graduated degradation; printer goes from "OK" to "gave up."
- User may not realize their card didn't print.

**Mitigation:**
- Implement exponential backoff in reconnect logic.
- Increase heartbeat frequency or add adaptive retry during detected downtime.
- Track consecutive failures and alert (via Realtime or HTTP) when printing is unavailable.

---

### 6. Unbounded Emoji / Unicode Handling in Printer Layout

**File(s):** `apps/printer-bridge/src/layout.ts` (lines 17–44)

**Issue:** The transliteration map is hardcoded and incomplete. If visitor input contains emoji or uncommon Unicode, the printer will either:
- Silently drop the character (if charset="UTF-8" but printer doesn't support it).
- Output garbled if charset is CP437 and the character isn't in TRANSLITERATION_MAP.

**Risk:**
- Definition containing emoji prints with missing characters.
- Card readability degrades without warning.

**Mitigation:**
- Validate term/definition text before inserting into print_queue (remove/warn on unsupported chars).
- Log skipped characters to help diagnose printer charset issues.
- Consider a more robust transliteration library (e.g., `unidecode`).

---

## Type Safety Issues

### 7. Loose Record<string, unknown> in Print Payload Handling

**File(s):**
- `apps/backend/src/routes/webhook.ts` line 219: `printPayload as unknown as Record<string, unknown>`
- `apps/printer-bridge/src/index.ts` line 148: `row.payload as Record<string, unknown>`

**Issue:** Casting to `Record<string, unknown>` bypasses Zod validation until the printer bridge parses it. If the schema changes, the cast is stale.

**Risk:**
- Printer bridge receives an incorrectly shaped payload and crashes at runtime.
- No compile-time safety across the backend→printer boundary.

**Mitigation:**
- Remove the `as unknown` cast; pass `PrintPayload` directly (already Zod-validated).
- Update Supabase type to reflect this explicitly in the insert.

---

### 8. Implicit Type Coercion in ElevenLabs Tool Parameters

**File(s):** `apps/tablet/src/hooks/useConversation.ts` lines 144–162

**Issue:** The `save_definition` tool receives `parameters: Record<string, unknown>` and casts fields to strings manually:

```typescript
term: String(parameters['term'] ?? term),
definition_text: String(parameters['definition_text'] ?? ''),
```

This assumes the agent always returns these keys. If the agent (or ElevenLabs) changes the tool schema, no error is raised—the defaults silently kick in.

**Risk:**
- Definition gets saved with wrong term or empty text without alerting.
- Difficult to debug because the error is silent.

**Mitigation:**
- Use Zod to validate the `parameters` object before coercion.
- Add console warnings if fallbacks are used.
- Test with mocked agent responses that omit fields.

---

### 9. Weak Typing of Admin Page Authentication

**File(s):** `apps/tablet/src/pages/Admin.tsx` (entire file)

**Issue:** Admin dashboard is protected only by checking `?admin=true` in URL and using a single `VITE_WEBHOOK_SECRET` environment variable.

- `VITE_` prefix means this secret is shipped to the browser.
- No session tokens, no CSRF protection, no rate limiting on sensitive operations (reset chain, etc.).

**Risk:**
- Anyone with access to the tablet can reach the admin page and reset the installation state.
- The "secret" is visible in the network panel or bundle.

**Mitigation:**
- Move admin functions to the backend with proper authentication (API key in Authorization header, not in URL).
- Remove `?admin=true` check from the tablet app entirely.
- If an admin UI is needed on the tablet, require an operator to enter a PIN or scan a code at startup.

---

### 10. Missing Null Checks in Supabase Response Handling

**File(s):**
- `apps/backend/src/routes/webhook.ts` line 119: `!newSession` check but then immediately uses `newSession`
- `apps/backend/src/services/chain.ts` line 60: Cast to `Definition` without full validation

**Issue:** Supabase `.single()` can return partial data or unexpected shape. The code assumes fields exist without explicit checks.

**Risk:**
- Null pointer errors at runtime if Supabase schema or RLS policies change.

**Mitigation:**
- Use Zod to validate all Supabase responses, not just the top-level shape.
- Test with empty/malformed rows to ensure graceful degradation.

---

## Security Considerations

### 11. Anon Key Used for Sensitive Operations

**File(s):** `apps/printer-bridge/src/index.ts` line 47, `apps/tablet/src/lib/supabase.ts`

**Issue:** The anon key is used to update `print_queue` status and read `installation_config`. In production, the anon key can be extracted from the browser (VITE_* prefix) or the printer bridge binary.

**Risk:**
- Malicious actor could update print_queue status directly, preventing cards from printing.
- Could modify installation_config to change the installation state without backend validation.

**Current RLS Protection:** Policies restrict anon to specific operations, but they are permissive:
- `tablet_insert_sessions` allows inserting any session.
- `printer_update_print_queue` allows updating status to any valid state.

**Mitigation:**
- Use service role key for write operations; keep anon key read-only where possible.
- Add a `session_secret` token to sessions table; validate it in UPDATE policies.
- Rate-limit anonymous writes per IP.
- Log all administrative state changes to an audit table.

---

### 12. Webhook Secret Validation is Optional

**File(s):** `apps/backend/src/routes/webhook.ts` lines 13–33

**Issue:** If `WEBHOOK_SECRET` environment variable is not set, webhook authentication is skipped entirely.

```typescript
if (!secret) {
  await next();
  return;
}
```

**Risk:**
- In development, this is fine. In production, if the secret is accidentally omitted, the webhook accepts any request.
- Anyone could POST to `/webhook/definition` and create fake definitions.

**Mitigation:**
- Make `WEBHOOK_SECRET` required in production (check `NODE_ENV` or a separate `REQUIRE_WEBHOOK_SECRET` flag).
- Add warning logs if secret is missing.
- Return 400 (not 403/401) if secret is invalid, to avoid leaking that the endpoint exists.

---

### 13. No Rate Limiting on Public API Endpoints

**File(s):** `apps/backend/src/routes/session.ts`, `apps/backend/src/routes/config.ts`

**Issue:** The tablet can call `/api/session/start` and `/api/config` without rate limiting. A malicious client could spam these endpoints.

**Risk:**
- Denial of service: create thousands of sessions, exhaust Supabase quota.
- ElevenLabs agent creation is rate-limited by ElevenLabs, but before reaching that, you could exhaust Supabase write quota.

**Mitigation:**
- Add rate limiting middleware (Redis-backed or Hono built-in).
- Limit by IP and/or anon key.
- Return 429 (Too Many Requests) when exceeded.

---

### 14. Credentials Embedded in Environment Files

**Files affected:** `.env` files (not checked in, but developer workflows)

**Issue:** If `.env` files are accidentally committed, they expose API keys (OPENROUTER_API_KEY, ElevenLabs credentials, etc.).

**Current State:** `.env.example` files exist and show the required shape, but developers must be disciplined.

**Risk:**
- One misplaced commit leaks all credentials.
- CI/CD logs may echo environment variables.

**Mitigation:**
- Ensure `.env` is in `.gitignore` (already done).
- Use GitHub Secrets for CI/CD, not .env files.
- Rotate credentials if they are ever exposed.
- Add a pre-commit hook to prevent accidental commits of .env files.

---

## Performance Concerns

### 15. TTS with-timestamps API Fragmentation

**File(s):** `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` (lines 172–223)

**Issue:** The hook splits long texts into chunks (200-word chunks by default) to avoid API limits. Each chunk is fetched separately, then concatenated.

**Risk:**
- If a text is very long (1000+ words), there will be 5+ API calls.
- Time offset recalculation could be off by floating-point errors.
- If one chunk fails, the entire TTS is abandoned (no partial retry).

**Performance Impact:**
- Mode A (text_term) with Kleist's essay (~2500 words) → ~12 API calls on first load.
- Cache mitigates this, but cache misses are expensive.

**Mitigation:**
- Consider increasing chunk size or requesting a higher limit from ElevenLabs.
- Add granular error handling: if one chunk fails, mark that section as "TTS unavailable" and continue.
- Pre-warm the cache with common texts during installation setup.

---

### 16. Animation Frame Loop Never Pauses

**File(s):** `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` lines 272–309

**Issue:** The `updateActiveWord` callback calls `requestAnimationFrame` unconditionally, even when the audio is paused or not playing.

```typescript
const updateActiveWord = useCallback(() => {
  // ... logic ...
  animationFrameRef.current = requestAnimationFrame(updateActiveWord);
}, []);
```

**Risk:**
- The loop runs at 60 fps (or screen refresh rate) even when no highlighting is needed.
- Battery drain on tablets / mobile devices.
- Unnecessary CPU usage when the user has moved away from the text reader.

**Mitigation:**
- Only schedule next frame when `status === 'playing'`.
- Add a visibility API check to pause the loop when the tab/screen is not visible.

---

### 17. No Pagination on Supabase List Operations

**File(s):**
- `apps/backend/src/services/chain.ts` line 102: Fetches all definitions with `chain_depth != null` without limit
- `apps/printer-bridge/src/index.ts` line 134: Fetches all pending jobs without limit

**Issue:** If the system has thousands of chained definitions or print jobs, these queries load everything into memory.

**Risk:**
- High memory usage on the backend or printer bridge.
- Slow response times as the list grows.

**Mitigation:**
- Add `.limit(1000)` or implement cursor-based pagination.
- Test with large datasets (10k+ records) to identify performance cliffs.

---

## Fragile Areas

### 18. Face Detection Model Dependency on CDN

**File(s):** `apps/tablet/src/hooks/useFaceDetection.ts` lines 35–39

**Issue:** The face detection model is loaded from a CDN at runtime:
- MEDIAPIPE_CDN: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm`
- MODEL_URL: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`

**Risk:**
- If jsdelivr is down, camera detection fails silently.
- If the CDN URLs change or Google moves the model, detection breaks.
- In an air-gapped installation, this won't work at all.

**Current Fallback:** The component logs a warning and the user can still tap the SleepScreen to wake manually. But this is a degraded UX.

**Mitigation:**
- Bundle the WASM runtime and model files locally (increases bundle size ~5MB).
- Implement a fallback: if CDN fails, emit a warning and rely on tap-to-start.
- Test both online and offline scenarios during development.

---

### 19. Audio Playback Permission Denied Silently

**File(s):** `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` lines 495–500

**Issue:** If the browser blocks audio autoplay (common on mobile), the promise rejection is caught but the status stays in 'ready' instead of showing an error.

```typescript
audio.play().catch((err: unknown) => {
  console.error('[TTS] Auto-play blocked:', err);
  // Browsers may block autoplay — stay in ready state
  setStatus('ready');
});
setStatus('playing');
```

**Risk:**
- User sees the text but hears no audio (no alert).
- User thinks the TTS is broken when it's actually a browser policy.

**Mitigation:**
- Set status to 'playing' only if `.play()` succeeds (move the status change into the promise resolution).
- Show a UI prompt: "Tap the screen to start audio" if autoplay fails.

---

### 20. Cleanup Timing Issues in React Effects

**File(s):**
- `apps/tablet/src/hooks/useFaceDetection.ts` lines 83–242: Cleanup function accesses refs that may be null
- `apps/tablet/src/hooks/useTextToSpeechWithTimestamps.ts` lines 531–542: Cleanup may not cancel pending TTS fetch

**Issue:** React cleanup functions run after unmount. If the component unmounts while a fetch is in-flight, the cleanup may try to revoke a URL that hasn't been created yet, or the fetch completes after unmount.

**Current Handling:**
- `useFaceDetection` uses `mountedRef` to avoid setting state after unmount (good).
- `useTextToSpeechWithTimestamps` uses a `cancelled` flag (good).

**Risk (Minor):**
- If timing is just right, `animationFrameRef.current` could be accessed after it's been set to null.
- No strict ordering guarantees between effect and cleanup.

**Mitigation:**
- Current code is mostly safe, but could be more explicit by always checking `mountedRef` before any state update.
- Consider using AbortController for fetch cancellation (more standard).

---

### 21. System Prompt Exceeds Token Limits in Some Scenarios

**File(s):** `apps/tablet/src/lib/systemPrompt.ts` (entire file)

**Issue:** The system prompt is very long (300+ lines, 5KB+) and injected dynamically. If the visitor's context text is also long (Kleist essay ~2500 words), the initial request to ElevenLabs could exceed token budgets.

**Current Behavior:** ElevenLabs truncates or rejects oversized payloads (handled gracefully as disconnection).

**Risk:**
- Mode A with long texts may fail silently if the combined prompt + context exceeds limits.
- No warning to the operator that the system is hitting token limits.

**Mitigation:**
- Measure system prompt size and log a warning if approaching token limits.
- Consider using a shorter version of the system prompt for long texts.
- Document the recommended max context text length in CLAUDE.md.

---

### 22. ElevenLabs Conversation Disconnection Reasons Not Logged

**File(s):** `apps/tablet/src/hooks/useConversation.ts` line 119

**Issue:** The `onDisconnect` handler logs the disconnection reason, but doesn't provide enough detail for diagnosis.

```typescript
onDisconnect: (details: DisconnectionDetails) => {
  console.log('[MeinUngeheuer] Disconnected, reason:', details.reason);
  onConversationEndRef.current?.(details.reason);
},
```

**Risk:**
- If a visitor's conversation drops, it's hard to know if it was a network error, token limit, or intentional end.
- No metric tracking; the logs are ephemeral.

**Mitigation:**
- Log additional details: `details.code`, conversation duration, last message content (first 100 chars).
- Store disconnection events in Supabase for analysis.
- Show operator a badge: "Conversation ended unexpectedly" if reason is not 'agent' or 'visitor'.

---

## Missing Features / Incomplete Implementations

### 23. No Conversation Timeout Handling

**File(s):** State machine (`apps/tablet/src/hooks/useInstallationMachine.ts`), ElevenLabs integration

**Issue:** If a visitor's conversation goes silent (they stop talking), there's no timeout to transition out of the `conversation` state. The UI waits indefinitely.

**Current Behavior:** The 30-second printer timeout eventually kicks in and transitions to `printing` even if the definition wasn't received.

**Risk:**
- Long wait times if a visitor is thinking.
- Definition might be incomplete if the transition happens mid-thought.

**Mitigation:**
- Add a conversation timeout (e.g., 5 minutes without a visitor turn) that transitions to `synthesizing` and prompts the agent to wrap up.
- Or implement a "Continue?" prompt: "I'll give you 30 more seconds. Ready?" if silence is detected.

---

### 24. No Visitor Session "Card Taken" Confirmation

**File(s):** Database schema, State machine, API

**Issue:** The `sessions.card_taken` field is nullable and never updated. There's no mechanism to confirm that the visitor actually took their printed card.

**Risk:**
- Metrics on "cards distributed" are unreliable.
- If the card gets stuck in the printer, the system doesn't know.

**Mitigation:**
- Add a button or tap-to-confirm on the `FarewellScreen` that updates `card_taken = true`.
- Or use a passive optical sensor on the printer to detect card removal.
- Track this metric in the admin dashboard.

---

### 25. No Embedded Metrics or Observability Dashboard

**File(s):** Entire backend, no metrics middleware

**Issue:** There's no built-in observability. The only way to understand what's happening is to tail logs or query Supabase directly.

**Missing:**
- Request duration metrics (API latency).
- Error rates by endpoint.
- ElevenLabs conversation success rate.
- Print job failure reasons.
- Cache hit/miss rates for TTS.

**Risk:**
- Operator can't diagnose why the installation is slow or failing.
- No data-driven debugging.

**Mitigation:**
- Add a simple middleware to count requests/errors by route.
- Store event summaries in a `metrics` table (counters, recent errors).
- Build a basic admin dashboard that queries this table.
- Or integrate with an external service (Sentry, Datadog, etc.).

---

### 26. Chain Mode (Mode C) Not Fully Tested

**File(s):** `apps/backend/src/services/chain.ts`, `apps/backend/src/routes/webhook.ts` lines 200–215

**Issue:** Mode C logic is implemented but the interaction between:
- Fetching the active chain definition for a new session.
- Advancing the chain after a definition is saved.
- Handling race conditions if two definitions are saved in quick succession.

...has not been validated in an end-to-end test.

**Risk:**
- Chain might loop back or skip a step under concurrent conditions.
- The `definition_id` might be null in the fetched chain_state.
- Operator starts Mode C, visitors see no context, Mode C silently breaks.

**Mitigation:**
- Write integration tests that:
  1. Insert a text and start Mode A.
  2. Receive a definition.
  3. Advance the chain.
  4. Start a new session in Mode C and verify the context is the previous definition.
  5. Repeat 2–4 and check chain depth increments.
- Test with simulated concurrent definitions.

---

### 27. No Operator Control of Installation State During Live Session

**File(s):** Admin page, Installation config

**Issue:** An operator can change the mode / term via the admin page, but there's no verification that the change doesn't disrupt an in-progress session. If a visitor is mid-conversation and the operator changes the mode, the UI state machine might be confused.

**Current Behavior:** The tablet fetches config once at startup. Mid-session config changes are ignored.

**Risk:**
- Operator accidentally changes the term mid-session → definition gets saved for the wrong term.
- Operator enables Mode C but the backend has no active chain_state → session fails.

**Mitigation:**
- Lock the config during an active session (disable edits if a session is in progress).
- Or notify the frontend of config changes via Realtime and pause the current session gracefully.
- Show the current session state in the admin dashboard (status, elapsed time, definition received or not).

---

### 28. Printer Bridge Doesn't Validate Printer Connectivity Before Starting

**File(s):** `apps/printer-bridge/src/index.ts` lines 244–256

**Issue:** The printer bridge starts successfully even if the printer is unreachable. It logs a warning and continues, hoping the printer will be available later.

**Risk:**
- Print jobs accumulate in the queue while the printer is offline.
- No alerting to the operator that printing is unavailable.
- After hours, jobs might be stuck.

**Mitigation:**
- Make printer connectivity a hard requirement for startup (require `--allow-offline` flag to tolerate temporary unavailability).
- Or add a background health check that inserts a warning into Supabase if the printer is offline for >5 minutes.
- Show printer status in the operator dashboard.

---

### 29. No Graceful Shutdown of TTS Playback on State Transition

**File(s):** `apps/tablet/src/components/screens/TextDisplayScreen.tsx`, TTS hook integration

**Issue:** If the user is mid-playback and the state machine transitions away (e.g., to `term_prompt`), the audio keeps playing in the background.

**Current Behavior:** Depends on component cleanup. If the TextReader is unmounted, the audio should stop, but the effect cleanup may race with the state change.

**Risk:**
- Visitor hears overlapping audio from multiple screens.
- Battery drain if audio buffer isn't cleared.

**Mitigation:**
- Explicitly call `pause()` on the TTS hook before transitioning states.
- Or add a `onStateChange` callback to the TTS hook to auto-pause.

---

### 30. No Support for Multiple Languages in UI

**File(s):** All screen components, system prompt, first message

**Issue:** The UI (screens, buttons, labels) is hardcoded in German with some English. The system prompt is built dynamically with `language`, but the UI itself is not translatable.

**Risk:**
- If installation needs to support English-speaking visitors, the UI remains in German.
- Operator can't change language per session independently of mode.

**Current State:**
- `language` is passed to ElevenLabs (affects agent voice and first message).
- But the tablet UI (welcome screen, farewell, etc.) doesn't change.

**Mitigation:**
- Extract UI strings to a JSON file keyed by language.
- Wrap components in a `useLanguage()` hook that reads the current language from state/config.
- Test with German and English variants of all screens.

---

## Summary Table

| Severity | Category | Count | Examples |
|----------|----------|-------|----------|
| **High** | Security | 3 | Anon key for sensitive ops, optional webhook auth, no rate limiting |
| **High** | Type Safety | 3 | SDK type mismatches, loose Record<> casts, weak admin auth |
| **High** | Missing Features | 3 | No timeout, no observability, Mode C untested |
| **Medium** | Debt | 6 | Fire-and-forget ops, input validation, printer reconnect, unicode handling |
| **Medium** | Performance | 3 | TTS fragmentation, animation loop, unbounded queries |
| **Medium** | Fragile | 3 | CDN dependency, audio permission silent failure, cleanup timing |
| **Low** | Polish | 3 | Session confirmation, config locking, language support |
| | **TOTAL** | **24** | |

---

## Recommended Action Items (Priority Order)

### Urgent (P0 — Do Before Next Installation)
1. **Security:** Move admin operations to backend with proper auth.
2. **Observability:** Add basic error counting and recent-failures tracking.
3. **Mode C Testing:** Write e2e test for chain advance + context fetch.

### Short Term (P1 — Before Feature Releases)
4. Wrap Zod validation around all Supabase responses.
5. Implement conversation timeout handling.
6. Add rate limiting to public API endpoints.
7. Test TTS with long texts and edge-case Unicode.

### Medium Term (P2 — Polish & Scaling)
8. Implement exponential backoff for printer reconnection.
9. Add session state visibility to admin dashboard.
10. Implement graceful TTS cleanup on state transitions.
11. Add language support to UI.

### Low Priority (P3 — Nice to Have)
12. Pre-warm TTS cache.
13. Add card-taken confirmation.
14. Optimize animation frame loop with visibility API.
15. Comprehensive metrics dashboard.

---

## Testing Recommendations

- **Unit Tests:** Increase coverage for system prompt generation, word wrapping, transliteration.
- **Integration Tests:** Add Mode C chain flow, concurrent definition handling.
- **E2E Tests:** Full visitor flow (sleep → welcome → text/term → conversation → definition → print → farewell).
- **Edge Cases:** Empty definitions, very long texts, no network, offline printer, camera denied, autoplay blocked.
- **Stress Tests:** 1000+ sessions in rapid succession, printer offline for hours.

---

**Document Created:** March 7, 2026
**Prepared by:** Code analysis agent
**Next Review:** After P0 items completed
