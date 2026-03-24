# Codebase Concerns

**Analysis Date:** 2026-03-24

## Tech Debt

**Silent fire-and-forget persistence patterns:**
- Issue: `persistDefinition()`, `persistPrintJob()`, `persistTranscript()`, and `uploadBlurredPortrait()` in `apps/tablet/src/lib/persist.ts` all swallow errors silently. Errors are logged only to the browser console, never raised. When debugging missing data in Supabase, the tablet shows no error while the database transaction fails silently.
- Files: `apps/tablet/src/lib/persist.ts`, `apps/backend/src/routes/webhook.ts`, `apps/backend/src/services/voiceChain.ts`
- Impact: Data loss without visible indication. Visitor completes interaction, but definition/print job/transcript never reaches database due to RLS block or network timeout. Installation appears to work. Discovered only via manual Supabase query.
- Fix approach: Add a lightweight persistence error queue (in-memory or IndexedDB) that logs failures to a dashboard widget or sends to sentry-like service. At minimum, display a subtle "offline" indicator if Supabase operations fail.

**RLS policies are fragile and silent:**
- Issue: The `turns` table required a public SELECT policy for the archive app to read conversations. The initial migration lacked this, causing archive to fail silently with empty results. Similar risk exists for `definitions` table: if RLS is misconfigured, the webhook receives no error, just a silent insert that succeeds at the API level but fails at the DB layer.
- Files: `supabase/migrations/004_rls.sql`, `apps/backend/src/routes/webhook.ts` (line 99-105 where session fetch can silently miss), `apps/archive/` (not shown, but affected)
- Impact: Data appears to be saved (webhook returns 200), but never persists. Auth token refresh or policy change breaks the system. No runtime check or log indicates RLS failure.
- Fix approach: Before each webhook write, test a read with the same credentials to verify RLS is open. Add explicit logging: "Attempting to insert with role X — RLS policy must allow INSERT". For the archive, add a health check endpoint that verifies SELECT policy exists.

**Config fetch failure is silent; tablet uses default with null context:**
- Issue: If `/api/config` request fails (backend down, network error, or timeout), `fetchConfig()` in `apps/tablet/src/App.tsx` (line 171-174) catches the error and logs only to console. The tablet falls back to defaults: `DEFAULT_MODE`, `DEFAULT_TERM`, `contextText: null`. The ElevenLabs agent then receives no context text to reference, and conversations become generic term prompts with no text.
- Files: `apps/tablet/src/App.tsx` (line 171-174), `apps/tablet/src/lib/api.ts` (line 137-143)
- Impact: Visitors interact with the AI without the installation's curated text context. The experience degrades silently — no error message, just a boring interaction.
- Fix approach: Retry `/api/config` 3 times with exponential backoff. If all retries fail, display a "Please check the backend service" message on the sleep screen and hold in that state until config succeeds.

**Zod validation strips unknown fields without warning:**
- Issue: When the backend adds a field to a response schema, clients using older code won't include it in their Zod schema. The field gets silently dropped during validation. Example: if `/api/config` response gains a new field `newExperimentalSetting`, and a client's `ConfigResponseSchema` doesn't include it, the field vanishes during `schema.parse()`.
- Files: `apps/tablet/src/lib/api.ts` (line 9-102, all `.optional()` fields are lenient), `apps/backend/src/routes/config.ts` (line 61-223 builds arbitrary response)
- Impact: New features added to config (e.g., a new timer) won't reach old tablet clients. Operator assumes the setting is being applied; tablet ignores it. Hard to debug.
- Fix approach: Use `.passthrough()` on response schemas to preserve unknown fields as-is. Log a warning if unknown fields appear: "Config response contains unexpected keys". For critical settings, make them required and fail-fast if missing.

## Known Bugs & Edge Cases

