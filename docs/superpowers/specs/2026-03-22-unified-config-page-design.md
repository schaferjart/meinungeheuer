# Unified Config Page — Design Spec

**Goal:** A unified control panel for the entire MeinUngeheuer installation. Reads and writes all configuration to Supabase. Absorbs all scattered config files, standalone HTML tools, and hardcoded constants into one operator workbench.

**Approach:** Minimal Vite app (`apps/config/`) with vanilla TypeScript — no React, no framework. Builds to static files deployable anywhere. Supabase email/password auth for access control. Tabbed interface with 5 tabs covering 100+ configurable values plus interactive tools.

**Prerequisites:** The print-renderer plan is already implemented — all rendering lives in `apps/print-renderer/` (cloud), POS server is a dumb image printer.

---

## Architecture

```
Config Page (apps/config/, Vite + vanilla TS)
  ├── writes to ──→ Supabase tables (installation_config, render_config, prompts, secrets)
  ├── calls ──→ Print Renderer API (previews, test prints, slicing)
  ├── pings ──→ POS Server /health (status only)
  └── auth via ──→ Supabase Auth (email/password)

Services read config:
  Tablet         ──→ reads installation_config via GET /api/config
  Backend        ──→ reads installation_config + prompts + secrets (service role)
  Print Renderer ──→ reads render_config on each render request
  Printer Bridge ──→ reads print_queue (unchanged)
  POS Server     ──→ local hardware config only (USB vendor/product ID)
```

The config page talks directly to Supabase (for settings) and to the print-renderer (for previews/test prints). It does NOT need the backend to be running.

---

## Database Schema

### Extended: `installation_config` (single row, upsert)

**Single-row enforcement:** The existing table uses `id UUID PRIMARY KEY`. The migration adds a CHECK constraint to enforce single-row: `ALTER TABLE installation_config ADD CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000000')`. The existing seed row's id is updated to match. All upserts use `ON CONFLICT (id)` with this fixed id.

Existing columns unchanged. New columns added with defaults matching current hardcoded values.

```sql
-- Existing (unchanged)
id                uuid PRIMARY KEY
mode              text NOT NULL DEFAULT 'text_term'    -- text_term | term_only | chain
active_term       text
active_text_id    text REFERENCES texts(id)
program           text NOT NULL DEFAULT 'aphorism'
updated_at        timestamptz DEFAULT now()

-- New: language
language          text NOT NULL DEFAULT 'de'           -- de | en

-- New: stage flags (override program defaults, NULL = use program default)
stage_text_reading  boolean
stage_term_prompt   boolean
stage_portrait      boolean
stage_printing      boolean

-- New: face detection
face_detection_enabled  boolean NOT NULL DEFAULT true
face_wake_ms            int NOT NULL DEFAULT 3000
face_sleep_ms           int NOT NULL DEFAULT 30000
face_detection_interval_ms int NOT NULL DEFAULT 500
face_min_confidence     float NOT NULL DEFAULT 0.5

-- New: screen timers
welcome_duration_ms       int NOT NULL DEFAULT 3000
term_prompt_duration_ms   int NOT NULL DEFAULT 2000
definition_display_ms     int NOT NULL DEFAULT 10000
farewell_duration_ms      int NOT NULL DEFAULT 15000
print_timeout_ms          int NOT NULL DEFAULT 30000

-- New: ElevenLabs (non-secret, needed by tablet via anon)
elevenlabs_agent_id       text
elevenlabs_voice_id       text

-- New: voice settings (TTS)
voice_stability           float NOT NULL DEFAULT 0.35
voice_similarity_boost    float NOT NULL DEFAULT 0.65
voice_style               float NOT NULL DEFAULT 0.6
voice_speaker_boost       boolean NOT NULL DEFAULT true

-- New: voice chain
vc_remove_bg_noise        boolean NOT NULL DEFAULT true
vc_retention_window       int NOT NULL DEFAULT 10
vc_profile_model          text NOT NULL DEFAULT 'google/gemini-2.0-flash-001'
vc_profile_temperature    float NOT NULL DEFAULT 0.3
vc_profile_prompt         text
vc_icebreaker_model       text NOT NULL DEFAULT 'google/gemini-2.0-flash-001'
vc_icebreaker_temperature float NOT NULL DEFAULT 0.9
vc_icebreaker_prompt      text
vc_cold_start_de          text NOT NULL DEFAULT 'Jemand war gerade hier vor dir. Sie haben etwas hinterlassen. Ich bin neugierig -- was bringst du mit?'
vc_cold_start_en          text NOT NULL DEFAULT 'Someone was just here before you. They left something behind. I am curious -- what do you bring?'
vc_max_phrases            int NOT NULL DEFAULT 5
vc_max_favorite_words     int NOT NULL DEFAULT 5

-- New: portrait capture (tablet-side)
portrait_capture_delay_ms int NOT NULL DEFAULT 5000
portrait_jpeg_quality     float NOT NULL DEFAULT 0.85
portrait_min_blob_size    int NOT NULL DEFAULT 1024
portrait_blur_radius_css  int NOT NULL DEFAULT 25

-- New: display styling
display_highlight_color     text NOT NULL DEFAULT '#fcd34d'
display_spoken_opacity      float NOT NULL DEFAULT 0.4
display_upcoming_opacity    float NOT NULL DEFAULT 0.9
display_font_size           text NOT NULL DEFAULT 'clamp(1.2rem, 3vw, 1.8rem)'
display_line_height         float NOT NULL DEFAULT 1.8
display_letter_spacing      text NOT NULL DEFAULT '0.02em'
display_max_width           text NOT NULL DEFAULT '700px'

-- New: embeddings
embedding_model       text NOT NULL DEFAULT 'openai/text-embedding-3-small'
embedding_dimensions  int NOT NULL DEFAULT 1536

-- New: service URLs (non-secret)
backend_url           text
pos_server_url        text
print_renderer_url    text
```

