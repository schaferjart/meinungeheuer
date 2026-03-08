# Codebase Concerns

**Analysis Date:** 2026-03-08

## Tech Debt

**Session creation never called from tablet:**
- Issue: The tablet defines `startSession()` in `apps/tablet/src/lib/api.ts` (line 78) and the state machine has a `SET_SESSION_ID` action in `apps/tablet/src/hooks/useInstallationMachine.ts` (line 49), but neither is ever used. The tablet never creates a server-side session before starting a conversation. Sessions are only created reactively when the webhook fires (if no session exists for that `elevenlabs_conversation_id`).
- Files: `apps/tablet/src/lib/api.ts`, `apps/tablet/src/hooks/useInstallationMachine.ts`, `apps/tablet/src/App.tsx`
- Impact: Definitions persisted directly by the tablet (`apps/tablet/src/lib/persist.ts`) have `session_id: null` because no session exists yet. The webhook creates a minimal session retroactively, but the tablet's own persist call happens first with a null session. This means the tablet-persisted definition row and the webhook-persisted session are disconnected. Duplicate definition rows can also appear (one from tablet, one from webhook) mitigated only by the `23505` duplicate key catch.
- Fix approach: Either (a) call `startSession` from `App.tsx` when entering the conversation screen and dispatch `SET_SESSION_ID`, then pass the session ID to `persistDefinition`, or (b) remove the dead `startSession` function and `SET_SESSION_ID` action to reduce confusion, and rely entirely on the webhook path for session/definition creation.

**Orphan `packages/core` directory:**
- Issue: `packages/core/` exists with only `dist/` and `node_modules/` folders -- no `package.json`, no source code. The `pnpm-workspace.yaml` includes `packages/*`, so this empty package may cause workspace resolution noise.
- Files: `packages/core/`
- Impact: Minimal runtime impact, but confusing for developers exploring the project.
- Fix approach: Delete `packages/core/` entirely.

**Duplicate `TranscriptEntry` type definition:**
- Issue: `TranscriptEntry` is defined in both `apps/tablet/src/hooks/useConversation.ts` (line 16) and `apps/tablet/src/components/screens/ConversationScreen.tsx` (line 5) with slightly different shapes (the hook version has `timestamp`, the screen version uses `Role` from shared types).
- Files: `apps/tablet/src/hooks/useConversation.ts`, `apps/tablet/src/components/screens/ConversationScreen.tsx`
- Impact: Type divergence risk. If one is updated and the other is not, mismatches can occur. Currently compatible because `App.tsx` passes the hook's transcript to the screen component and TypeScript structurally matches them.
- Fix approach: Define a single `TranscriptEntry` type in `packages/shared/src/types.ts` and import it in both locations.

**Print test button is a no-op:**
- Issue: The admin `insertPrintTest` function in `apps/tablet/src/pages/Admin.tsx` (line 133) sends an empty `{}` body to the config update endpoint instead of inserting an actual print queue job. The comment acknowledges this: "Real print test would hit a dedicated endpoint."
- Files: `apps/tablet/src/pages/Admin.tsx` (lines 133-145)
- Impact: The "Send Print Test" button in the admin UI does nothing useful -- it just confirms auth works.
- Fix approach: Create a `POST /api/print-test` endpoint on the backend that inserts a test payload into `print_queue`, then call it from the admin.

**`voice_id` hardcoded to `'unknown'` in TTS cache writes:**
- Issue: When the tablet writes to the `tts_cache` table via the Supabase cache adapter, it sets `voice_id` to the literal string `'unknown'` because the generic `CacheAdapter` interface does not carry the voice ID.
- Files: `apps/tablet/src/lib/supabaseCacheAdapter.ts` (line 45)
- Impact: Cache entries cannot be distinguished by voice. If the voice ID is changed, stale cached audio with the old voice will be served because the cache key (SHA-256 of text + voiceId) should differentiate them, but the stored metadata is inaccurate for debugging or manual cache management.
- Fix approach: Pass the voice ID through the cache adapter constructor or extend the `CacheAdapter` interface to include metadata.

## Known Bugs