**Default voice restoration race condition:**
- Issue: In `apps/tablet/src/hooks/useConversation.ts` (line 161-170), when the conversation ends, we attempt to restore the agent's default voice by PATCHing the ElevenLabs API. If two conversations overlap (unlikely but possible with WebSocket reconnect), the second one may succeed and change the voice while the first is still restoring default. The default voice ID is hardcoded: `'DLsHlh26Ugcm6ELvS0qi'`.
- Files: `apps/tablet/src/hooks/useConversation.ts` (line 161-170)
- Impact: Agent voice may be wrong for the next visitor if timing is unlucky. The voice clone ID set by the previous visitor lingers.
- Fix approach: Store the actual current agent voice ID from config, not a hardcoded constant. Retry the PATCH once if it fails. Better: use a voice pool or per-session voice assignment, avoiding the need to restore globally.

**Portrait capture may race with conversation end:**
- Issue: In `apps/tablet/src/App.tsx` (line 355-370, not shown but inferred from line 97-100), portrait blob is captured during conversation but uploaded after definition is received. If the visitor closes the browser or the session times out before definition arrives, the portrait blob is lost. If the definition comes back but portrait upload fails, there's no retry.
- Files: `apps/tablet/src/App.tsx`, `apps/tablet/src/hooks/usePortraitCapture.ts`
- Impact: Voice chain mode depends on portrait for context. Missing portrait means no face reference for the next visitor. Silent failure.
- Fix approach: Treat portrait upload as critical for voice chain mode; return to PrintingScreen until it succeeds or times out after 30s. Add explicit logging of portrait blob size and upload status.

**Printer bridge polling can miss jobs if Realtime is down:**
- Issue: In `apps/printer-bridge/src/index.ts` (line 135-171), the Realtime subscription is initiated with a 5-second polling fallback (line 199). If Realtime fails to subscribe (`CHANNEL_ERROR` or `TIMED_OUT`), the fallback starts polling. However, there's a window between startup and the first poll where an INSERT on `print_queue` arrives but is not processed: the job sits `pending` until the next poll interval (5 seconds later).
- Files: `apps/printer-bridge/src/index.ts` (line 135-171, line 199-203)
- Impact: Print jobs are delayed by up to 5 seconds during Realtime outages. Visitor watches the PrintingScreen for 10+ seconds while waiting for the card to print.
- Fix approach: Reduce polling interval to 2 seconds. Store the last poll timestamp and immediately recheck on CHANNEL_ERROR to drain backlog faster.

**ElevenLabs voice clone deletion is fire-and-forget with no cleanup on error:**
- Issue: In `apps/backend/src/services/voiceChain.ts` (line 105-131), `deleteVoiceClone()` is called fire-and-forget (line 480+, not shown). If the delete fails (quota reached, API error), the voice clone orphans in ElevenLabs and the account hits the clone limit. The error is logged but never surfaces to the admin.
- Files: `apps/backend/src/services/voiceChain.ts`
- Impact: After 10-15 voice chain cycles, voice clones max out. Subsequent conversations fail silently to get voice clones. The installation stops advancing the voice chain.
- Fix approach: Log failed deletions to a `voice_clone_errors` table. Add an admin dashboard widget showing orphaned clones and offering a cleanup button. Set a maximum age for active clones (e.g., delete clones older than 24h).

## Security Considerations

**Webhook secret can be null in dev mode:**
- Issue: In `apps/backend/src/routes/webhook.ts` (line 14-20), if `process.env['WEBHOOK_SECRET']` is not set, webhook authentication is skipped entirely. The same applies to `/api/config/update` in `apps/backend/src/routes/config.ts` (line 19-24). This is intentional for dev, but if a developer forgets to set the secret in production, anyone can call the webhook and create definitions, print jobs, or change config.
- Files: `apps/backend/src/routes/webhook.ts` (line 14-20), `apps/backend/src/routes/config.ts` (line 19-24)
- Impact: Unauthorized definition creation, print spam, config hijacking.
- Fix approach: In production builds, always require `WEBHOOK_SECRET`. Throw an error during startup if it's missing. Add a build-time check in Coolify or CI/CD: `if [ -z "$WEBHOOK_SECRET" ]; then echo "WEBHOOK_SECRET required"; exit 1; fi`.