### New: `secrets` (single row, authenticated-only)

API keys and sensitive values. **Only readable by authenticated users** — the anon role cannot SELECT from this table. The backend reads it using the service role key.

```sql
CREATE TABLE secrets (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),  -- single-row trick
  updated_at      timestamptz DEFAULT now(),

  elevenlabs_api_key        text,   -- used by tablet (passed via backend /api/config)
  elevenlabs_api_key_server text,   -- server-side key for voice cloning
  openrouter_api_key        text,   -- LLM API key
  webhook_secret            text,   -- admin endpoint auth
  n8n_webhook_url           text,   -- portrait style transfer webhook
  render_api_key            text    -- print-renderer auth
);

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
-- No anon SELECT policy — anon cannot read secrets at all
CREATE POLICY "secrets_authenticated_read" ON secrets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "secrets_authenticated_insert" ON secrets
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "secrets_authenticated_update" ON secrets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "secrets_authenticated_delete" ON secrets
  FOR DELETE TO authenticated USING (true);
```

The backend uses the service role key (bypasses RLS) to read secrets and passes only what the tablet needs (e.g., ElevenLabs API key) through `/api/config`.

### New: `render_config` (single row, upsert)

Replaces `apps/print-renderer/config.yaml`. The print-renderer reads this table on each request instead of a local file.

Uses **JSONB columns per section** instead of flat columns. This makes it easy to add new templates (one new JSONB column) without migrations for individual fields. The config page validates the JSON shape client-side before saving.

All default JSONB values match the actual values in `apps/print-renderer/config.yaml` exactly.

