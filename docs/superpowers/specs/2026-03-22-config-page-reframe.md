# Config Page — Reframe: Pipeline Composer + Workbench

This document supersedes the UI sections of the original unified config page design spec. The database schema, auth, security, and infrastructure sections of the original spec remain valid.

---

## Core Shift

The config page is not a settings panel. It is two things:

1. **A pipeline composer** — view, tune, and switch between programs (each program is a pipeline of blocks)
2. **A workbench** — use any block independently, compare outputs, test ideas

---

## Programs as Pipelines

A program is a named sequence of blocks. Each block is a capability the system provides.

### Available Blocks

| Block | What it does | Configurable parameters |
|-------|-------------|------------------------|
| `face_detect` | Detects visitor presence via camera | wake_ms, sleep_ms, interval, confidence |
| `text_display` | Shows text with karaoke TTS highlighting | text_id, font_size, highlight_color, speed |
| `term_prompt` | Displays a term on screen | term, duration_ms |
| `conversation` | Voice conversation with ElevenLabs AI | prompt_template, voice settings, language, first_message |
| `portrait_capture` | Captures photo via tablet camera | delay_ms, jpeg_quality, blur_radius |
| `portrait_process` | Mediapipe landmarks → style transfer → dither | style_prompt, dither_mode, blur, crop params |
| `print_card` | Renders definition as styled card → prints | template (dictionary/helvetica/acidic), font config, margins |
| `print_image` | Sends pre-rendered image to printer | dither settings |
| `print_batch` | Sends multiple images as one print job | slice direction, count |
| `raster_paint` | Generative art canvas simulation | grid, wind, transfer, blur |
| `slice` | Cuts an image into strips for large prints | direction, count, labels, dot_size |
| `voice_chain` | Links conversations: prev visitor's output → next visitor's input | retention_window, cold_start_message, profile_prompt |

### Current Programs

```
aphorism:
  face_detect → text_display → conversation → print_card

free_association:
  face_detect → term_prompt → conversation → print_card

voice_chain:
  face_detect → voice_chain → text_display → conversation → print_card
```

### Hypothetical Future Programs

```
portrait_printer:
  face_detect → portrait_capture → portrait_process → print_batch

generative_art:
  raster_paint → slice → print_batch

live_dictionary:
  face_detect → conversation → print_card
  (no text, no term — just open conversation)

news_printer:
  face_detect → portrait_capture → api_fetch → print_card
  (recognize person, fetch relevant content, print)
```

### Database Model

