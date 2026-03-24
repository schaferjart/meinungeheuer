# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
meinungeheuer/
├── apps/
│   ├── tablet/              # React/Vite kiosk app (visitor-facing)
│   ├── backend/             # Hono API server (Node.js)
│   ├── config/              # Admin dashboard (vanilla TS/Vite)
│   ├── archive/             # Public definitions archive (vanilla TS/Vite)
│   ├── print-renderer/      # Cloud image rendering service (Python/FastAPI)
│   ├── printer-bridge/      # Local print queue daemon (Node.js)
│   └── pos-server/          # Local thermal printer server (Python/Flask)
├── packages/
│   ├── shared/              # Types, Supabase client, programs, constants
│   ├── karaoke-reader/      # Audio-synchronized text highlighting library
│   └── core/                # Dist-only package (compiled artifacts, no source)
├── supabase/                # Schema migrations
├── docs/                    # PRD, build prompts
├── scripts/                 # Utility scripts
├── tools/                   # Dev tooling
├── pnpm-workspace.yaml      # Workspace config
├── tsconfig.base.json       # Base TS config shared by all apps
└── CLAUDE.md                # Project instructions
```

## App Directories

### `apps/tablet/`

React/Vite SPA running in kiosk mode on an iPad.

```
apps/tablet/
├── src/
│   ├── App.tsx                              # Root component, orchestrates all side effects
│   ├── main.tsx                             # Entry point (React DOM render)
│   ├── index.css                            # Tailwind v4 base styles
│   ├── vite-env.d.ts                        # Vite env type declarations
│   │
│   ├── components/
│   │   ├── CameraDetector.tsx               # Face detection loop (MediaPipe), hidden video
│   │   ├── ScreenTransition.tsx             # Fade animation wrapper between screens
│   │   ├── TextReader.tsx                   # Wrapper for karaoke-reader in text_display screen
│   │   └── screens/
│   │       ├── SleepScreen.tsx              # Idle state, tap-to-wake
│   │       ├── WelcomeScreen.tsx            # Greeting, language selection
│   │       ├── ConsentScreen.tsx            # GDPR voice clone consent (voice_chain only)
│   │       ├── TextDisplayScreen.tsx        # Karaoke text reading (aphorism program)
│   │       ├── TermPromptScreen.tsx         # Shows term before conversation
│   │       ├── ConversationScreen.tsx       # Live conversation, transcript display
│   │       ├── SynthesizingScreen.tsx       # Transitional "thinking" screen
│   │       ├── DefinitionScreen.tsx         # Shows generated aphorism/definition
│   │       ├── PrintingScreen.tsx           # Waiting for print confirmation
│   │       └── FarewellScreen.tsx           # Goodbye screen, shows definition summary
│   │
│   ├── hooks/
│   │   ├── useInstallationMachine.ts        # Central state machine (useReducer)
│   │   ├── useInstallationMachine.test.ts   # State machine unit tests
│   │   ├── useConversation.ts               # ElevenLabs SDK wrapper
│   │   ├── useConversation.test.ts          # Conversation hook tests
│   │   ├── usePortraitCapture.ts            # Camera frame capture + upload to renderer
│   │   ├── usePortraitCapture.test.ts       # Portrait capture tests
│   │   ├── useAudioCapture.ts               # MediaRecorder for voice chain audio
│   │   └── useFaceDetection.ts              # MediaPipe face detection (used by CameraDetector)
│   │
│   ├── lib/
│   │   ├── api.ts                           # fetchConfig, startSession, submitVoiceChainData
│   │   ├── persist.ts                       # persistDefinition, persistPrintJob, persistTranscript, uploadBlurredPortrait
│   │   ├── supabase.ts                      # Supabase anon client factory (singleton)
│   │   ├── supabaseCacheAdapter.ts          # Supabase-backed cache for TTS audio
│   │   ├── configContext.ts                 # RuntimeConfig React context + defaults
│   │   ├── audioUnlock.ts                   # iOS audio unlock on first tap
│   │   ├── fullscreen.ts                    # PWA fullscreen request helper
│   │   ├── fullscreen.test.ts               # Fullscreen utility tests
│   │   ├── firstMessage.ts                  # (legacy, superseded by program.buildFirstMessage)
│   │   ├── systemPrompt.ts                  # (legacy, superseded by program.buildSystemPrompt)
│   │   ├── systemPrompt.test.ts             # System prompt tests
│   │   └── portraitBlur.ts                  # Canvas-based CSS blur of portrait blob
│   │
│   └── pages/
│       └── Admin.tsx                        # Admin dashboard (accessed via ?admin=true)
├── index.html
├── vite.config.ts
├── tsconfig.json
└── .env.example                             # VITE_BACKEND_URL, VITE_ELEVENLABS_AGENT_ID, etc.
```

### `apps/backend/`

Hono API server deployed to Coolify (Docker).

```
apps/backend/
├── src/
│   ├── app.ts                               # Hono app setup, middleware, route mounting
│   ├── index.ts                             # Node.js entry point (serve app on port 3001)
│   ├── routes/
│   │   ├── config.ts                        # GET /api/config, POST /api/config/update, GET /api/definitions, GET /api/chain
│   │   ├── session.ts                       # POST /api/session/start
│   │   ├── voiceChain.ts                    # POST /api/voice-chain/process, GET /api/voice-chain/latest, POST /api/voice-chain/apply-voice
│   │   └── webhook.ts                       # POST /webhook (ElevenLabs save_definition webhook)
│   └── services/
│       ├── supabase.ts                      # Supabase service role client (singleton)
│       ├── chain.ts                         # getActiveChainContext(), getChainHistory()
│       ├── embeddings.ts                    # OpenAI embedding generation
│       └── voiceChain.ts                    # cloneVoice, extractSpeechProfile, generateIcebreaker, processVoiceChain, getLatestVoiceChainState
├── Dockerfile
├── package.json
└── .env.example
```

### `apps/config/`

Admin dashboard (Supabase-auth-gated, deployed to Coolify).

```
apps/config/
├── src/
│   ├── main.ts                              # Entry point: auth, tab routing, connection dots
│   ├── tabs/
│   │   ├── programs.ts                      # Programs tab: configure active program, text, term
│   │   ├── workbench.ts                     # Workbench tab: print preview, portrait tuner, image tools
│   │   └── system.ts                        # System tab: face detection timers, voice settings, display
│   └── lib/
│       ├── supabase.ts                      # Supabase client + auth helpers (signIn, signOut, getSession)
│       ├── render-api.ts                    # Calls to print-renderer endpoints from browser
│       ├── tablet-preview.ts                # Tablet simulator preview panel
│       └── forms.ts                         # Form rendering helpers
├── public/
│   └── portrait-tuner.html                  # Standalone portrait crop tuner tool
├── index.html
├── nginx.conf                               # nginx config for Docker deployment
├── Dockerfile
└── vite.config.ts
```

### `apps/archive/`

Public definitions archive. Hash-based routing (`#/definition/{id}`).