```sql
CREATE TABLE render_config (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),  -- single-row trick
  updated_at      timestamptz DEFAULT now(),

  -- Active template name
  template        text NOT NULL DEFAULT 'dictionary',           -- dictionary | helvetica | acidic

  -- Paper
  paper_px        int NOT NULL DEFAULT 576,

  -- Template configs (JSONB, one per template)
  -- Adding a new template = one new column, no field-level migration
  dict_config     jsonb NOT NULL DEFAULT '{
    "font_word": "fonts/Burra-Bold.ttf",
    "font_body": "fonts/Burra-Thin.ttf",
    "font_cite": "fonts/Burra-Thin.ttf",
    "font_date": "fonts/Burra-Thin.ttf",
    "size_word": 32, "size_body": 20, "size_cite": 18, "size_date": 16,
    "line_spacing": 1.4, "gap_after_word": 30, "gap_before_cite": 20, "margin": 20
  }'::jsonb,

  helv_config     jsonb NOT NULL DEFAULT '{
    "font_word": "/System/Library/Fonts/HelveticaNeue.ttc", "font_word_index": 1,
    "font_body": "/System/Library/Fonts/HelveticaNeue.ttc", "font_body_index": 7,
    "font_bold": "/System/Library/Fonts/HelveticaNeue.ttc", "font_bold_index": 1,
    "font_cite": "/System/Library/Fonts/HelveticaNeue.ttc", "font_cite_index": 12,
    "font_date": "/System/Library/Fonts/HelveticaNeue.ttc", "font_date_index": 5,
    "size_word": 36, "size_body": 22, "size_cite": 19, "size_date": 17,
    "line_spacing": 1.5, "gap_after_word": 29, "gap_before_cite": 19, "margin": 24
  }'::jsonb,

  acid_config     jsonb NOT NULL DEFAULT '{
    "font_word": "fonts/Acidic.TTF", "font_body": "fonts/Acidic.TTF",
    "font_bold": "fonts/Acidic.TTF", "font_cite": "fonts/Acidic.TTF",
    "font_date": "fonts/Acidic.TTF",
    "size_word": 240, "size_body": 200, "size_cite": 180, "size_date": 140,
    "line_spacing": 1.2, "gap_after_word": 80, "gap_before_cite": 60,
    "margin": 20, "hard_wrap": true
  }'::jsonb,

  -- Dithering config
  halftone_config jsonb NOT NULL DEFAULT '{
    "mode": "floyd", "dot_size": 6,
    "contrast": 1.3, "brightness": 1.0, "sharpness": 1.2, "blur": 0
  }'::jsonb,

  -- Portrait pipeline config
  portrait_config jsonb NOT NULL DEFAULT '{
    "selection_model": "google/gemini-3.1-flash-image-preview",
    "style_prompt": null,
    "dither_mode": "bayer", "blur": 10,
    "z0_pad_top": 0.3, "z0_pad_bottom": 0.8, "z0_aspect": 0.67,
    "z1_pad_top": 0.15, "z1_pad_bottom": 0.15,
    "z3_strip_width": 0.25
  }'::jsonb,

  -- Image slicing defaults
  slice_config    jsonb NOT NULL DEFAULT '{
    "direction": "vertical", "count": 10, "dot_size": 4
  }'::jsonb
);

-- RLS: anon can read, authenticated can write
ALTER TABLE render_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "render_config_read" ON render_config FOR SELECT USING (true);
CREATE POLICY "render_config_authenticated_insert" ON render_config
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "render_config_authenticated_update" ON render_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "render_config_authenticated_delete" ON render_config
  FOR DELETE TO authenticated USING (true);
```

### New: `prompts` (one row per program)

Stores editable system prompt **templates**. The prompts contain placeholder variables (e.g., `{{term}}`, `{{contextText}}`, `{{language}}`, `{{speechProfile}}`) that are interpolated at runtime by the tablet's `buildSystemPrompt()` function. The function reads the template from this table instead of from hardcoded TypeScript, then substitutes runtime values before passing it to ElevenLabs.

```sql
CREATE TABLE prompts (
  program_id        text PRIMARY KEY,                           -- aphorism | free_association | voice_chain
  system_prompt     text NOT NULL,                              -- template with {{placeholders}}
  first_message_de  text NOT NULL DEFAULT '',
  first_message_en  text NOT NULL DEFAULT '',
  updated_at        timestamptz DEFAULT now()
);

-- RLS: anon can read, authenticated can write
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompts_read" ON prompts FOR SELECT USING (true);
CREATE POLICY "prompts_authenticated_insert" ON prompts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prompts_authenticated_update" ON prompts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prompts_authenticated_delete" ON prompts
  FOR DELETE TO authenticated USING (true);
```

### Extended RLS on `installation_config`

Currently writable by anon (for the admin dashboard). Change to: anon reads, authenticated writes.

```sql
-- Drop existing permissive policies, replace with:
CREATE POLICY "config_read" ON installation_config FOR SELECT USING (true);
CREATE POLICY "config_authenticated_insert" ON installation_config
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "config_authenticated_update" ON installation_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
```

### Auto-update `updated_at` trigger

Applied to all config tables so `updated_at` reflects the last modification time automatically.

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON installation_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON render_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON secrets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

---

## Auth Flow