**Voice clone audio files stored in Supabase Storage without retention policy:**
- Issue: Voice chain mode uploads audio to ElevenLabs for cloning, then stores the blurred portrait and metadata in Supabase Storage and `voice_chain_state` table. If an attacker gains access to Supabase Storage, they can download all visitor portraits (despite blur). No explicit retention or deletion policy exists.
- Files: `apps/tablet/src/lib/persist.ts` (line 98-119, portrait upload), `apps/backend/src/services/voiceChain.ts` (voice processing)
- Impact: Privacy breach: visitor portraits (even blurred) are indefinitely stored.
- Fix approach: Add a retention policy: auto-delete voice chain portraits and audio blobs after 30 days. Implement explicit cleanup: `DELETE FROM storage.objects WHERE bucket_id='portraits-blurred' AND created_at < now() - interval '30 days'`. Display a privacy notice to visitors: "Your portrait will be deleted after 30 days."

**Supabase Realtime auth token refresh not handled:**
- Issue: The printer-bridge and tablet apps use Supabase Realtime channels but don't explicitly refresh the auth token. If the session lasts longer than the token's TTL (usually 1 hour for Supabase), the channel silently disconnects and falls back to polling.
- Files: `apps/printer-bridge/src/index.ts` (line 138-160), `apps/tablet/src/` (various components using Supabase)
- Impact: Realtime features (instant print notifications, config changes) degrade to polling after 1 hour. Silent failure.
- Fix approach: Add token refresh logic to the Supabase client. Detect channel disconnection and re-subscribe with a fresh token.

## Performance Bottlenecks

**Face detection runs at only 2 fps (500ms interval):**
- Issue: In `apps/tablet/src/hooks/useFaceDetection.ts` (line 225), the detection loop runs every 500ms. This is intentionally low to reduce CPU on the tablet, but it introduces a 250ms average latency between a visitor's face appearing and the wake trigger firing.
- Files: `apps/tablet/src/hooks/useFaceDetection.ts` (line 225)
- Impact: Visitors wave at the camera and wait 1-2 seconds for the welcome screen to appear. Impression of lag.
- Fix approach: Increase to 10 fps (100ms interval) on desktop, keep 2 fps on mobile (use screen.width detection). The tablet is typically desktop-class, so 100ms is safe. Measure CPU with DevTools to confirm.

**Portrait JPEG encoding happens on main thread:**
- Issue: In `apps/tablet/src/hooks/usePortraitCapture.ts` (not shown in detail), canvas-to-blob JPEG encoding with quality 0.85 (from config) is synchronous. Encoding a 1280×960 portrait takes ~50-100ms, blocking the render thread and audio processing.
- Files: `apps/tablet/src/hooks/usePortraitCapture.ts`, `apps/tablet/src/lib/portraitBlur.ts`
- Impact: Slight audio dropout or UI stutter during portrait capture.
- Fix approach: Move JPEG encoding to a Web Worker. Use `canvas.convertToBlob()` with a timeout to avoid blocking.

**Embedding generation is serial, not batched:**
- Issue: In `apps/backend/src/services/embeddings.ts`, `generateEmbedding()` is called fire-and-forget for each definition. If 10 definitions are saved in quick succession, 10 separate API calls to OpenRouter are made. No batching or queue.
- Files: `apps/backend/src/services/embeddings.ts` (line 28-85), `apps/backend/src/routes/webhook.ts` (line 254)
- Impact: Embeddings API quota is consumed linearly. If the installation is popular (50+ definitions/hour), API costs spike. Slow response times for embedding API.
- Fix approach: Batch embeddings: queue up to 10 definition IDs, submit them in a single `embeddings.create({ input: [text1, text2, ...] })` call. Use a 5-second debounce window to accumulate.

## Fragile Areas

