# Technology Stack

## Languages & Runtime

- **Language:** TypeScript 5.7.3 (strict mode enabled)
- **Runtime:** Node.js 20.0.0+ (minimum specified in root `package.json`)
- **Module System:** ESM (type: "module" in all package.json files)
- **Bundler/Build:** Vite 6.1.0 (tablet), tsc (backend, printer-bridge, shared)

## Package Manager

- **pnpm** with workspace support (`pnpm-workspace.yaml`)
- **pnpm-lock.yaml** for reproducible installs
- Only built dependency: esbuild (configured in `onlyBuiltDependencies`)

## Monorepo Structure

```
apps/
  ├── tablet/           (React 18 web app, Vite, port 3000)
  ├── backend/          (Hono server, port 3001)
  └── printer-bridge/   (Node.js service, local execution)
packages/
  └── shared/           (Types, Supabase client, constants)
```

Each workspace has independent `package.json` and `tsconfig.json` (extends `tsconfig.base.json`).

## Frameworks & Libraries

### Tablet App (`@meinungeheuer/tablet`)

**Frontend Framework:**
- React 18.3.1
- react-dom 18.3.1

**Styling:**
- Tailwind CSS 4.0.7
- @tailwindcss/vite 4.0.7 (Vite plugin for CSS-first config)
- No CSS modules or styled-components; pure Tailwind utility classes

**UI & Interaction:**
- React hooks (useCallback, useEffect, useRef, useState, etc.)
- ScreenTransition component for animated state changes
- CameraDetector component for MediaPipe face detection

**Voice & Audio:**
- @11labs/react 0.2.0 (ElevenLabs Conversational AI SDK hook)
- @11labs/client 0.2.0 (ElevenLabs client library)
- @elevenlabs/client 0.15.0 (ElevenLabs REST client for TTS with-timestamps)

**Machine Vision:**
- @mediapipe/tasks-vision 0.10.18 (Face Detection API)

**State Management:**
- Custom state machine reducer (`useInstallationMachine.ts`)
- 9 screens: sleep → welcome → text_display → term_prompt → conversation → synthesizing → definition → printing → farewell

**Backend Communication:**
- fetch API (native, no HTTP client library)
- Supabase JS client for Realtime subscriptions

**Validation & Types:**
- zod 3.25.76 (runtime validation)
- TypeScript interfaces for API contracts

**Dev Tools:**
- @vitejs/plugin-react 4.3.4
- @types/react 18.3.18, @types/react-dom 18.3.5
- vitest 3.0.5 (unit testing)

### Backend (`@meinungeheuer/backend`)

**Framework:**
- hono 4.7.2 (lightweight HTTP server)
- @hono/node-server 1.14.0 (Hono Node.js adapter)

**Runtime Integration:**
- tsx 4.19.3 (TypeScript execution + watching)
- node 22.13.4+ (via @types/node)

**External APIs:**
- openai 4.82.0 (OpenRouter SDK for text embeddings via OpenAI SDK)

**Database:**
- @supabase/supabase-js 2.49.1 (Supabase PostgreSQL client)

**Validation:**
- zod 3.24.2 (schema validation for webhook payloads)

**Dev Tools:**
- typescript 5.7.3
- vitest 3.0.5 (minimal test runner, passWithNoTests mode)

### Printer Bridge (`@meinungeheuer/printer-bridge`)

**Hardware Interface:**
- node-thermal-printer 4.4.3 (ESC/POS thermal printer control)

**Database:**
- @supabase/supabase-js 2.49.1 (Realtime subscriptions for print_queue)

**Runtime:**
- tsx 4.19.3

**Validation:**
- zod 3.24.2

**Dev Tools:**
- typescript 5.7.3
- vitest 3.0.5

### Shared Package (`@meinungeheuer/shared`)

**Distribution:**
- Compiled to `dist/index.js` with type declarations (`dist/index.d.ts`)
- Exports via `exports` field (ESM import only)
- Built separately before other apps in the build order

**Content:**
- Zod schemas for all database types (Session, Turn, Definition, PrintQueueRow, etc.)
- Supabase client factory
- Shared constants (printer config, timeouts, etc.)
- Shared types (Mode, Role, StateName, etc.)

**Dependencies:**
- @supabase/supabase-js 2.49.1
- zod 3.24.2

## Build Tools & Configuration

### TypeScript Configuration

**Base:** `tsconfig.base.json`
- Target: ES2022
- Module: ESNext
- Module resolution: bundler
- Strict mode enabled
  - noUncheckedIndexedAccess: true
  - noUnusedLocals: true
  - noUnusedParameters: true