1. Admin creates one user account in Supabase dashboard (email + password)
2. Config page loads → checks for existing Supabase session in localStorage
3. If no session → shows login form (email + password fields)
4. On submit → `supabase.auth.signInWithPassword({ email, password })`
5. On success → session stored in localStorage, page renders config tabs
6. All writes use the authenticated Supabase client
7. Tablet and other services continue using the anon key (read-only)
8. Logout button in header → `supabase.auth.signOut()`

---

## App Structure

Minimal Vite app in `apps/config/`. Vanilla TypeScript, no React. Builds to static files.

```
apps/config/
  index.html              ← shell: tab bar, auth gate, header
  src/
    main.ts               ← auth flow, tab routing, dirty-state tracking
    tabs/
      installation.ts     ← mode, program, timers, face detection
      conversation.ts     ← prompts, voice, embeddings
      printing.ts         ← templates, dithering, portrait, composer, test print
      tools.ts            ← raster painter, text management, definition browser
      system.ts           ← URLs, secrets, health, display styling, hardware
    lib/
      supabase.ts         ← Supabase client, auth helpers, typed table accessors
      forms.ts            ← slider/input/textarea/color-picker builders
      render-api.ts       ← print-renderer API client (preview, slice, test print)
  vite.config.ts
  package.json
  tsconfig.json
```

Dependencies: `@supabase/supabase-js`, `vite`, `typescript`. No UI framework.

### Header

- Title: "MeinUngeheuer Control"
- Current mode/program badge (e.g., "text_term / aphorism")
- Connection status dots (Supabase, POS server, print-renderer)
- Logout button

### Tab Bar

5 tabs: **Installation** | **Conversation** | **Printing** | **Tools** | **System**

### Save Behavior

Each section has a "Save" button that upserts the relevant table. Changes are not auto-saved — the operator explicitly saves when ready. A "dirty" indicator shows unsaved changes.

---

## Tab 1: Installation

Controls what the installation does and how it behaves.

**Mode & Program**
- Mode selector: `text_term` / `term_only` / `chain` (radio buttons)
- Program selector: `aphorism` / `free_association` / `voice_chain` (radio buttons)
- Active term: text input
- Active text: dropdown populated from `texts` table
- Default language: `de` / `en` toggle

**Stage Flags** (override program defaults)
- Text reading: checkbox
- Term prompt: checkbox
- Portrait capture: checkbox
- Printing: checkbox
- Note: when NULL, falls back to program defaults. When set, overrides.

**Face Detection**
- Enabled: toggle
- Wake threshold: slider 500–10000ms (default 3000)
- Sleep threshold: slider 5000–120000ms (default 30000)
- Detection interval: slider 100–2000ms (default 500)
- Min confidence: slider 0.1–1.0 (default 0.5)

**Screen Timers**
- Welcome duration: slider 1000–10000ms (default 3000)
- Term prompt duration: slider 1000–10000ms (default 2000)
- Definition display: slider 3000–30000ms (default 10000)
- Farewell duration: slider 5000–60000ms (default 15000)
- Print timeout: slider 10000–120000ms (default 30000)

All sliders show current value and have a "reset to default" button.

---

## Tab 2: Conversation

AI behavior, prompts, voice settings.

**System Prompts**
- One collapsible section per program (aphorism, free_association, voice_chain)
- Each has: large textarea for system prompt template, text inputs for first_message_de and first_message_en
- Template variables (`{{term}}`, `{{contextText}}`, `{{language}}`, `{{speechProfile}}`) are documented above the textarea
- Reads from / writes to `prompts` table
- "Reset to default" button loads the original prompt template from the codebase (bundled as reference constants in the app)
- **Validation:** before saving, the config page checks that required placeholders exist for each program (e.g., aphorism requires `{{term}}` and `{{contextText}}`). Shows a warning if missing but does not hard-block — the operator may intentionally omit a placeholder

**ElevenLabs**
- Agent ID: text input
- Default voice ID: text input

**Voice Settings (TTS)**
- Stability: slider 0–1 (default 0.35)
- Similarity boost: slider 0–1 (default 0.65)
- Style: slider 0–1 (default 0.6)
- Speaker boost: toggle (default on)

**Voice Chain**
- Remove background noise: toggle (default on)
- Retention window: number input (default 10)
- Speech profile model: text input (default google/gemini-2.0-flash-001)
- Speech profile temperature: slider 0–1 (default 0.3)
- Speech profile extraction prompt: textarea
- Icebreaker model: text input
- Icebreaker temperature: slider 0–1 (default 0.9)
- Icebreaker generation prompt: textarea
- Cold start message DE: text input
- Cold start message EN: text input
- Max phrases: number input (default 5)
- Max favorite words: number input (default 5)