**Installation state machine depends on exact screen transitions:**
- Issue: In `apps/tablet/src/hooks/useInstallationMachine.ts` (line 65-150+), each action checks the current screen before allowing a transition. If a timer fires twice or an event arrives out of order, the transition is ignored (e.g., `TIMER_3S` when screen is not 'welcome' returns the same state). This is correct, but the reducer is 550+ lines and has many conditional paths. A typo in a screen name or action type won't be caught until runtime.
- Files: `apps/tablet/src/hooks/useInstallationMachine.ts`
- Impact: Silent state machine jams if a action is dispatched to the wrong screen. Visitor presses "start" but nothing happens because the reducer expected 'welcome' and got 'sleep'.
- Fix approach: Add exhaustiveness checks: use TypeScript's never type to ensure all action types are handled. Add a catch-all case that logs a warning if an unhandled transition is attempted. Consider a state machine library (xstate) for clearer visualization.

**ElevenLabs agent config can be stale:**
- Issue: The ElevenLabs agent is configured via API and stored in the Hono backend environment variables. The system prompt and first message are built on the client and passed to the WebSocket session via `overrides` (line 236-243 in `apps/tablet/src/hooks/useConversation.ts`). If the agent's backend configuration drifts from what the code expects (e.g., tools are removed), the session overrides may not apply correctly.
- Files: `apps/tablet/src/hooks/useConversation.ts` (line 235-243), `apps/backend/src/routes/voiceChain.ts` (line 131-146)
- Impact: System prompt is ignored, agent doesn't call tools, definitions don't arrive.
- Fix approach: Fetch the agent config from ElevenLabs API on startup and validate it. Log a warning if tools are missing or misconfigured. Add a health check endpoint `/api/agent-config` that validates the agent setup.

**Supabase schema assumes single installation_config row:**
- Issue: In `apps/backend/src/routes/config.ts` (line 62-66), the code fetches the first installation_config row with `.limit(1).maybeSingle()`. If multiple rows exist (operator copy-pasted the config), the second one is ignored silently. No warning or error.
- Files: `apps/backend/src/routes/config.ts` (line 62-66)
- Impact: Configuration changes are ignored if there are duplicate rows. Operator thinks they updated the config, but the old row is still being served.
- Fix approach: Add a check in the migration that enforces exactly one row: `ALTER TABLE installation_config ADD CONSTRAINT one_row CHECK (true);` won't work (CHECK can't count), but a trigger `BEFORE INSERT` can reject if count > 0.

**Print renderer URL is not validated:**
- Issue: In `apps/printer-bridge/src/index.ts` and `apps/tablet/src/hooks/usePortraitCapture.ts`, the `printRendererUrl` comes from environment variables or config with no runtime validation. If the URL is wrong (typo, service down), the POST request fails silently.
- Files: `apps/printer-bridge/src/index.ts` (line 22), `apps/tablet/src/App.tsx` (line 90)
- Impact: Prints fail silently. Visitor leaves thinking they'll get a card but nothing happens.
- Fix approach: Add a health check on app startup: `GET {printRendererUrl}/health`. If it fails, log a critical error and hold the app in a "printer service unavailable" state.

## Scaling Limits

**Pi RAM constraint blocks monorepo builds:**
- Issue: The README notes that `npx tsc` and full `pnpm install` will OOM-kill on the Pi (limited RAM). The workaround is to commit `packages/shared/dist/` to git so the Pi never needs to rebuild. However, if a developer forgets to run `pnpm build` and `git add -f packages/shared/dist/` after modifying `packages/shared/src/`, the Pi will fail silently (or crash).
- Files: All apps that depend on `@meinungeheuer/shared`
- Impact: Deployment to Pi fails with cryptic OOM messages. No clear error message tells the developer to rebuild shared.
- Fix approach: Add a predeployment check: verify that `packages/shared/dist/` is committed and up-to-date with src. Add a git hook: `pre-push` validates that if src files changed, dist files were updated. Fail the push with a clear message.

**Polling interval creates print job latency:**
- Issue: In `apps/printer-bridge/src/index.ts` (line 105, 199), the poll interval is 5 seconds. During Realtime outages, a print job sits in the queue for up to 5 seconds before being picked up.
- Files: `apps/printer-bridge/src/index.ts`
- Impact: Visitor waits longer for the card to print.
- Fix approach: See Performance Bottlenecks section; reduce to 2 seconds.