**Auto-wake bypasses face detection:**
- Symptoms: The app immediately dispatches `WAKE` on mount (line 107-110 in `apps/tablet/src/App.tsx`) regardless of face detection state. The `CameraDetector` component also runs and will fire `onWake`, but the auto-wake effect fires first, making face-detection-based wake redundant.
- Files: `apps/tablet/src/App.tsx` (lines 106-110)
- Trigger: Every page load.
- Workaround: This appears intentional for development/testing ("auto-wake: start immediately"), but it defeats the art installation's sleep-to-wake flow. For production, this effect should be removed so the tablet waits for face detection or tap.

**`handleConversationEnd` has stale closure over `state.screen`:**
- Symptoms: The `handleConversationEnd` callback in `apps/tablet/src/App.tsx` (line 136) depends on `state.screen` and `state.definition` in its dependency array. However, it is passed to `useConversation` which stores it in a ref, so the ref update and the callback's closure may be out of sync during rapid state transitions. If the conversation ends exactly while a screen transition is happening, the fallback definition may fire incorrectly.
- Files: `apps/tablet/src/App.tsx` (lines 136-157)
- Trigger: Agent disconnects during a rapid screen transition.
- Workaround: In practice this is rare due to the sequential nature of the flow.

## Security Considerations

**CORS set to `origin: '*'` on backend:**
- Risk: The backend allows requests from any origin. While acceptable for an art installation with a single tablet client, this means any website can make authenticated requests if they know the `WEBHOOK_SECRET`.
- Files: `apps/backend/src/app.ts` (lines 15-22)
- Current mitigation: The installation runs on a private network. Admin endpoints require the `WEBHOOK_SECRET`.
- Recommendations: Restrict CORS to the tablet's origin (e.g., the Coolify deployment URL) in production.

**No rate limiting on backend API:**
- Risk: All endpoints (webhook, session creation, config reads) have no rate limiting. A malicious actor on the network could flood the database with sessions, definitions, or print jobs.
- Files: `apps/backend/src/app.ts`, all route files under `apps/backend/src/routes/`
- Current mitigation: Installation operates on a controlled network.
- Recommendations: Add basic rate limiting middleware (e.g., `hono-rate-limiter`) on mutation endpoints, at minimum on `/webhook/definition` and `/api/session/start`.

**Webhook secret bypassed when not configured:**
- Risk: Both the webhook middleware (`apps/backend/src/routes/webhook.ts` line 17) and admin middleware (`apps/backend/src/routes/config.ts` line 19) skip auth entirely if `WEBHOOK_SECRET` is unset. This is documented as "dev mode" but there is no warning if the backend is deployed to production without the secret.
- Files: `apps/backend/src/routes/webhook.ts` (lines 13-20), `apps/backend/src/routes/config.ts` (lines 13-23)
- Current mitigation: `.env.example` documents the variable.
- Recommendations: Log a prominent warning at startup if `WEBHOOK_SECRET` is not set.

**Admin secret exposed in URL query string:**
- Risk: The admin page reads the secret from `?secret=xxx` in the URL (`apps/tablet/src/pages/Admin.tsx` line 154). Query strings appear in browser history, server logs, and network tabs.
- Files: `apps/tablet/src/pages/Admin.tsx` (lines 152-154)
- Current mitigation: Admin is accessed only during setup on a controlled network.
- Recommendations: Use a session cookie or Authorization header instead of query parameters.

**Anon key can insert definitions and turns without authentication:**
- Risk: RLS policies allow the `anon` role to INSERT into `definitions` (migration 007), `sessions`, and `turns` (migration 004) with `WITH CHECK (true)`. Anyone with the anon key can insert arbitrary data.
- Files: `supabase/migrations/004_rls.sql`, `supabase/migrations/007_anon_insert_definitions.sql`
- Current mitigation: The anon key is only embedded in the tablet app (a controlled device). Not exposed publicly.
- Recommendations: For a public-facing deployment, add constraints (e.g., require a valid session_id FK, limit insert rate via PostgreSQL functions).

## Performance Bottlenecks

**`chain_depth` counting is a full table scan:**
- Problem: In the webhook definition handler, chain depth is calculated by counting all definitions where `chain_depth IS NOT NULL` via `SELECT * ... count: 'exact'`. This scans the entire definitions table on every Mode C definition save.
- Files: `apps/backend/src/routes/webhook.ts` (lines 141-145)
- Cause: No targeted index; the query counts ALL rows with non-null chain_depth rather than reading the max value.
- Improvement path: Replace with `SELECT MAX(chain_depth) FROM definitions WHERE chain_depth IS NOT NULL` and add 1, or read the current chain_state depth directly.

