# Codebase Concerns

**Analysis Date:** 2026-03-24

---

## Tech Debt

**Dead package: `packages/core/`**
- Issue: A `packages/core` package exists with compiled output (`dist/`) for `installationReducer`, `systemPrompt`, `firstMessage`, `tts/timestamps`, `api/client`, `conversation/types`. Zero source files remain — only dist + node_modules. Nothing in the monorepo imports from it.
- Files: `packages/core/dist/`, `packages/core/node_modules/`
- Impact: Confusing directory presence, node_modules consumed unnecessarily, pnpm install must process it.
- Fix approach: Delete `packages/core/` entirely. Verify `pnpm-workspace.yaml` glob `packages/*` no longer picks it up after removal.

**Deprecated prompt builders kept alive by tests**
- Issue: `apps/tablet/src/lib/systemPrompt.ts` and `apps/tablet/src/lib/firstMessage.ts` are both `@deprecated` — they exist only for backward compat with tests. Production code has fully migrated to `program.buildSystemPrompt()` / `program.buildFirstMessage()` in `useConversation.ts`. However the deprecated files are 320+ lines of prompt logic that will silently diverge from the live program implementations over time.
- Files: `apps/tablet/src/lib/systemPrompt.ts`, `apps/tablet/src/lib/firstMessage.ts`, `apps/tablet/src/lib/systemPrompt.test.ts`
- Impact: Tests pass against the old implementations, not the programs that actually run. A change to `packages/shared/src/programs/aphorism.ts` will not be caught by those tests.
- Fix approach: Migrate `systemPrompt.test.ts` to test `aphorismProgram.buildSystemPrompt()` directly. Delete deprecated files.

**`blurredPortraitBlobRef` is declared but never populated**
- Issue: In `apps/tablet/src/App.tsx` line 103, `blurredPortraitBlobRef` is declared as a voice-chain feature ref. It is reset to null (line 442) but is never assigned a blob value — the actual `captureBlurredPortrait` import from `portraitBlur.ts` is imported but never called anywhere in `App.tsx`. The `portraitBlurredUrl` passed to `submitVoiceChainData` is hardcoded to `null` (line 266).
- Files: `apps/tablet/src/App.tsx`, `apps/tablet/src/lib/portraitBlur.ts`
- Impact: The blurred portrait feature of the voice chain program is entirely non-functional. Every voice chain submission sends `portrait_blurred_url: null`. The `uploadBlurredPortrait` function in `persist.ts` is also dead — never called.
- Fix approach: Wire `captureBlurredPortrait(videoRef, ...)` into the portrait capture effect when `programRef.current.id === 'voice_chain'`. Store result in `blurredPortraitBlobRef`. Pass to `submitVoiceChainData`.

**`portraits-blurred` storage bucket has no migration**
- Issue: `apps/tablet/src/lib/persist.ts` uploads to a `portraits-blurred` Supabase storage bucket, but no migration creates this bucket. The only storage migration (`011_prints_storage.sql`) creates the `prints` bucket only.
- Files: `apps/tablet/src/lib/persist.ts:101-104`, `supabase/migrations/011_prints_storage.sql`
- Impact: `uploadBlurredPortrait()` will silently fail with a storage error. Fire-and-forget swallows the error so no alert fires.
- Fix approach: Add a migration that creates the `portraits-blurred` bucket with public read access, or remove the upload entirely if the feature is not needed.

**Schema split: config in two places simultaneously**
- Issue: `installation_config` was designed as the config store (migrations 002 and 012), but migration 013 adds a `programs` table with overlapping JSONB config for face detection, voice, portrait, and timing. The backend `/api/config` reads from `installation_config` columns AND the `programs` table independently. The `config app` writes to programs. The tablet reads from the backend which reads `installation_config`. A config change in the programs table does NOT propagate through `/api/config` response — the backend only looks up `voice_chain_config`, `faceDetection`, etc. from `installation_config` columns.
- Files: `apps/backend/src/routes/config.ts`, `supabase/migrations/012_config_tables.sql`, `supabase/migrations/013_programs.sql`
- Impact: Config changes made via the programs UI may be silently ignored by the tablet. There is no source of truth.
- Fix approach: Decide on one config authority. Either have `/api/config` merge program JSONB config over `installation_config` columns, or deprecate `installation_config` columns in favor of programs.