```
apps/archive/
├── src/
│   ├── main.ts                              # Full SPA: fetchDefinitions, fetchTurns, renderList, renderSingle
│   ├── supabase.ts                          # Supabase anon client
│   ├── styles.css                           # Archive styles
│   └── vite-env.d.ts
├── index.html
├── Dockerfile
└── vite.config.ts
```

### `apps/print-renderer/`

Cloud Python/FastAPI service. Deployed to Coolify via Docker.

```
apps/print-renderer/
├── main.py                                  # FastAPI app: /render/dictionary, /render/dither, /render/portrait-preview, /render/markdown, /render/slice, /process/portrait
├── templates.py                             # render_dictionary_image() — PIL text layout for thermal cards
├── pipeline.py                              # detect_face_landmarks() (MediaPipe), process_portrait(), transform_to_statue_bytes() (n8n style transfer)
├── dithering.py                             # _prepare(), dither_image() (Floyd-Steinberg, Bayer)
├── md_renderer.py                           # render_markdown() — markdown to PIL image
├── helpers.py                               # open_image() utility
├── supabase_config.py                       # get_render_config(), get_active_template(), _row_to_config() — reads config.yaml + Supabase render_config table
├── config.yaml                              # Font paths, halftone settings, portrait params
└── requirements.txt                         # fastapi, uvicorn, Pillow, supabase-py, mediapipe, python-dotenv
```