- Declaration maps and source maps enabled
- Isolation: isolatedModules

**Per-workspace overrides:**
- Tablet: lib=["ES2022", "DOM", "DOM.Iterable"], jsx="react-jsx", noEmit=true
- Backend: outDir="./dist", rootDir="./src", lib=["ES2022"]
- Printer-bridge: outDir="./dist", rootDir="./src", lib=["ES2022"]
- Shared: outDir="./dist", rootDir="./src" (publishes dist/)

### Build Order

Enforced in root package.json:
```
pnpm build
  1. pnpm --filter @meinungeheuer/shared build
  2. pnpm -r --filter '!@meinungeheuer/shared' build
```

This ensures shared types are available before other apps compile.

### Vite Configuration (Tablet)

**File:** `apps/tablet/vite.config.ts`
```typescript
defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000 }
})
```

- React plugin for fast refresh
- Tailwind CSS v4 plugin (CSS-first)
- Development server on port 3000
- Default SPA mode (HTML entry point: `index.html`)

### Environment Variables

**.env.example files define shapes:**

**Tablet (`VITE_` prefix for client-side):**
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_ELEVENLABS_API_KEY
- VITE_ELEVENLABS_AGENT_ID
- VITE_ELEVENLABS_VOICE_ID
- VITE_BACKEND_URL (default: http://localhost:3001)

**Backend (server-side):**
- PORT (default: 3001)
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- OPENROUTER_API_KEY (for embeddings via openai/text-embedding-3-small)
- WEBHOOK_SECRET (shared with ElevenLabs config)

**Printer Bridge:**
- SUPABASE_URL, SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY)
- PRINTER_CONNECTION (e.g., "usb")
- PRINTER_VENDOR_ID, PRINTER_PRODUCT_ID
- PRINTER_MAX_WIDTH_CHARS, PRINTER_MAX_WIDTH_MM
- PRINTER_CHARSET (default: UTF-8)
- PRINTER_AUTO_CUT (boolean)

## Key Dependencies by Version

### Core Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| react | 18.3.1 | UI framework |
| react-dom | 18.3.1 | React DOM renderer |
| typescript | 5.7.3 | Language & type checking |
| zod | 3.24.2–3.25.76 | Runtime schema validation |

### Tablet Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| @11labs/react | 0.2.0 | ElevenLabs Conversational AI hook |
| @11labs/client | 0.2.0 | ElevenLabs SDK |
| @elevenlabs/client | 0.15.0 | ElevenLabs REST client (TTS timestamps) |
| @mediapipe/tasks-vision | 0.10.18 | Face Detection |
| @tailwindcss/vite | 4.0.7 | Tailwind CSS v4 Vite plugin |
| tailwindcss | 4.0.7 | CSS utility framework |
| vite | 6.1.0 | Frontend bundler & dev server |
| @vitejs/plugin-react | 4.3.4 | Vite React plugin |
| @supabase/supabase-js | 2.49.1 | Supabase client (Realtime) |

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| hono | 4.7.2 | HTTP server framework |
| @hono/node-server | 1.14.0 | Hono Node.js adapter |
| openai | 4.82.0 | OpenRouter embeddings client |
| @supabase/supabase-js | 2.49.1 | Supabase PostgreSQL client |
| tsx | 4.19.3 | TypeScript execution engine |

### Printer Bridge

| Package | Version | Purpose |
|---------|---------|---------|
| node-thermal-printer | 4.4.3 | ESC/POS printer driver |
| @supabase/supabase-js | 2.49.1 | Realtime print_queue subscription |
| tsx | 4.19.3 | TypeScript execution engine |

### Development & Testing

| Package | Version | Purpose |
|---------|---------|---------|
| vitest | 3.0.5 | Test runner |
| @types/node | 22.13.4 | Node.js type definitions |
| @types/react | 18.3.18 | React type definitions |
| @types/react-dom | 18.3.5 | React DOM type definitions |

## Important Build & Runtime Notes

- **ESM-only codebase:** No CommonJS; `"type": "module"` in all package.json files
- **Strict TypeScript:** No `any` types; noUnusedLocals and noUnusedParameters enforced
- **Shared package first:** Must be built before other apps (`pnpm build` enforces this)
- **Vite v6:** Uses native ESM import/export, no CJS fallbacks needed
- **Tailwind v4:** CSS-first configuration via @tailwindcss/vite plugin; different from v3 API
- **Face detection:** Runs in the browser (MediaPipe); optional with tap-to-start fallback
- **Printer bridge:** Local Node.js process; not deployed to cloud