## Test Coverage Gaps

**No tests for webhook race conditions:**
- Issue: Two rapid save_definition calls for the same conversation_id could result in duplicate definitions or race conditions in chain_depth calculation. No integration tests cover concurrent webhook calls.
- Files: `apps/backend/src/routes/webhook.ts` (line 71-257)
- Impact: Edge case with concurrent visitors or rapid retries could cause data corruption.
- Fix approach: Add an integration test: simulate two webhook calls arriving within 100ms, verify only one definition is created.

**No tests for RLS policy enforcement:**
- Issue: The migrations define RLS policies, but there are no tests verifying they work as expected. If a policy is accidentally dropped during a future migration, it won't be caught.
- Files: `supabase/migrations/004_rls.sql`
- Impact: Silent security regression.
- Fix approach: Add a test that attempts to insert/select/update as the anon user and verifies policies are enforced.

**No tests for silent error paths in persist functions:**
- Issue: The fire-and-forget functions in `apps/tablet/src/lib/persist.ts` catch all errors and log only. No tests verify that errors are logged, or what happens if Supabase is unavailable.
- Files: `apps/tablet/src/lib/persist.ts`
- Impact: Silent data loss is undetected.
- Fix approach: Mock Supabase to fail, call persist functions, verify they log errors without throwing.

**Face detection hook lacks error injection tests:**
- Issue: Camera permission denied, model load failure, and MediaPipe CDN timeout are handled, but there are no tests simulating these failures.
- Files: `apps/tablet/src/hooks/useFaceDetection.ts`
- Impact: Edge cases may cause silent hangs (e.g., waiting forever for loadedmetadata if video fails).
- Fix approach: Add tests that mock getUserMedia to throw, FaceDetector.createFromOptions to timeout, etc. Verify the hook surfaces errors and allows graceful fallback.

**No end-to-end tests for the full conversation flow:**
- Issue: Individual hooks and components are tested, but no E2E test covers: wake → welcome → text_display → conversation → definition received → printing → farewell → sleep.
- Files: All screen components, state machine, ElevenLabs integration
- Impact: A breaking change in screen routing or state transitions won't be caught until manually tested.
- Fix approach: Add a Playwright E2E test that mocks ElevenLabs WebSocket and Supabase, then simulates a full conversation.

## Deployment & Operational Risks

**Backend depends on ElevenLabs API key at runtime:**
- Issue: If the ElevenLabs API key (`ELEVENLABS_API_KEY` env var) is missing or revoked, voice chain processing fails silently. The backend logs errors but continues running, and visitors are offered voice chain mode with no way to participate.
- Files: `apps/backend/src/services/voiceChain.ts` (line 17, 20)
- Impact: Voice chain mode silently broken; visitors confused.
- Fix approach: On startup, test the API key with a simple API call (e.g., GET /v1/user). If it fails, log an error and gracefully disable voice chain mode (return null from `/api/config`).

**Coolify expects `pnpm-lock.yaml` to be committed:**
- Issue: The deployment notes say lockfile must be committed. If a developer upgrades a dependency locally but forgets to run `pnpm install` and commit the lockfile, Coolify build will fail with `--frozen-lockfile` error.
- Files: Monorepo root
- Impact: Deployment blocked; unclear error message.
- Fix approach: Add a pre-push hook that checks if any `package.json` changed but `pnpm-lock.yaml` wasn't. Fail with a message: "Run `pnpm install` and commit the lockfile."

**Migrations are not auto-applied to production:**
- Issue: The README notes that migrations must be applied manually or via the Supabase dashboard. If a developer creates a migration but forgets to apply it before deploying the backend, the code expects a table that doesn't exist and crashes.
- Files: `supabase/migrations/`
- Impact: Production outage; unclear error message.
- Fix approach: Add a startup check to the backend: `SELECT * FROM information_schema.tables WHERE table_name='...'` for each critical table. If missing, log a critical error and refuse to start: "Please apply migrations."

---

*Concerns audit: 2026-03-24*