**Screen timer constants bypass runtime config**
- Issue: All screen components use `TIMERS.*` from `@meinungeheuer/shared` constants directly:
  - `DefinitionScreen.tsx:20` — `TIMERS.DEFINITION_DISPLAY_MS`
  - `FarewellScreen.tsx:16` — `TIMERS.FAREWELL_DURATION_MS`
  - `WelcomeScreen.tsx:22` — `TIMERS.WELCOME_DURATION_MS`
  - `TermPromptScreen.tsx:15` — `TIMERS.TERM_PROMPT_DURATION_MS`
  - `PrintingScreen.tsx:20,42` — `TIMERS.PRINT_TIMEOUT_MS`

  The backend sends `timers: { welcomeMs, farewellMs, ... }` in `/api/config` and `App.tsx` stores them in `runtimeConfig`. But `useRuntimeConfig()` is only consumed by `TextReader.tsx`. All other screens ignore the runtime timers entirely.
- Files: `apps/tablet/src/components/screens/*.tsx`, `apps/tablet/src/lib/configContext.ts`
- Impact: Timer overrides from the database have no effect. The operator can change timer values in `installation_config` but the tablet will always use the hardcoded defaults.
- Fix approach: Each screen should call `useRuntimeConfig()` and use `config.timers.*` rather than `TIMERS.*`.

**Hardcoded default ElevenLabs voice ID in production code**
- Issue: `apps/tablet/src/hooks/useConversation.ts:163` has a hardcoded voice ID `'DLsHlh26Ugcm6ELvS0qi'` used to "restore default agent voice" after a voice clone session ends.
- Files: `apps/tablet/src/hooks/useConversation.ts:163`
- Impact: If the agent's default voice is ever changed in the ElevenLabs dashboard, the restoration will silently set a wrong voice. This could persist across sessions if the next visitor gets a conversation with the previous visitor's default voice instead of the current default.
- Fix approach: Pull the default voice ID from `VITE_ELEVENLABS_VOICE_ID` env var or from the runtime config returned by `/api/config`.

**`scripts/import-conversations.mjs` contains a hardcoded service role key**
- Issue: The script at `scripts/import-conversations.mjs` has a hardcoded Supabase URL and **service role JWT** (REDACTED from this doc). This is a service role key with full database bypass access embedded directly in the source file and committed to git.
- Files: `scripts/import-conversations.mjs:2-4`
- Impact: The service role key is exposed in the git history. Anyone with repository access can use it to read, write, or delete all Supabase data including the `secrets` table. This is the highest-priority security concern in the codebase.
- Fix approach: Revoke and rotate the Supabase service role key immediately. Rewrite the script to read credentials from env vars (`process.env.SUPABASE_URL`, `process.env.SUPABASE_SERVICE_ROLE_KEY`). Add the script to `.gitignore` or replace the key with a placeholder.

---

## Security Concerns

**Hardcoded Supabase service role key in git history**
- Risk: Full RLS bypass on production Supabase instance.
- Files: `scripts/import-conversations.mjs:2-4`
- Current mitigation: None.
- Recommendations: (1) Rotate the key immediately in the Supabase dashboard. (2) Audit git history for any other secrets. (3) Move to environment variable pattern.

**Backend CORS wildcard `origin: '*'`**
- Risk: Any webpage can make credentialed requests to the backend API.
- Files: `apps/backend/src/app.ts:18-19`
- Current mitigation: Some admin endpoints protected by `WEBHOOK_SECRET`. Voice chain `/process` endpoint has no auth check.
- Recommendations: Restrict CORS origin to known tablet/config origins in production. Add authentication middleware to `/api/voice-chain/process`.