### `apps/printer-bridge/`

Local Node.js daemon. Runs on Pi/laptop, NOT deployed to cloud.

```
apps/printer-bridge/
├── src/
│   ├── index.ts                             # Main: poll pending jobs, Supabase Realtime subscribe, graceful shutdown
│   ├── printer.ts                           # renderAndPrint() (text cards), printPortrait() (portrait batches), buildTestPayload()
│   ├── config.ts                            # loadConfig() — reads env vars (SUPABASE_URL, POS_SERVER_URL, PRINT_RENDERER_URL, RENDER_API_KEY)
│   ├── config.test.ts                       # Config loading tests
│   ├── printer.test.ts                      # Printer function tests
│   └── test-print.ts                        # CLI script to send a test print job
├── printer-bridge.service                   # systemd unit file for Pi autostart
├── package.json
└── .env.example
```

### `apps/pos-server/`

Local Python/Flask server. Runs on Pi. Handles ESC/POS printing.

```
apps/pos-server/
├── print_server.py                          # Flask server: POST /print (single image), POST /print/batch (multiple images), GET /health
├── printer_core.py                          # load_config(), connect(), validate_config() — ESC/POS driver wrapper
├── config.yaml                              # printer type, port, paper width
├── fonts/                                   # Acidic.TTF, Burra-Bold.ttf, Burra-Thin.ttf
├── pos-server.service                       # systemd unit file for Pi autostart
├── requirements.txt                         # flask, flask-cors, python-escpos, Pillow
└── setup.sh                                 # Pi setup script
```

## Package Directories

### `packages/shared/`

All TypeScript apps import from `@meinungeheuer/shared`.