**Session count for print card is a full table scan:**
- Problem: Every definition save counts ALL sessions to generate `session_number` for the print card: `SELECT * FROM sessions ... count: 'exact', head: true`.
- Files: `apps/backend/src/routes/webhook.ts` (lines 180-182)
- Cause: No alternative to counting all rows. With thousands of sessions, this degrades.
- Improvement path: Store a running counter in `installation_config` and increment atomically on each session.

**MediaPipe WASM loaded from CDN on every page load:**
- Problem: The face detection model and WASM runtime are fetched from `cdn.jsdelivr.net` every time the app loads. No service worker caches these assets.
- Files: `apps/tablet/src/hooks/useFaceDetection.ts` (lines 35-39)
- Cause: CDN URLs without local caching strategy.
- Improvement path: Bundle the WASM files locally or add a service worker with cache-first strategy for the CDN assets.

**TTS cache stores base64 audio in Supabase JSONB:**
- Problem: TTS audio is stored as an array of base64-encoded strings in a JSONB column in the `tts_cache` table. For long texts, this can be multiple MB of base64 data per row.
- Files: `supabase/migrations/006_kreativitaetsrant_and_tts_cache.sql`, `apps/tablet/src/lib/supabaseCacheAdapter.ts`
- Cause: Design choice for simplicity (no separate file storage needed).
- Improvement path: Move audio blobs to Supabase Storage and store only a reference in the cache table. This reduces database size and allows streaming.

## Fragile Areas

**`advanceChain` is not atomic:**
- Files: `apps/backend/src/services/chain.ts` (lines 69-91)
- Why fragile: `advanceChain` performs two separate database operations (deactivate old entries, insert new entry) without a transaction. If the process crashes between deactivate and insert, the chain has no active entry, and Mode C visitors see no context.
- Safe modification: Wrap both operations in a Supabase RPC (PostgreSQL function) that runs in a single transaction.
- Test coverage: No tests for `chain.ts`. The chain service is completely untested.

**Dual definition persistence (tablet + webhook):**
- Files: `apps/tablet/src/lib/persist.ts`, `apps/backend/src/routes/webhook.ts`
- Why fragile: Definitions are saved from two independent paths: the tablet calls `persistDefinition` directly via Supabase anon key, and the ElevenLabs webhook calls the backend which also inserts. Both paths insert with `session_id: null` from the tablet side. The dedup relies on the `id` field (tablet generates a UUID via `crypto.randomUUID()`) and the `23505` unique constraint error code. But the webhook creates its own definition row with a different ID, so duplicates with different IDs can exist.
- Safe modification: Choose one canonical path for definition creation. Either (a) remove tablet-side persist and rely entirely on the webhook, or (b) have the tablet create the session first and only persist from the tablet.
- Test coverage: No integration tests verify the dual-write scenario.

**`App.tsx` is a 297-line monolith orchestrator:**
- Files: `apps/tablet/src/App.tsx`
- Why fragile: The main `InstallationApp` component manages the state machine, conversation hook, config fetching, definition handling, transcript persistence, screen rendering, and multiple `useEffect` side effects. Changes to any one concern risk breaking others.
- Safe modification: Extract each concern into its own hook (e.g., `useConfigFetch`, `useConversationLifecycle`, `useScreenRouter`). Keep `App.tsx` as a thin composition layer.
- Test coverage: No tests for `App.tsx`. The state machine itself (`useInstallationMachine`) has tests, but the orchestration logic does not.

**Conversation end fallback creates a German-only stub:**
- Files: `apps/tablet/src/App.tsx` (lines 143-154)
- Why fragile: When the conversation ends without a definition (agent disconnects), the fallback creates a stub definition with `definition_text: 'Die Unterhaltung wurde beendet.'` (German only), regardless of the visitor's language. This stub gets persisted and printed.
- Safe modification: Use the `language` state to select the appropriate fallback text.
- Test coverage: None.

## Scaling Limits

**Single-row installation_config table:**
- Current capacity: 1 installation.
- Limit: The architecture assumes a single `installation_config` row. Multiple tablets or installations sharing the same Supabase project would conflict.
- Scaling path: Add an `installation_id` column to `installation_config`, `sessions`, and `print_queue`. Pass the installation ID as an env var to each tablet.