**`/api/voice-chain/process` is unauthenticated**
- Risk: Any caller can submit audio and transcript to the voice chain processor, triggering ElevenLabs API calls (which cost money) and writing to `voice_chain_state`.
- Files: `apps/backend/src/routes/voiceChain.ts:30-80`
- Current mitigation: The endpoint requires `session_id` and `audio` but performs no token check.
- Recommendations: Apply `WEBHOOK_SECRET` middleware to this route as is done for the definition webhook and admin endpoints.

**Backend admin config endpoint bypasses auth when `WEBHOOK_SECRET` unset**
- Risk: Without `WEBHOOK_SECRET` set, `POST /api/config/update` is fully open — anyone can change mode/term.
- Files: `apps/backend/src/routes/config.ts:21-24`
- Current mitigation: Only a concern if `WEBHOOK_SECRET` is absent. CLAUDE.md warns about this.
- Recommendations: Ensure `WEBHOOK_SECRET` is always set in production. Consider making it mandatory (throw at startup) rather than optional.

**`?admin=true` in tablet URL exposes admin panel**
- Risk: The admin panel is accessible to anyone who knows the URL pattern. The `secret` param is optional when `WEBHOOK_SECRET` is unset.
- Files: `apps/tablet/src/App.tsx:56-57`, `apps/tablet/src/pages/Admin.tsx:25`
- Current mitigation: In production `WEBHOOK_SECRET` is set; requests without it return 401.
- Recommendations: Document that `WEBHOOK_SECRET` is mandatory in production. Consider redirecting `?admin=true` without `secret` to a 401 page rather than showing the UI.

**Config app `secrets` table stores API keys in Supabase**
- Risk: Secrets stored in the `secrets` table (ElevenLabs key, OpenRouter key, etc.) are accessible to any authenticated user of the config app.
- Files: `apps/config/src/tabs/system.ts`, `supabase/migrations/012_config_tables.sql:81-100`
- Current mitigation: RLS restricts `secrets` to `authenticated` role only. Not anon-readable.
- Recommendations: This is acceptable for an operator-only config app, but ensure the Supabase auth is not configured with "anyone can sign up" enabled.

---

## Known Bugs

**`FACE_LOST` action only resets from `farewell` state — not from other active screens**
- Symptoms: If a visitor walks away mid-conversation or mid-text-display, the installation stays on the current screen indefinitely. `FACE_LOST` is handled only for `farewell → sleep`. All other screens ignore it.
- Files: `apps/tablet/src/hooks/useInstallationMachine.ts:185-188`
- Trigger: Visitor face disappears during conversation, text_display, synthesizing, definition, or printing.
- Workaround: Manual tap on sleep screen or restart.

**Dual definition persistence path with race condition potential**
- Symptoms: `save_definition` fires as both a client tool (browser → Supabase directly) AND a webhook (ElevenLabs → backend → Supabase). Both paths try to insert the same definition. The client path uses a client-generated UUID (`crypto.randomUUID()`); the webhook generates a new UUID server-side. Result: two separate definition rows for the same conversation.
- Files: `apps/tablet/src/lib/persist.ts:7-38`, `apps/backend/src/routes/webhook.ts:70-110`
- Trigger: Every successful conversation where `save_definition` is a configured webhook tool.
- Workaround: The code comments acknowledge both paths coexist. The duplicate error (`code === '23505'`) is caught but only relevant if the webhook and client use the same UUID, which they do not.

**Consent declining skips audio submission but voice chain recording still runs**
- Symptoms: When a visitor declines voice clone consent, `stopRecording()` is still called. The audio recording ran the whole conversation. The check `state.voiceCloneConsent === false` prevents submission but the microphone was open for the full session regardless.
- Files: `apps/tablet/src/App.tsx:255-257`, `apps/tablet/src/hooks/useAudioCapture.ts`
- Impact: Minor GDPR concern — audio is captured before consent check, though not transmitted.
- Fix approach: Either cancel recording immediately on `CONSENT_DECLINED` dispatch, or do not start recording until consent is accepted.