```
packages/shared/
├── src/
│   ├── index.ts                             # Re-exports everything
│   ├── types.ts                             # All Zod schemas: Session, Turn, Definition, PrintQueueRow, ChainState, InstallationConfig, Text, SpeechProfile, VoiceChainState, PrintPayload, PortraitPrintPayload, SaveDefinitionPayload
│   ├── constants.ts                         # DEFAULT_TERM, DEFAULT_MODE, FACE_DETECTION, TIMERS, PRINTER
│   ├── voiceChainConfig.ts                  # VOICE_CLONE, SPEECH_PROFILE_EXTRACTION, ICEBREAKER_GENERATION, PORTRAIT, COLD_START, STYLE_INFLUENCE
│   ├── supabase.ts                          # createSupabaseClient() factory (used by all apps)
│   └── programs/
│       ├── types.ts                         # ConversationProgram interface, StageConfig, PrintLayout, ResultDisplay, PromptParams
│       ├── index.ts                         # REGISTRY, getProgram(id), listPrograms()
│       ├── aphorism.ts                      # aphorismProgram — text reading + aphorism output
│       ├── free-association.ts              # freeAssociationProgram — open ended, no text
│       ├── voice-chain.ts                   # voiceChainProgram — cloned voice, speech style transfer
│       ├── index.test.ts                    # Registry tests
│       └── free-association.test.ts         # Free association program tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### `packages/karaoke-reader/`

Standalone publishable library for audio-synchronized text highlighting.

```
packages/karaoke-reader/
├── src/
│   ├── index.ts                             # Public API: types, utilities, cache, hooks, KaraokeReader component
│   ├── types.ts                             # WordTimestamp, AlignmentData, TtsStatus, ParsedWord, ParsedLine, CacheAdapter
│   ├── styles.css                           # KaraokeReader CSS (highlight animations)
│   ├── components/
│   │   ├── KaraokeReader.tsx                # React component: renders paragraphs + word spans with highlight class
│   │   └── KaraokeReader.test.tsx           # Component tests
│   ├── hooks/
│   │   ├── useKaraokeReader.ts              # Orchestrator: audio lifecycle, status machine, play/pause/toggle, volume, autoplay
│   │   ├── useKaraokeReader.test.ts         # Hook tests
│   │   ├── useAudioSync.ts                  # rAF loop: binary search on timestamps → activeWordIndex
│   │   ├── useAudioSync.test.ts             # Sync tests
│   │   ├── useAutoScroll.ts                 # Scrolls container to keep active word visible
│   │   ├── useAutoScroll.test.ts            # Scroll tests
│   │   └── index.ts                         # Re-exports all hooks
│   ├── adapters/
│   │   └── elevenlabs/
│   │       ├── index.ts                     # Converts ElevenLabs character-level alignment → WordTimestamp[]
│   │       └── index.test.ts                # Adapter tests
│   ├── cache.ts                             # createMemoryCache(), createLocalStorageCache() — TTS audio caching
│   ├── cache.test.ts                        # Cache tests
│   ├── utils/
│   │   ├── buildWordTimestamps.ts           # Merges character timestamps into word-level timestamps
│   │   ├── buildWordTimestamps.test.ts
│   │   ├── splitTextIntoChunks.ts           # Splits long text for ElevenLabs API chunking
│   │   ├── splitTextIntoChunks.test.ts
│   │   ├── markdown.ts                      # stripMarkdownForTTS(), parseMarkdownText(), parseContentToWords()
│   │   ├── markdown.test.ts
│   │   ├── computeCacheKey.ts               # SHA-256 hash of text + config for cache keys
│   │   ├── computeCacheKey.test.ts
│   │   └── index.ts                         # Re-exports
│   └── test-utils/
│       ├── mock-audio.ts                    # HTMLAudioElement mock for tests
│       └── setup.ts                         # Vitest setup
├── package.json
├── tsconfig.json
├── tsup.config.ts                           # Build config (tsup)
├── vitest.config.ts
└── biome.json                               # Linting (biome, not eslint)
```

### `packages/core/`

**Source code does not exist.** Only `dist/` artifacts are present (compiled JS + `.d.ts` maps). Contains compiled artifacts for `machine/installationReducer`, `tts/timestamps`, `audio/types`. This was a previous package — functionality has been migrated into `apps/tablet/src/hooks/` and `packages/karaoke-reader/`. Do not add new source files here.

## Key File Locations

**Entry Points:**
- `apps/tablet/src/main.tsx` — Tablet React mount
- `apps/backend/src/index.ts` — Backend HTTP server
- `apps/printer-bridge/src/index.ts` — Printer queue daemon
- `apps/pos-server/print_server.py` — Local POS HTTP server
- `apps/print-renderer/main.py` — Cloud rendering FastAPI server
- `apps/config/src/main.ts` — Admin dashboard entry
- `apps/archive/src/main.ts` — Archive SPA entry

**Shared Types (read before adding any new fields to DB or API):**
- `packages/shared/src/types.ts` — All Zod schemas + TS types
- `packages/shared/src/programs/types.ts` — ConversationProgram interface

**Program Definitions:**
- `packages/shared/src/programs/aphorism.ts`
- `packages/shared/src/programs/free-association.ts`
- `packages/shared/src/programs/voice-chain.ts`
- `packages/shared/src/programs/index.ts` — registry + `getProgram()`

**State Machine:**
- `apps/tablet/src/hooks/useInstallationMachine.ts`

**Conversation Hook:**
- `apps/tablet/src/hooks/useConversation.ts`

**Persistence (tablet-side, fire-and-forget):**
- `apps/tablet/src/lib/persist.ts`

**API client (tablet → backend):**
- `apps/tablet/src/lib/api.ts`

**Voice Chain Processing (backend orchestrator):**
- `apps/backend/src/services/voiceChain.ts`

**Print Queue Processing (bridge):**
- `apps/printer-bridge/src/index.ts` — subscribe + poll
- `apps/printer-bridge/src/printer.ts` — render + send to POS

**Print Card Rendering:**
- `apps/print-renderer/templates.py` — dictionary card PIL layout
- `apps/print-renderer/pipeline.py` — portrait processing

## Naming Conventions

**Files:**
- React components: PascalCase (`ConversationScreen.tsx`, `KaraokeReader.tsx`)
- Hooks: camelCase with `use` prefix (`useInstallationMachine.ts`, `useConversation.ts`)
- Utilities/libraries: camelCase (`persist.ts`, `api.ts`, `fullscreen.ts`)
- Test files: co-located, same name + `.test.ts` suffix (`useInstallationMachine.test.ts`)
- Python files: snake_case (`print_server.py`, `md_renderer.py`)

**Directories:**
- React screens: `components/screens/{StateName}Screen.tsx`
- Hooks: `hooks/use{Name}.ts`
- Utilities: `lib/{name}.ts`
- Backend routes: `routes/{domain}.ts`
- Backend services: `services/{domain}.ts`

**TypeScript:**
- Types/interfaces: PascalCase (`ConversationProgram`, `InstallationState`, `PrintPayload`)
- Constants: SCREAMING_SNAKE_CASE for module-level (`VOICE_CLONE`, `FACE_DETECTION`)
- Zod schemas: PascalCase + `Schema` suffix (`DefinitionSchema`, `PrintPayloadSchema`)

## Where to Add New Code

**New screen state:**
1. Add state name to `StateNameSchema` in `packages/shared/src/types.ts`
2. Add transitions in `apps/tablet/src/hooks/useInstallationMachine.ts`
3. Add screen component at `apps/tablet/src/components/screens/{StateName}Screen.tsx`
4. Add `case` in `App.tsx` `renderScreen()` switch

**New program:**
1. Create `packages/shared/src/programs/{name}.ts` implementing `ConversationProgram`
2. Add to `REGISTRY` in `packages/shared/src/programs/index.ts`
3. Test in `packages/shared/src/programs/index.test.ts`

**New backend route:**
1. Create `apps/backend/src/routes/{domain}.ts`
2. Mount in `apps/backend/src/app.ts`
3. Add corresponding fetch function in `apps/tablet/src/lib/api.ts`

**New Supabase table:**
1. Add Zod schema to `packages/shared/src/types.ts`
2. Create migration in `supabase/migrations/`
3. Apply via `mcp__supabase__apply_migration`
4. Verify schema with `mcp__supabase__execute_sql`

**New print template:**
1. Add template name to `PrintLayout` union in `packages/shared/src/programs/types.ts`
2. Add rendering logic in `apps/print-renderer/templates.py`
3. Add JSONB column to `render_config` if configurable
4. Add mapping in `apps/print-renderer/supabase_config.py` `_row_to_config()`
5. Add fallback section in `apps/print-renderer/config.yaml`

**New utility:**
- Tablet utilities: `apps/tablet/src/lib/{name}.ts`
- Shared cross-app utilities: `packages/shared/src/{name}.ts`
- Backend services: `apps/backend/src/services/{name}.ts`

## Special Directories

**`packages/shared/dist/`:**
- Purpose: Compiled output of `packages/shared`
- Generated: Yes (by `pnpm --filter @meinungeheuer/shared build`)
- Committed: Yes (force-added with `git add -f`) — required so Pi never needs to build

**`supabase/`:**
- Purpose: SQL migration files
- Generated: No
- Committed: Yes
- Note: Migrations NOT auto-applied; must run `mcp__supabase__apply_migration` manually

**`apps/pos-server/venv/` and `apps/print-renderer/venv/`:**
- Purpose: Python virtual environments
- Generated: Yes
- Committed: No (in .gitignore)

**`.planning/`:**
- Purpose: GSD planning documents and phase plans
- Generated: By GSD agents
- Committed: Yes

**`.claude/`:**
- Purpose: Claude Code agents, commands, worktrees, and memory
- Generated: By Claude Code
- Committed: Yes

---

*Structure analysis: 2026-03-24*