**Supabase Realtime for print queue:**
- Current capacity: Works well for 1 printer bridge instance with low throughput (1 job every few minutes).
- Limit: Supabase Realtime has connection limits on free tier (200 concurrent). If multiple printer bridges subscribe, or if the Realtime connection drops and reconnects without draining, jobs may be processed twice (no dedup beyond the `status` claim pattern).
- Scaling path: The current claim pattern (`UPDATE ... WHERE status='pending'`) provides basic idempotency. For multiple printers, add a `claimed_by` column.

## Dependencies at Risk

**ElevenLabs SDK (`@11labs/react`):**
- Risk: The project has pre-existing type mismatches with the SDK (documented in CLAUDE.md memory): `MessagePayload`, `connectionType`, `Uint8Array/BlobPart` incompatibility. These are worked around with type annotations in `apps/tablet/src/hooks/useConversation.ts`.
- Impact: SDK upgrades may break the workarounds. The SDK is the critical path for the entire conversation flow.
- Migration plan: Pin the SDK version strictly. Test any upgrade in isolation before merging.

**MediaPipe CDN pinned to specific version:**
- Risk: `useFaceDetection.ts` pins `@mediapipe/tasks-vision@0.10.32` in the CDN URL. If jsdelivr CDN has an outage or removes the version, face detection breaks silently (falls back to tap-to-start).
- Impact: Face detection becomes unavailable.
- Migration plan: Self-host the WASM files or use a fallback CDN.

## Missing Critical Features

**No conversation timeout:**
- Problem: The conversation has no maximum duration. If a visitor walks away mid-conversation without the face detection triggering sleep (e.g., they step just out of frame), the ElevenLabs session stays open indefinitely, consuming API credits.
- Blocks: Unattended cost control.

**No language detection feedback loop:**
- Problem: The `language` state is set to `'de'` by default and never updated based on actual visitor speech. The `language_detected` field on sessions is always `null`. The system prompt tells the agent to match the visitor's language, but the tablet UI (welcome text, button labels) stays in the default language.
- Files: `apps/tablet/src/hooks/useInstallationMachine.ts` (line 30), `apps/tablet/src/App.tsx`
- Blocks: Proper bilingual UX. Visitors who speak English still see German UI text for welcome, farewell, printing screens.

**No error recovery UI for conversation failures:**
- Problem: If `startConversation()` fails in `App.tsx` (line 188), the error is only logged to console. The visitor sees the conversation screen with no transcript and no mic activity, with no way to retry or go back.
- Files: `apps/tablet/src/App.tsx` (lines 184-196)
- Blocks: Graceful degradation for API outages.

## Test Coverage Gaps

**Backend has zero tests:**
- What's not tested: All backend routes (`webhook.ts`, `config.ts`, `session.ts`), all services (`chain.ts`, `embeddings.ts`, `supabase.ts`).
- Files: `apps/backend/src/`
- Risk: Webhook handler is the most critical path (definition save, print queue, chain advance) and has no test coverage. Any refactor could break the core loop silently.
- Priority: High

**Tablet app has minimal tests:**
- What's not tested: `App.tsx` orchestration, `useConversation.ts`, `useFaceDetection.ts`, `TextReader.tsx`, `persist.ts`, `api.ts`, all screen components, `systemPrompt.ts`, `firstMessage.ts`.
- Files: Only `apps/tablet/src/hooks/useInstallationMachine.test.ts` exists (378 lines, tests the state machine reducer thoroughly).
- Risk: The state machine is well-tested, but none of the side effects, API calls, or UI rendering is tested.
- Priority: Medium (the state machine test covers the most complex logic)

**Printer bridge has zero tests:**
- What's not tested: Job processing, claim logic, POS server relay, Realtime subscription handling.
- Files: `apps/printer-bridge/src/`
- Risk: Print failures in production would be hard to diagnose without test coverage.
- Priority: Medium

**No integration or E2E tests:**
- What's not tested: The full flow from tablet wake to definition print. No test verifies that the webhook correctly creates a session, inserts a definition, queues a print job, and advances the chain in sequence.
- Files: No test infrastructure for cross-app testing exists.
- Risk: Breaking changes in one app (e.g., changing a webhook payload shape) could go undetected.
- Priority: High

---

*Concerns audit: 2026-03-08*