**Embeddings**
- Model: text input (default openai/text-embedding-3-small)
- Dimensions: number input (default 1536)

---

## Tab 3: Printing

Templates, rendering, portrait pipeline, print composer, test printing.

**Card Template**
- Active template: `dictionary` / `helvetica` / `acidic` (radio buttons with visual preview)
- Paper width: number input (default 576px)
- Per-template settings (shown for active template):
  - Font file paths (text inputs — relative paths for bundled fonts, absolute for system fonts)
  - Font indices (number inputs, for .ttc files like Helvetica)
  - Font sizes: word, body, citation, date (number inputs)
  - Line spacing: slider
  - Gap after word: number input
  - Gap before cite: number input
  - Margin: number input
  - Hard wrap: checkbox (acidic only)
- **Live preview**: renders a sample card via print-renderer `/render/dictionary` endpoint with config overrides in the request body. Updates on setting change.

**Dithering**
- Mode: `floyd` / `bayer` / `halftone` (radio with visual comparison)
- Dot size: slider 2–12 (default 6, halftone only)
- Contrast: slider 0.5–2.0 (default 1.3)
- Brightness: slider 0.5–2.0 (default 1.0)
- Sharpness: slider 0.5–2.0 (default 1.2)
- Blur: slider 0–30 (default 0)
- **Live preview**: upload a test image, see it dithered with current settings

**Portrait Pipeline**
- Selection model: text input (default google/gemini-3.1-flash-image-preview)
- Style transfer prompt: large textarea (~185 lines)
- Portrait-specific dither mode and blur (independent from image dithering above)
- Crop parameters per zoom level:
  - Zoom 0 (full portrait): pad_top, pad_bottom, aspect_ratio (sliders)
  - Zoom 1 (face close-up): pad_top, pad_bottom (sliders)
  - Zoom 3 (narrow strip): strip_width (slider)
- **Live preview**: upload a test portrait, see:
  - Mediapipe landmark overlay
  - All 4 zoom crops rendered with current settings
  - Each crop shown as a dithered preview image
- Capture delay: slider (default 5000ms)
- JPEG quality: slider 0.5–1.0 (default 0.85)
- CSS blur radius for blurred portrait display: slider (default 25px)

**Print Composer**
- Upload any image
- Choose slice direction: vertical / horizontal (toggle)
- Slice count: slider 1–20 (default 10)
- Preview: shows all slices side by side (vertical) or stacked (horizontal)
- Per-slice labeling: text input for each slice (e.g., "1/10", custom text, or blank)
- Label position: above / below each slice (toggle)
- Dither settings: use global or override per-job
- "Print" button: sends slice job to print-renderer, which renders labeled slices and inserts into `print_queue`
- "Export PNG" / "Export ZIP": download slices as files

**Test Printing**
- Print test dictionary card (uses current template settings + sample data)
- Print test image (upload image, uses current dither settings)
- Print custom text/markdown
- Each has a "Send to printer" button

---

## Tab 4: Tools

Interactive tools and data management.

**Raster Painter**
- Full simulation canvas embedded in the tab
- All parameters exposed as sliders:
  - Grid: cols, rows, cell size
  - Wind: direction (0–360°), noise, turbulence, strength
  - Transfer rate, smoothing
  - Post-processing blur
- Simulation controls: run / pause / reset
- Output actions:
  - Export full PNG
  - Slice with current Print Composer settings (direction + count)
  - Send slices directly to printer
  - Export ZIP of slices

**Text Management**
- Table listing all texts from `texts` table
- Add new text: title, content_de, content_en, terms array (comma-separated)
- Edit existing text inline
- Delete text (with confirmation)
- Set as active text (updates `installation_config.active_text_id`)

**Definition Browser**
- Paginated list of all definitions from `definitions` table
- Filter by term (search input)
- Each row shows: term, definition_text, language, created_at, session_id
- Chain visualization: shows chain depth and linkage for Mode C definitions
- Export as JSON / CSV

---

## Tab 5: System

Connections, health, display styling, hardware.

**Service URLs**
- Supabase URL: text input (read-only, set at page load)
- Backend URL: text input
- POS server URL: text input
- Print renderer URL: text input