**Config workbench renderer URL defaults to `localhost:8000`**
- Symptoms: When `print_renderer_url` is not set in `installation_config`, the workbench tab falls back to `http://localhost:8000`. This means the config app running in a browser or on Coolify will always fail renderer previews unless the operator also runs the renderer locally.
- Files: `apps/config/src/tabs/workbench.ts:467`
- Trigger: Any operator using the hosted config app without a local renderer.

---

## Fragile Areas

**Voice clone agent patching is a shared global mutation**
- Files: `apps/tablet/src/hooks/useConversation.ts:196-211`, `apps/backend/src/routes/voiceChain.ts:85-120`
- Why fragile: `apply-voice` PATCHes the ElevenLabs agent to apply a cloned voice. This is a global mutation on the single agent. If two sessions start simultaneously (impossible in practice but possible in testing), they would race on the agent voice. The restoration PATCH in `onDisconnect` is also a fire-and-forget void fetch — if it fails, the next visitor gets the previous visitor's voice.
- Safe modification: Never call `apply-voice` without also verifying the restoration completes. Consider logging the `apply-voice` calls to a DB table for auditability.
- Test coverage: None.

**`persistPrintJob` uses a `count(sessions)` query for `session_number` but doesn't lock**
- Files: `apps/tablet/src/lib/persist.ts:60-69`
- Why fragile: The session count is read then used as `session_number` in the print payload. Under concurrent visitors this count can be stale, producing duplicate session numbers on printed cards.
- Safe modification: Use a sequence or trigger in Postgres rather than reading count client-side.

**`programs` table seeded with `ON CONFLICT (id) DO NOTHING` — config drifts silently**
- Files: `supabase/migrations/013_programs.sql:37-153`
- Why fragile: The seed uses `ON CONFLICT (id) DO NOTHING`, so any existing row is never updated when the migration re-runs. If the default program configs change in the migration file, production will silently keep the old values.
- Fix approach: Use `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, pipeline = EXCLUDED.pipeline, config = EXCLUDED.config` for seed rows, or add a separate script to refresh seeds.

**`App.tsx` is 555 lines — all orchestration in one component**
- Files: `apps/tablet/src/App.tsx`
- Why fragile: Conversations, portrait capture, audio recording, config fetching, definition persistence, print job enqueue, voice chain state, and consent logic all live in one React component. Multiple `useRef` guards (`configFetchedRef`, `conversationStartedRef`, `audioRecordingStartedRef`, `printJobFiredRef`, `portraitCapturedRef`) prevent double-firing — adding any new effect risks triggering existing guards incorrectly.
- Safe modification: Use consistent guard pattern (check the ref before and reset on leave), always add the guard ref to the cleanup block.
- Test coverage: No unit tests for `App.tsx` itself — only state machine and hooks are tested.

---

## Performance Bottlenecks

**TTS cache adapter makes two Supabase round trips per cache hit**
- Problem: `supabaseCacheAdapter.ts` fetches the TTS audio data with a `select` then the component checks if it exists. For a cache miss, at minimum two network calls occur before ElevenLabs TTS is even attempted.
- Files: `apps/tablet/src/lib/supabaseCacheAdapter.ts`
- Cause: Architecture mismatch — karaoke-reader's cache interface was designed for local storage.

**`/api/config` makes 3-5 Supabase queries sequentially on every request**
- Problem: `config.ts` does: `installation_config` select, `prompts` select, optionally `texts` select, optionally chain state fetch, optionally dynamic import + `voice_chain_state` select. All sequential, no batching.
- Files: `apps/backend/src/routes/config.ts:55-190`
- Cause: Organic feature accretion.
- Improvement path: Parallelize with `Promise.all` for the independent fetches (prompts + installation_config can run together, texts + chain state can run together). Consider caching the config response for ~30s since it changes only when an operator edits it.

---

## Scaling Limits