```sql
CREATE TABLE programs (
  id            text PRIMARY KEY,        -- e.g. 'aphorism', 'portrait_printer'
  name          text NOT NULL,           -- display name
  pipeline      text[] NOT NULL,         -- ordered block IDs
  config        jsonb NOT NULL,          -- per-block config, keyed by block ID
  is_active     boolean DEFAULT false,   -- only one active at a time
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

Example row:
```json
{
  "id": "aphorism",
  "name": "Aphorism (Kleist)",
  "pipeline": ["face_detect", "text_display", "conversation", "print_card"],
  "config": {
    "face_detect": {
      "enabled": true,
      "wake_ms": 3000,
      "sleep_ms": 30000
    },
    "text_display": {
      "text_id": "kleist-verfertigung",
      "highlight_color": "#fcd34d"
    },
    "conversation": {
      "prompt_template": "You are an AI art installation...",
      "voice_stability": 0.35,
      "language": "de"
    },
    "print_card": {
      "template": "dictionary",
      "style": "dictionary"
    }
  }
}
```

Creating a new program = inserting a row. Claude generates this during conversation. The config page is for tuning, not composing from scratch.

---

## Config Page: Two Modes

### Mode 1: Program View

Shows the active program's pipeline as a visual flow:

```
[face_detect] → [text_display] → [conversation] → [print_card]
```

- Each block is a clickable card
- Click to expand and see/edit its configuration
- The flow reads left-to-right (or top-to-bottom on narrow screens)
- Switch active program from a dropdown at the top
- "Save" persists changes to the program's config JSONB

All programs are listed in a sidebar or dropdown. The active one runs on the tablet. Others can be edited without affecting the live installation.

### Mode 2: Workbench

Direct access to every block independently. No pipeline — just tools.

Sections:
- **Print** — render a card (pick template, enter text, preview, send to printer)
- **Dither** — upload image, apply dithering, preview, print
- **Slice** — upload image, configure slicing, preview all strips, print or export
- **Portrait** — upload photo, run mediapipe + style transfer, preview crops, print
- **Raster Painter** — run simulation, export or slice and print
- **Prompts** — edit and test prompt templates (see output with sample data)
- **Texts** — manage texts in the database
- **Definitions** — browse all definitions, filter, export

### Shared: System Panel

Always accessible (bottom of sidebar or separate tab):
- Service URLs and health status
- API keys and secrets
- Printer hardware status
- Supabase connection

---

## Comparison Mode

The workbench supports **side-by-side comparison** for any block that produces visual output:

### Card Template Comparison
Render the same definition with all 3 templates (dictionary, helvetica, acidic) in a grid. See them next to each other. Pick the one you want.

### Dithering Comparison
Upload one image, see it rendered with floyd, bayer, and halftone side by side. Adjust parameters, see all three update.

### Portrait Crop Comparison
Upload one portrait, see all 4 zoom levels rendered with current settings. Compare different dither modes on the same crop.

### Prompt Comparison
Same term, two different prompt templates. See how the conversation would start differently. (Preview only — shows the interpolated system prompt, not a live conversation.)

### Cross-Program Preview
"What would this definition look like through aphorism vs free_association?" Same input data, different program configs, rendered side by side.

Implementation: comparison mode is a toggle on workbench panels. When on, the panel renders 2-4 variants in a grid instead of one.

---

## How New Programs Are Created

1. User describes the pipeline to Claude: "I want a program that detects faces, captures a portrait, applies style transfer, and prints 4 zoom crops"
2. Claude generates the `programs` table row (JSON)
3. User reviews, adjusts if needed
4. Claude inserts via Supabase or provides SQL
5. Config page shows the new program immediately
6. User tunes parameters on the config page
7. User sets it as active — tablet picks it up

The config page does NOT need a visual pipeline builder for MVP. That's a future enhancement. For now, Claude is the composer, the config page is the tuner.

---

## What This Changes From the Original Spec

| Aspect | Original Spec | New Direction |
|--------|--------------|---------------|
| UI organization | 5 tabs by setting category | Program pipeline view + workbench |
| Program model | Fixed enum (3 programs) | Dynamic rows in `programs` table |
| Config storage | Spread across installation_config columns | Per-program JSONB in `programs.config` |
| Creating programs | Hardcoded in TypeScript | Claude generates, config page tunes |
| Tools (raster painter, slicer) | Tab 4 | Workbench mode |
| Data management (texts, definitions) | Tab 4 | Workbench mode |
| System/health/secrets | Tab 5 | Persistent sidebar panel |
| Comparison/preview | Live preview per setting | Side-by-side comparison across variants |

### What stays the same
- Database: `secrets`, `render_config`, `prompts` tables (still valid)
- Auth: Supabase email/password (unchanged)
- Print-renderer: config override, slice endpoint, Supabase fallback (unchanged)
- Security: RLS policies, anon vs authenticated (unchanged)
- Deployment: Coolify, systemd on Pi, Tailscale (unchanged)

### What needs migration
- `installation_config` columns that are program-specific (timers, face detection, voice settings) should move into each program's `config` JSONB
- `installation_config` keeps only truly global settings (language, service URLs)
- `prompts` table may be absorbed into `programs.config` (each program has its own prompt template in its config)

---

## Open Questions

1. **Does the tablet need to understand arbitrary pipelines?** Or do we keep the existing state machine and just let programs configure which stages are active? (The simpler option — the tablet always has the same stages, programs just toggle them on/off and set their parameters.)

2. **How does the tablet pick up program changes?** Poll `/api/config` periodically? Supabase Realtime on `programs` table? Manual refresh button on the tablet?

3. **Should `render_config` stay separate or merge into program configs?** Template settings (fonts, margins) could be per-program or global. If per-program, two programs can use different templates simultaneously. If global, switching programs might change the template.