**API Keys & Secrets** (reads/writes `secrets` table)
- ElevenLabs API key (client): password input (masked)
- ElevenLabs API key (server): password input (masked)
- OpenRouter API key: password input (masked)
- Webhook secret: password input (masked)
- n8n webhook URL: text input
- Render API key: password input (masked)
- Note: these are only visible when authenticated. The `secrets` table has no anon SELECT policy.

**Service Health**
- POS server: pings `/health`, shows connected/disconnected/dummy + uptime + last print time
- Print renderer: pings `/health`, shows status
- Supabase: connection check
- Auto-refreshes every 30 seconds
- Recent print jobs: last 10 from `print_queue` with status

**Tablet Display Styling**
- Karaoke reader:
  - Highlight color: color picker (default #fcd34d)
  - Spoken opacity: slider 0–1 (default 0.4)
  - Upcoming opacity: slider 0–1 (default 0.9)
  - Font size: text input (default clamp(1.2rem, 3vw, 1.8rem))
  - Line height: slider 1.0–3.0 (default 1.8)
  - Letter spacing: text input (default 0.02em)
  - Max width: text input (default 700px)
- Conversation screen:
  - Agent indicator color: color picker (default #4ade80)
  - Listening indicator color: color picker (default #F5A623)
  - Message font size: text input
- Definition screen:
  - Term font size: text input
  - Definition font size: text input
  - Citation font size: text input

**Printer Hardware (Pi-local, read-only reference)**
- Displays current POS server hardware config (from `/health` response)
- Connection type, uptime, last print time, dummy mode status
- Note: USB vendor/product IDs and network host/port are set in the POS server's local `config.yaml` on the Pi. These require physical access and a server restart to change. The config page displays them for reference but does not write to them.

---

## Print-Renderer Changes Required

The print-renderer needs modifications to support this design:

### 1. Read config from Supabase instead of local config.yaml

On each render request, fetch the latest `render_config` row from Supabase. Cache for 5 seconds to avoid excessive DB calls. **Required fallback:** if Supabase is unreachable, the renderer MUST fall back to local `config.yaml` and continue operating. Thermal prints are time-sensitive — a Supabase outage must not block printing. The fallback is not optional behavior.

### 2. New endpoint: `POST /render/slice`

```
POST /render/slice
Content-Type: multipart/form-data

Fields:
  file: image file
  direction: "vertical" | "horizontal"
  count: int (number of slices)
  labels: JSON array of strings (one per slice, empty string = no label)
  label_position: "above" | "below"
  dither_mode: optional override
  paper_px: optional override

Response: JSON with array of base64-encoded PNGs
  { "slices": [{ "name": "slice_0", "label": "1/10", "image_b64": "..." }, ...] }
```

### 3. Config override in render requests

Existing endpoints (`/render/dictionary`, `/render/markdown`) accept an optional `config_override` field in the request body. This lets the config page preview with unsaved settings without persisting them first.

```json
{
  "word": "TEST",
  "definition": "A sample definition.",
  "config_override": {
    "dict_font_word_size": 40,
    "dict_margin": 30
  }
}
```

The renderer merges overrides onto the cached Supabase config for that single request.

---

## Migration & Seed Data

One Supabase migration creates the new tables and extends `installation_config`:

1. `UPDATE installation_config SET id = '00000000-0000-0000-0000-000000000000'` (normalize existing row's id)
2. `ALTER TABLE installation_config ADD CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000000')`
3. `ALTER TABLE installation_config ADD COLUMN ...` for all new columns with defaults
3. `CREATE TABLE secrets` with single seed row (empty — keys entered via config page)
4. `CREATE TABLE render_config` with single seed row (all defaults match current `config.yaml` values exactly)
5. `CREATE TABLE prompts` with 3 seed rows — system prompt templates extracted from `aphorism.ts`, `free-association.ts`, `voice-chain.ts` with runtime values replaced by `{{placeholders}}`
6. `CREATE OR REPLACE FUNCTION update_timestamp()` + triggers on all config tables
7. Updated RLS policies: anon reads non-secret tables, authenticated reads/writes all tables

The seed values ensure the installation works identically to today with zero manual configuration. Every new column/JSONB default matches the current hardcoded value.

**Migration safety:** The entire migration runs in a single transaction (`BEGIN; ... COMMIT;`). If any step fails, everything rolls back and the installation continues working with the old schema. Test against a Supabase branch database before applying to production.

---

## Deployment Order

The config page depends on the print-renderer being deployed and the migration being applied. Strict order:

1. **Deploy print-renderer** to cloud (Coolify/Railway) — already built, needs first deploy
2. **Apply Supabase migration** — creates tables, extends schema, updates RLS
3. **Create admin user** in Supabase Auth dashboard (email + password)
4. **Deploy config page** (`apps/config/` build output) — static files to any host
5. **Update tablet/backend** — code changes to read config from Supabase instead of constants
6. **Seed style prompt** — paste the full portrait style prompt into `render_config.portrait_config` via the config page (it's ~185 lines, too large for a SQL default literal)
7. **Verify** — use the config page to confirm all settings match current behavior, send a test print

Steps 1–3 can happen without breaking anything (new tables, no code depends on them yet). Step 5 is the breaking change — deploy tablet/backend together.

---

## How Services Read Config

### Tablet (reads on startup + Realtime)

`GET /api/config` already returns mode, term, text, program. The backend endpoint is extended to also return:
- Timers, face detection, stage flags, voice settings, voice chain config, display styling
- The active system prompt template from `prompts` table
- ElevenLabs agent/voice IDs
- ElevenLabs API key (from `secrets`, served by backend using service role key)

The tablet code changes from importing `FACE_DETECTION.WAKE_THRESHOLD_MS` from constants to reading it from the config response. `constants.ts` becomes fallback defaults only (used when `/api/config` is unreachable).

The tablet's `buildSystemPrompt()` function reads the template from the config response and interpolates runtime values (`{{term}}`, `{{contextText}}`, etc.) before passing it to ElevenLabs.

Optionally: tablet subscribes to Supabase Realtime on `installation_config` to pick up changes without restart.

### Print Renderer (reads on each request)

Currently reads local `config.yaml`. Changes to:
1. On startup: fetch `render_config` row, cache it
2. On each request: check cache age, re-fetch if >5s stale
3. Use cached config for all rendering decisions (template, fonts, dithering, portrait params)
4. If Supabase unreachable, fall back to local `config.yaml`

### Backend (reads on each /api/config call)

Already reads `installation_config`. Extended to join `prompts` table and `secrets` table (using service role key) and return more fields.

### POS Server (unchanged)

Reads local `config.yaml` for hardware settings only (USB vendor/product ID, server host/port). These rarely change and require physical access to the Pi anyway.

---

## Files Absorbed / Deleted

After the config page is confirmed working:

| File | Status |
|------|--------|
| `apps/pos-server/opencv_tuner.html` | Delete — obsolete (mediapipe in cloud, no OpenCV) |
| `apps/pos-server/test_output/crop_tuner.html` | Delete — portrait crop calibration is in config page |
| `apps/tablet/src/pages/Admin.tsx` | Delete — fully replaced by config page |
| `apps/print-renderer/config.yaml` | Keep as required fallback — used when Supabase is unreachable |
| `tools/raster-painter/index.html` | Keep as standalone backup, but primary usage is config page |

---

## File Location

`apps/config/` in the monorepo. Build output is static files (HTML + JS + CSS) deployable to any HTTP server — Coolify, S3, `python -m http.server`, or even a local `pnpm dev:config` during the exhibition. Add to `pnpm dev` in the root `package.json` for parallel dev startup.

---

## Security

- Supabase Auth (email/password) protects all writes
- RLS policies: anon = read-only on non-secret tables, authenticated = read/write on all tables
- API keys and secrets live in a dedicated `secrets` table with no anon SELECT policy
- The backend serves selected secrets to the tablet via `/api/config` using the service role key
- The config page itself has no server — nothing to attack except Supabase (which has its own security)
- POS server and print-renderer can optionally validate an API key header for write operations

---

## Out of Scope

- Multi-user auth (only one admin account needed)
- Version history / undo (could add later with audit triggers)
- Mobile-optimized layout (config page is used on a laptop, not a phone)
- Internationalization of the config page itself (UI is in English)
- Print layouts beyond dictionary/helvetica/acidic (the existing `PrintLayout` type also includes `dictionary_portrait`, `portrait_only`, and `message` — these are program-level choices, not template choices. The template controls typography; the layout controls what content sections appear. If needed, print layout selection can be added to the Installation tab alongside program selection.)