**`voice_chain_state` rows accumulate without cleanup**
- Current capacity: No deletion policy on old voice chain rows.
- Limit: ElevenLabs instant voice clones are charged per creation. Old clones are never deleted from ElevenLabs either (the `deleteVoiceClone` function exists in `apps/backend/src/services/voiceChain.ts` but its call site is unclear).
- Scaling path: Add a cron or trigger to delete ElevenLabs voice clones after 2 chain positions and mark `voice_clone_status = 'deleted'`.

---

## Dependencies at Risk

**`@elevenlabs/react` pinned to exact `0.14.1` while `@elevenlabs/client` is `^0.15.0`**
- Risk: Potential version mismatch between the React wrapper and the underlying client library. The react package is pinned exact while client allows minor updates.
- Impact: SDK behavior changes if `@elevenlabs/client` auto-updates to a minor that breaks the `0.14.1` React wrapper.
- Files: `apps/tablet/package.json:14-15`
- Migration plan: Pin both to the same version family, or update `@elevenlabs/react` to match client.

**`google/gemini-3.1-flash-image-preview` model ID in `render_config`**
- Risk: This appears to be a pre-release model ID (`3.1-flash-image-preview`). Preview model IDs frequently change or are retired without notice.
- Files: `supabase/migrations/012_config_tables.sql:119`, `apps/print-renderer/config.yaml:71`
- Impact: Portrait style transfer fails silently when the model is retired.
- Migration plan: Monitor for deprecation; update in both `render_config` seed and `config.yaml`.

---

## Missing Critical Features

**Prompts table not seeded — fallback to TypeScript implementations**
- Problem: Migration 012 creates the `prompts` table but explicitly does NOT seed it: "Seed prompts are NOT included here — they are 200+ lines each." The tablet code in `useConversation.ts` calls `program.buildSystemPrompt()` directly, not from DB. The backend `/api/config` fetches from `prompts` table and passes it down, but the tablet ignores the `prompt` field from config.
- Blocks: Operators cannot change system prompts from the config UI without a developer deploying new TypeScript code.

**`archive.baufer.beauty` URL hardcoded in tablet**
- Problem: `DefinitionScreen.tsx:12` has `const ARCHIVE_BASE = 'https://archive.baufer.beauty/#/definition'` hardcoded. This URL is baked into every QR code generated on the definition screen.
- Files: `apps/tablet/src/components/screens/DefinitionScreen.tsx:12`
- Impact: Changing the archive domain requires a code change and redeployment.

---

## Test Coverage Gaps

**No test for voice chain consent-gate logic**
- What's not tested: The `CONSENT_ACCEPTED` / `CONSENT_DECLINED` action handling in `useInstallationMachine.ts` (lines 123-143), and the `state.voiceCloneConsent` guard in `App.tsx` that gates audio submission.
- Files: `apps/tablet/src/hooks/useInstallationMachine.test.ts`, `apps/tablet/src/App.tsx:255-258`
- Risk: Consent bypass could result in GDPR violations (submitting audio when consent was declined).
- Priority: High

**No test for `persistPrintJob`, `persistDefinition`, `persistTranscript`**
- What's not tested: All fire-and-forget Supabase persistence functions.
- Files: `apps/tablet/src/lib/persist.ts`
- Risk: Silent data loss bugs (e.g. wrong field mapping, session_id null when it shouldn't be) go undetected.
- Priority: Medium

**No tests for any backend routes**
- What's not tested: `apps/backend/src/routes/config.ts`, `webhook.ts`, `voiceChain.ts`, `session.ts`.
- Files: `apps/backend/src/routes/`
- Risk: The `/webhook/definition` duplicate definition path and chain state logic are untested. Regressions would only be caught in production.
- Priority: Medium

**No integration test for the program registry**
- What's not tested: `getProgram()` fallback behavior when an unknown program ID is passed. Returning the wrong program silently would result in wrong prompt construction.
- Files: `packages/shared/src/programs/index.ts`, `packages/shared/src/programs/index.test.ts`
- Priority: Low

---

*Concerns audit: 2026-03-24*
