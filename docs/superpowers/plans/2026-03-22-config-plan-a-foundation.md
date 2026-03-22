# Config Page — Plan A: Foundation + Service Adaptation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Supabase schema for centralized configuration, make the print-renderer read config from Supabase (with YAML fallback), extend the backend to serve full config to the tablet, and update the tablet to read all settings from the config response instead of hardcoded constants.

**Architecture:** A single migration (`012_config_tables.sql`) creates `secrets`, `render_config`, and `prompts` tables, extends `installation_config` with 40+ new columns, and updates RLS policies. The print-renderer gains a Supabase client that caches `render_config` with a 5-second TTL, falling back to local `config.yaml` if Supabase is unreachable. The backend's `GET /api/config` is extended to return all config fields including prompts and voice settings. The tablet reads from the config response instead of importing constants.

**Tech Stack:** Supabase (PostgreSQL), Python (FastAPI, supabase-py), TypeScript (Hono backend, React tablet), Zod validation

**Spec:** `docs/superpowers/specs/2026-03-22-unified-config-page-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/012_config_tables.sql` | Full migration: new tables, extended columns, RLS, triggers, seed data |
| `apps/print-renderer/supabase_config.py` | Supabase config reader with TTL cache and YAML fallback |
| `apps/print-renderer/fonts/DejaVuSans.ttf` | Bundled fallback font for Helvetica template in Docker |
| `apps/print-renderer/fonts/DejaVuSans-Bold.ttf` | Bundled fallback bold font |

### Modified files

| File | Change |
|------|--------|
| `apps/print-renderer/main.py` | Import Supabase config reader, use it instead of static `RENDER_CONFIG` |
| `apps/print-renderer/requirements.txt` | Add `supabase>=2.0` |
| `apps/print-renderer/.env.example` | Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `apps/backend/src/routes/config.ts` | Extend GET handler to return timers, face detection, voice settings, prompts, display styling |
| `apps/tablet/src/lib/api.ts` | Extend `ConfigResponseSchema` with new fields |
| `apps/tablet/src/hooks/useInstallationMachine.ts` | Read timers/face detection from config response, use as fallback-aware values |
| `apps/tablet/src/components/TextReader.tsx` | Read voice settings from config instead of hardcoded `VOICE_SETTINGS` |
| `packages/shared/src/constants.ts` | Keep as-is (becomes fallback defaults) |

---

## Task 1: Supabase migration

**Files:**
- Create: `supabase/migrations/012_config_tables.sql`

- [ ] **Step 1: Write the migration file**

This is a large migration. It runs in a single transaction. Dollar-quoting is used for the portrait style prompt.

```sql
-- 012_config_tables.sql
-- Centralized configuration for the MeinUngeheuer installation.
-- Creates: secrets, render_config, prompts tables
-- Extends: installation_config with runtime-configurable columns
-- Updates: RLS policies (anon reads, authenticated writes)

BEGIN;

-- ============================================================
-- 1. Normalize installation_config to single-row
-- ============================================================

-- Update existing row to fixed UUID (if not already)
UPDATE installation_config
SET id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE id != '00000000-0000-0000-0000-000000000000'::uuid;

-- Enforce single-row
ALTER TABLE installation_config
ADD CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ============================================================
-- 2. Extend installation_config with new columns
-- ============================================================

ALTER TABLE installation_config
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS stage_text_reading boolean,
  ADD COLUMN IF NOT EXISTS stage_term_prompt boolean,
  ADD COLUMN IF NOT EXISTS stage_portrait boolean,
  ADD COLUMN IF NOT EXISTS stage_printing boolean,
  ADD COLUMN IF NOT EXISTS face_detection_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS face_wake_ms int NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS face_sleep_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN IF NOT EXISTS face_detection_interval_ms int NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS face_min_confidence float NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS welcome_duration_ms int NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS term_prompt_duration_ms int NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS definition_display_ms int NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS farewell_duration_ms int NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS print_timeout_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN IF NOT EXISTS elevenlabs_agent_id text,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id text,
  ADD COLUMN IF NOT EXISTS voice_stability float NOT NULL DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS voice_similarity_boost float NOT NULL DEFAULT 0.65,
  ADD COLUMN IF NOT EXISTS voice_style float NOT NULL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS voice_speaker_boost boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vc_remove_bg_noise boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vc_retention_window int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS vc_profile_model text NOT NULL DEFAULT 'google/gemini-2.0-flash-001',
  ADD COLUMN IF NOT EXISTS vc_profile_temperature float NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS vc_profile_prompt text,
  ADD COLUMN IF NOT EXISTS vc_icebreaker_model text NOT NULL DEFAULT 'google/gemini-2.0-flash-001',
  ADD COLUMN IF NOT EXISTS vc_icebreaker_temperature float NOT NULL DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS vc_icebreaker_prompt text,
  ADD COLUMN IF NOT EXISTS vc_cold_start_de text NOT NULL DEFAULT 'Jemand war gerade hier vor dir. Sie haben etwas hinterlassen. Ich bin neugierig -- was bringst du mit?',
  ADD COLUMN IF NOT EXISTS vc_cold_start_en text NOT NULL DEFAULT 'Someone was just here before you. They left something behind. I am curious -- what do you bring?',
  ADD COLUMN IF NOT EXISTS vc_max_phrases int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS vc_max_favorite_words int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS portrait_capture_delay_ms int NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS portrait_jpeg_quality float NOT NULL DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS portrait_min_blob_size int NOT NULL DEFAULT 1024,
  ADD COLUMN IF NOT EXISTS portrait_blur_radius_css int NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS display_highlight_color text NOT NULL DEFAULT '#fcd34d',
  ADD COLUMN IF NOT EXISTS display_spoken_opacity float NOT NULL DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS display_upcoming_opacity float NOT NULL DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS display_font_size text NOT NULL DEFAULT 'clamp(1.2rem, 3vw, 1.8rem)',
  ADD COLUMN IF NOT EXISTS display_line_height float NOT NULL DEFAULT 1.8,
  ADD COLUMN IF NOT EXISTS display_letter_spacing text NOT NULL DEFAULT '0.02em',
  ADD COLUMN IF NOT EXISTS display_max_width text NOT NULL DEFAULT '700px',
  ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT 'openai/text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_dimensions int NOT NULL DEFAULT 1536,
  ADD COLUMN IF NOT EXISTS backend_url text,
  ADD COLUMN IF NOT EXISTS pos_server_url text,
  ADD COLUMN IF NOT EXISTS print_renderer_url text;

-- ============================================================
-- 3. Create secrets table (authenticated-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS secrets (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  updated_at      timestamptz DEFAULT now(),
  elevenlabs_api_key        text,
  elevenlabs_api_key_server text,
  openrouter_api_key        text,
  webhook_secret            text,
  n8n_webhook_url           text,
  render_api_key            text
);

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secrets_authenticated_read" ON secrets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "secrets_authenticated_insert" ON secrets
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "secrets_authenticated_update" ON secrets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "secrets_authenticated_delete" ON secrets
  FOR DELETE TO authenticated USING (true);

-- Seed empty row
INSERT INTO secrets (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Create render_config table (JSONB per section)
-- ============================================================

CREATE TABLE IF NOT EXISTS render_config (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  updated_at      timestamptz DEFAULT now(),
  template        text NOT NULL DEFAULT 'dictionary',
  paper_px        int NOT NULL DEFAULT 576,
  dict_config     jsonb NOT NULL DEFAULT '{"font_word":"fonts/Burra-Bold.ttf","font_body":"fonts/Burra-Thin.ttf","font_cite":"fonts/Burra-Thin.ttf","font_date":"fonts/Burra-Thin.ttf","size_word":32,"size_body":20,"size_cite":18,"size_date":16,"line_spacing":1.4,"gap_after_word":30,"gap_before_cite":20,"margin":20}'::jsonb,
  helv_config     jsonb NOT NULL DEFAULT '{"font_word":"fonts/DejaVuSans-Bold.ttf","font_body":"fonts/DejaVuSans.ttf","font_bold":"fonts/DejaVuSans-Bold.ttf","font_cite":"fonts/DejaVuSans.ttf","font_date":"fonts/DejaVuSans.ttf","size_word":36,"size_body":22,"size_cite":19,"size_date":17,"line_spacing":1.5,"gap_after_word":29,"gap_before_cite":19,"margin":24}'::jsonb,
  acid_config     jsonb NOT NULL DEFAULT '{"font_word":"fonts/Acidic.TTF","font_body":"fonts/Acidic.TTF","font_bold":"fonts/Acidic.TTF","font_cite":"fonts/Acidic.TTF","font_date":"fonts/Acidic.TTF","size_word":240,"size_body":200,"size_cite":180,"size_date":140,"line_spacing":1.2,"gap_after_word":80,"gap_before_cite":60,"margin":20,"hard_wrap":true}'::jsonb,
  halftone_config jsonb NOT NULL DEFAULT '{"mode":"floyd","dot_size":6,"contrast":1.3,"brightness":1.0,"sharpness":1.2,"blur":0}'::jsonb,
  portrait_config jsonb NOT NULL DEFAULT '{"selection_model":"google/gemini-3.1-flash-image-preview","style_prompt":"","dither_mode":"bayer","blur":10,"z0_pad_top":0.3,"z0_pad_bottom":0.8,"z0_aspect":0.67,"z1_pad_top":0.15,"z1_pad_bottom":0.15,"z3_strip_width":0.25}'::jsonb,
  slice_config    jsonb NOT NULL DEFAULT '{"direction":"vertical","count":10,"dot_size":4}'::jsonb
);

ALTER TABLE render_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "render_config_read" ON render_config FOR SELECT USING (true);
CREATE POLICY "render_config_authenticated_insert" ON render_config
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "render_config_authenticated_update" ON render_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "render_config_authenticated_delete" ON render_config
  FOR DELETE TO authenticated USING (true);

-- Seed row (portrait style_prompt seeded separately below)
INSERT INTO render_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. Seed portrait style prompt (185 lines, dollar-quoted)
-- ============================================================

DO $seed_prompt$
BEGIN
  UPDATE render_config
  SET portrait_config = jsonb_set(
    portrait_config,
    '{style_prompt}',
    to_jsonb($style$Photograph of a life-size human head and upper torso cast in translucent wax. Museum catalog image. Medium format camera, 90mm lens, f/4. The subject gazes directly into the camera.

The face is clean — no beard, no stubble, no facial hair. Smooth jaw, smooth chin, smooth upper lip. Scalp hair is visible but coated and frosted in the same wax — individual strands embedded in the surface, bleached, like hair preserved in resin. The hairline is natural.

FRAME: Head, full neck, and upper shoulders visible. Portrait 2:3. Shoulders dissolve into background. Do not crop at jaw.

THE MATERIAL IS THE IMAGE. Everything about this photograph — the lighting, the texture, the tone — is a consequence of what this object is made of. The head is cast in a TRANSLUCENT WAX with real physical depth. The wax is not a thin coating — it is the substance of the sculpture itself, several millimeters thick everywhere. It has body. It has mass. Light does not just land on this material — it enters it, travels through it, scatters inside it, and exits somewhere nearby.

SUBSURFACE BEHAVIOR: Where the form is convex and faces the overhead light — the center of the forehead, the nose bridge, the peak of the cheekbones — light penetrates into the wax and diffuses internally, producing a soft GLOW that comes from WITHIN the material. This glow has naturally soft edges because the light is spreading inside a translucent solid, not reflecting off a surface. The nose bridge is bright at its center but blooms outward gently, fading gradually into the surrounding tone. It is not a sharp specular reflection or a hard stripe — it is light moving through wax. The forehead glows from inside. The cheekbones have a faint internal luminosity. This subsurface scattering is the defining visual quality of the entire image.

Where the form is concave or turned away — eye sockets, sides of the nose, under the chin, temples — less light enters the material, so these areas are quieter and greyer. But the transitions are EXTREMELY gradual because the light is diffusing through a continuous solid, not casting shadows on an opaque surface. There are no hard shadow edges anywhere.

LIGHT SOURCE: A single soft overhead point light — nothing dramatic, a standard diffused ceiling fixture. The light source is simple. The MATERIAL does all the visual work.

SURFACE TEXTURE: The wax has a soft waxy sheen — not wet, not metallic, but the quiet organic gloss of cooled beeswax. The surface has visible layered texture everywhere: fine overlapping flow-marks where the wax settled, subtle ridges, hairline veins and fine patterning visible beneath the translucent layers — like veining in marble or fracture patterns inside ice. This texture is omnipresent and uniform across skull, face, neck, and shoulders. No smooth or bare patches. The wax is fully cooled and solidified — it does not drip, flow, or move. It is still and frozen.

TONE: The wax is pale cool GREY — not white. The background is BRIGHTER than the head. Grey sculpture in a bright near-white field. Monochrome, no color. No true blacks.

EYES: Photorealistic, natural, alive. The only non-wax element. They sit quietly within the tonal space.

EYEBROWS: Visible as frosted relief — coated, bleached, structurally present but muted.

FOCUS: Shallow depth of field. Sharp at the cheekbones, softening at the ears and crown. The surface texture is razor-crisp on the central face.

BONE STRUCTURE: Cheekbones, brow ridge, jaw angle, and nose ridge read through the material. This is a specific recognizable individual, not a generic form.

NOT metallic. NOT chrome. NOT dripping. NOT a 3D render. NOT body paint. NOT digitally smooth. A physical translucent wax sculpture where the material itself creates all the light behavior in the image.$style$::text)
  )
  WHERE id = true;
END;
$seed_prompt$;

-- ============================================================
-- 6. Create prompts table
-- ============================================================

CREATE TABLE IF NOT EXISTS prompts (
  program_id        text PRIMARY KEY,
  system_prompt     text NOT NULL,
  first_message_de  text NOT NULL DEFAULT '',
  first_message_en  text NOT NULL DEFAULT '',
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompts_read" ON prompts FOR SELECT USING (true);
CREATE POLICY "prompts_authenticated_insert" ON prompts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prompts_authenticated_update" ON prompts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prompts_authenticated_delete" ON prompts
  FOR DELETE TO authenticated USING (true);

-- Seed prompts are NOT included here — they are 200+ lines each.
-- The buildSystemPrompt() functions remain the source of truth until
-- the config page is built (Plan B). At that point, prompts are
-- extracted and seeded. Until then, the tablet falls back to the
-- TypeScript buildSystemPrompt() when no DB prompt exists.

-- ============================================================
-- 7. Auto-update timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON installation_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON installation_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS set_updated_at ON render_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON render_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS set_updated_at ON prompts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS set_updated_at ON secrets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON secrets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 8. Update RLS on installation_config
-- ============================================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Allow anonymous read" ON installation_config;
DROP POLICY IF EXISTS "Allow anonymous update" ON installation_config;
DROP POLICY IF EXISTS "Allow anonymous insert" ON installation_config;
DROP POLICY IF EXISTS "config_read" ON installation_config;
DROP POLICY IF EXISTS "config_write" ON installation_config;

CREATE POLICY "config_read" ON installation_config FOR SELECT USING (true);
CREATE POLICY "config_authenticated_insert" ON installation_config
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "config_authenticated_update" ON installation_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- NOTE: The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely.
-- These policy changes only affect anon (tablet) and authenticated (config page) roles.
-- The existing admin dashboard POST /api/config/update will continue working
-- because it goes through the backend (service role), not direct Supabase access.

COMMIT;
```

- [ ] **Step 2: Apply migration to Supabase branch for testing**

Use `mcp__supabase__create_branch` to create a test branch, then `mcp__supabase__apply_migration` with the migration SQL. Verify no errors.

- [ ] **Step 3: Verify tables exist**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'installation_config'
AND column_name IN ('face_wake_ms', 'voice_stability', 'display_highlight_color')
ORDER BY column_name;
```

Expected: 3 rows with correct types and defaults.

```sql
SELECT * FROM render_config;
```

Expected: 1 row with JSONB columns containing correct defaults.

```sql
SELECT portrait_config->>'style_prompt' IS NOT NULL AS has_prompt FROM render_config;
```

Expected: `true` — style prompt was seeded.

- [ ] **Step 4: Verify RLS**

```sql
-- As anon: should succeed
SELECT mode FROM installation_config;

-- As anon: should fail (no policy)
SELECT * FROM secrets;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/012_config_tables.sql
git commit -m "feat: add centralized config schema — secrets, render_config, prompts tables"
```

---

## Task 2: Bundle DejaVuSans fonts for Docker

**Files:**
- Create: `apps/print-renderer/fonts/DejaVuSans.ttf`
- Create: `apps/print-renderer/fonts/DejaVuSans-Bold.ttf`

- [ ] **Step 1: Download DejaVuSans fonts**

DejaVu fonts are freely licensed (Bitstream Vera + public domain extensions). Download from the official release:

```bash
cd /tmp
curl -LO https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip
unzip dejavu-fonts-ttf-2.37.zip
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf /Users/janos/Desktop/VAKUNST/code/meinungeheuer/apps/print-renderer/fonts/
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf /Users/janos/Desktop/VAKUNST/code/meinungeheuer/apps/print-renderer/fonts/
```

- [ ] **Step 2: Verify fonts load in Python**

```bash
cd apps/print-renderer
python -c "from PIL import ImageFont; f = ImageFont.truetype('fonts/DejaVuSans.ttf', 20); print('OK:', f.getbbox('test'))"
```

Expected: `OK: (0, -2, 30, 16)` (or similar bbox tuple).

- [ ] **Step 3: Commit**

```bash
git add apps/print-renderer/fonts/DejaVuSans.ttf apps/print-renderer/fonts/DejaVuSans-Bold.ttf
git commit -m "feat: bundle DejaVuSans fonts for cross-platform Helvetica template fallback"
```

---

## Task 3: Print-renderer reads config from Supabase

**Files:**
- Create: `apps/print-renderer/supabase_config.py`
- Modify: `apps/print-renderer/main.py`
- Modify: `apps/print-renderer/requirements.txt`
- Modify: `apps/print-renderer/.env.example`

- [ ] **Step 1: Verify supabase is already in requirements.txt**

`apps/print-renderer/requirements.txt` already has `supabase>=2.0` and `.env.example` already has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. No changes needed — just verify they exist.

- [ ] **Step 3: Create supabase_config.py**

```python
"""
Supabase-backed config reader for the print renderer.

Reads render_config from Supabase with a 5-second TTL cache.
Falls back to local config.yaml if Supabase is unreachable.
This fallback is REQUIRED — thermal prints are time-sensitive
and a Supabase outage must not block printing.
"""

import os
import time
import logging
import yaml
from typing import Any

logger = logging.getLogger(__name__)

_cache: dict[str, Any] | None = None
_cache_time: float = 0
_CACHE_TTL = 5.0  # seconds

_supabase_client = None
_yaml_fallback: dict[str, Any] | None = None


def _init_supabase():
    """Lazily initialize Supabase client. Returns None if not configured."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        logger.info("Supabase not configured — using YAML fallback only")
        return None

    try:
        from supabase import create_client
        _supabase_client = create_client(url, key)
        logger.info("Supabase config reader initialized")
        return _supabase_client
    except Exception as e:
        logger.warning("Failed to init Supabase client: %s", e)
        return None


def _load_yaml_fallback(config_path: str) -> dict[str, Any]:
    """Load local config.yaml as fallback."""
    global _yaml_fallback
    if _yaml_fallback is None:
        with open(config_path) as f:
            _yaml_fallback = yaml.safe_load(f)
        logger.info("Loaded YAML fallback from %s", config_path)
    return _yaml_fallback


def _row_to_config(row: dict) -> dict[str, Any]:
    """Convert a render_config DB row to the config dict format
    expected by templates.py and other renderers.

    The DB stores JSONB per section (dict_config, helv_config, etc.).
    The renderer expects top-level keys: 'dictionary', 'helvetica', 'acidic', 'halftone', 'portrait'.
    """
    paper_px = row.get("paper_px", 576)

    # Inject paper_px into each template dict so templates.py can find it
    # (templates.py reads cfg.get("paper_px", 576) from the template sub-dict)
    def with_paper(d: dict) -> dict:
        return {**d, "paper_px": paper_px}

    return {
        "dictionary": with_paper(row.get("dict_config", {})),
        "helvetica": with_paper(row.get("helv_config", {})),
        "acidic": with_paper(row.get("acid_config", {})),
        "halftone": row.get("halftone_config", {}),
        "portrait": row.get("portrait_config", {}),
        "_meta": {
            "template": row.get("template", "dictionary"),
            "paper_px": paper_px,
            "slice": row.get("slice_config", {}),
            "source": "supabase",
        },
    }


def get_render_config(config_path: str = "config.yaml") -> dict[str, Any]:
    """Get the current render config.

    1. If cache is fresh (< 5s old), return cached.
    2. Try fetching from Supabase.
    3. On failure, fall back to local config.yaml.
    """
    global _cache, _cache_time

    now = time.time()
    if _cache is not None and (now - _cache_time) < _CACHE_TTL:
        return _cache

    client = _init_supabase()
    if client is not None:
        try:
            result = client.table("render_config").select("*").eq("id", True).single().execute()
            config = _row_to_config(result.data)
            _cache = config
            _cache_time = now
            return config
        except Exception as e:
            logger.warning("Supabase fetch failed, using fallback: %s", e)

    fallback = _load_yaml_fallback(config_path)
    fallback["_meta"] = {"source": "yaml_fallback"}
    _cache = fallback
    _cache_time = now
    return fallback


def get_active_template(config: dict[str, Any]) -> str:
    """Get the active template name from config."""
    meta = config.get("_meta", {})
    return meta.get("template", "dictionary")


def get_paper_px(config: dict[str, Any]) -> int:
    """Get paper width in pixels."""
    meta = config.get("_meta", {})
    return meta.get("paper_px", 576)
```

- [ ] **Step 4: Update main.py to use Supabase config**

In `apps/print-renderer/main.py`, replace the static config loading:

Replace lines 25-27:
```python
_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")
with open(_CONFIG_PATH) as f:
    RENDER_CONFIG = yaml.safe_load(f)
```

With:
```python
from supabase_config import get_render_config, get_active_template, get_paper_px

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")
```

Then update each endpoint to call `get_render_config(_CONFIG_PATH)` instead of using the static `RENDER_CONFIG`. For example, in the `/render/dictionary` endpoint:

In the existing code at line 63 of `main.py`:
```python
    img = render_dictionary_image(data, RENDER_CONFIG, style=req.template)
```

Replace `RENDER_CONFIG` with `get_render_config(_CONFIG_PATH)`:
```python
    img = render_dictionary_image(data, get_render_config(_CONFIG_PATH), style=req.template)
```

Do the same for every other occurrence of `RENDER_CONFIG` in `main.py` — in `/render/markdown` and `/process/portrait` endpoints. Search for `RENDER_CONFIG` and replace each with `get_render_config(_CONFIG_PATH)`.

Remove the `import yaml` and the static `RENDER_CONFIG` variable (no longer needed at module level).

- [ ] **Step 5: Test with YAML fallback (no Supabase configured)**

```bash
cd apps/print-renderer
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

```bash
curl -X POST http://localhost:8000/render/dictionary \
  -H "Content-Type: application/json" \
  -d '{"word":"TEST","definition":"A test definition.","citations":["test"]}' \
  --output /tmp/test_card.png
```

Expected: PNG file created, logs show "Supabase not configured — using YAML fallback only".

- [ ] **Step 6: Test with Supabase configured**

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`, restart, repeat the curl test.

Expected: Logs show "Supabase config reader initialized", PNG renders correctly with DB config values.

- [ ] **Step 7: Commit**

```bash
git add apps/print-renderer/supabase_config.py apps/print-renderer/main.py \
        apps/print-renderer/requirements.txt apps/print-renderer/.env.example
git commit -m "feat: print-renderer reads config from Supabase with YAML fallback"
```

---

## Task 4: Add config override support to render endpoints

**Files:**
- Modify: `apps/print-renderer/main.py`

The config page needs to preview with unsaved settings. Each render endpoint accepts an optional `config_override` dict that is merged onto the active config for that single request.

- [ ] **Step 1: Add config_override to DictionaryRequest**

In `apps/print-renderer/main.py`, update the request model:

```python
class DictionaryRequest(BaseModel):
    word: str
    definition: str
    citations: list[str] = []
    template: str = "dictionary"
    config_override: dict | None = None  # Merged onto template config for previews
```

- [ ] **Step 2: Apply override in render_dictionary endpoint**

```python
@app.post("/render/dictionary", dependencies=[Depends(verify_api_key)])
def render_dictionary(req: DictionaryRequest):
    data = {"word": req.word, "definition": req.definition, "citations": req.citations}
    config = get_render_config(_CONFIG_PATH)
    if req.config_override:
        # Merge overrides into the active template's config (copy to avoid mutating cache)
        template_key = req.template
        if template_key in config:
            merged = {**config[template_key], **req.config_override}
            config = {**config, **{template_key: merged}}
    img = render_dictionary_image(data, config, style=req.template)
    return _image_response(img)
```

- [ ] **Step 3: Test config override**

```bash
curl -X POST http://localhost:8000/render/dictionary \
  -H "Content-Type: application/json" \
  -d '{"word":"BIG","definition":"A big word.","citations":[],"template":"dictionary","config_override":{"size_word":64,"margin":40}}' \
  --output /tmp/test_override.png
```

Expected: PNG with visibly larger word size (64px vs default 32px).

- [ ] **Step 4: Commit**

```bash
git add apps/print-renderer/main.py
git commit -m "feat: render endpoints accept config_override for live previews"
```

---

## Task 5: Add /render/slice endpoint

**Files:**
- Modify: `apps/print-renderer/main.py`

- [ ] **Step 1: Add slice endpoint**

Add to `apps/print-renderer/main.py`:

```python
import io
import base64
import json

from helpers import open_image
from dithering import _prepare, _apply_blur, dither_image


@app.post("/render/slice", dependencies=[Depends(verify_api_key)])
async def render_slice(
    file: UploadFile = File(...),
    direction: str = "vertical",
    count: int = 10,
    labels: str = "[]",
    label_position: str = "above",
    dither_mode: str | None = None,
    paper_px: int | None = None,
):
    """Slice an image into strips, optionally dither, add labels, return as base64 PNGs."""
    from PIL import Image, ImageDraw, ImageFont

    image_bytes = await file.read()
    img = open_image(image_bytes)
    w, h = img.size

    config = get_render_config(_CONFIG_PATH)
    _paper_px = paper_px or get_paper_px(config)
    _dither_mode = dither_mode or config.get("halftone", {}).get("mode", "floyd")
    halftone_cfg = config.get("halftone", {})

    label_list = json.loads(labels)

    # Slice
    strips = []
    if direction == "vertical":
        strip_w = w // count
        for i in range(count):
            x0 = i * strip_w
            x1 = w if i == count - 1 else (i + 1) * strip_w
            strip = img.crop((x0, 0, x1, h))
            ratio = _paper_px / strip.size[0]
            strip = strip.resize((_paper_px, int(strip.size[1] * ratio)), Image.LANCZOS)
            strips.append(strip)
    else:
        ratio = _paper_px / w
        img = img.resize((_paper_px, int(h * ratio)), Image.LANCZOS)
        w, h = img.size
        strip_h = h // count
        for i in range(count):
            y0 = i * strip_h
            y1 = h if i == count - 1 else (i + 1) * strip_h
            strips.append(img.crop((0, y0, w, y1)))

    # Dither + label each strip
    results = []
    for i, strip in enumerate(strips):
        # Dither
        contrast = halftone_cfg.get("contrast", 1.3)
        brightness = halftone_cfg.get("brightness", 1.0)
        sharpness = halftone_cfg.get("sharpness", 1.2)
        blur = halftone_cfg.get("blur", 0)

        grey = _prepare(strip, _paper_px, contrast, brightness, sharpness)
        if blur:
            grey = _apply_blur(grey, blur)
        dithered = dither_image(grey, _dither_mode)

        # Convert to RGB for labeling
        labeled = dithered.convert("RGB")

        # Add label if provided
        label = label_list[i] if i < len(label_list) else ""
        if label:
            draw = ImageDraw.Draw(labeled)
            try:
                font = ImageFont.truetype("fonts/DejaVuSans.ttf", 16)
            except Exception:
                font = ImageFont.load_default()
            bbox = draw.textbbox((0, 0), label, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            x = (_paper_px - tw) // 2
            if label_position == "above":
                # Prepend label area
                new_img = Image.new("RGB", (_paper_px, labeled.size[1] + th + 10), (255, 255, 255))
                draw2 = ImageDraw.Draw(new_img)
                draw2.text((x, 2), label, fill=(0, 0, 0), font=font)
                new_img.paste(labeled, (0, th + 10))
                labeled = new_img
            else:
                # Append label area
                new_img = Image.new("RGB", (_paper_px, labeled.size[1] + th + 10), (255, 255, 255))
                new_img.paste(labeled, (0, 0))
                draw2 = ImageDraw.Draw(new_img)
                draw2.text((x, labeled.size[1] + 2), label, fill=(0, 0, 0), font=font)
                labeled = new_img

        # Encode as base64 PNG
        buf = io.BytesIO()
        labeled.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        results.append({
            "name": f"slice_{i}",
            "label": label,
            "image_b64": b64,
        })

    return {"slices": results, "count": len(results), "direction": direction}
```

- [ ] **Step 2: Test slice endpoint**

```bash
curl -X POST http://localhost:8000/render/slice \
  -F "file=@../pos-server/test_portrait.jpg" \
  -F "direction=vertical" \
  -F "count=3" \
  -F 'labels=["1/3","2/3","3/3"]' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"count\"]} slices, direction={d[\"direction\"]}')"
```

Expected: `3 slices, direction=vertical`

- [ ] **Step 3: Commit**

```bash
git add apps/print-renderer/main.py
git commit -m "feat: add /render/slice endpoint for image partitioning with labels"
```

---

## Task 6: Extend backend GET /api/config

**Files:**
- Modify: `apps/backend/src/routes/config.ts`
- Modify: `apps/tablet/src/lib/api.ts`

The backend returns all config fields so the tablet has everything it needs in one request.

- [ ] **Step 1: Extend the backend config route**

In `apps/backend/src/routes/config.ts`, update the GET handler (starting at line 59).

**First**, change the `.select()` call at line 63 from:
```typescript
.select('id, mode, active_term, active_text_id, program, updated_at')
```
to:
```typescript
.select('*')
```

This fetches all columns including the 40+ new ones added by the migration. The backend uses the service role key, so RLS is not a concern.

**Then**, add a prompts fetch after the existing `installation_config` fetch (around line 65):

```typescript
// Fetch active program's prompt template (if exists in DB)
const { data: promptData } = await supabase
  .from('prompts')
  .select('system_prompt, first_message_de, first_message_en')
  .eq('program_id', config.program || 'aphorism')
  .maybeSingle();
```

Extend the response object to include all new fields:

```typescript
return c.json({
  // Existing fields
  mode: config.mode,
  term: activeTerm,
  program: config.program || 'aphorism',
  text: textData ?? undefined,
  chain_context: chainContext ?? undefined,
  voice_chain: voiceChainState ?? undefined,

  // New: language
  language: config.language || 'de',

  // New: stage overrides (null = use program defaults)
  stages: {
    textReading: config.stage_text_reading,
    termPrompt: config.stage_term_prompt,
    portrait: config.stage_portrait,
    printing: config.stage_printing,
  },

  // New: face detection
  faceDetection: {
    enabled: config.face_detection_enabled ?? true,
    wakeMs: config.face_wake_ms ?? 3000,
    sleepMs: config.face_sleep_ms ?? 30000,
    intervalMs: config.face_detection_interval_ms ?? 500,
    minConfidence: config.face_min_confidence ?? 0.5,
  },

  // New: timers
  timers: {
    welcomeMs: config.welcome_duration_ms ?? 3000,
    termPromptMs: config.term_prompt_duration_ms ?? 2000,
    definitionDisplayMs: config.definition_display_ms ?? 10000,
    farewellMs: config.farewell_duration_ms ?? 15000,
    printTimeoutMs: config.print_timeout_ms ?? 30000,
  },

  // New: ElevenLabs (non-secret)
  elevenlabs: {
    agentId: config.elevenlabs_agent_id || undefined,
    voiceId: config.elevenlabs_voice_id || undefined,
  },

  // New: voice settings
  voice: {
    stability: config.voice_stability ?? 0.35,
    similarityBoost: config.voice_similarity_boost ?? 0.65,
    style: config.voice_style ?? 0.6,
    speakerBoost: config.voice_speaker_boost ?? true,
  },

  // New: voice chain config
  voiceChainConfig: {
    removeBgNoise: config.vc_remove_bg_noise ?? true,
    retentionWindow: config.vc_retention_window ?? 10,
    profileModel: config.vc_profile_model,
    profileTemperature: config.vc_profile_temperature ?? 0.3,
    icebreakerModel: config.vc_icebreaker_model,
    icebreakerTemperature: config.vc_icebreaker_temperature ?? 0.9,
    coldStartDe: config.vc_cold_start_de,
    coldStartEn: config.vc_cold_start_en,
    maxPhrases: config.vc_max_phrases ?? 5,
    maxFavoriteWords: config.vc_max_favorite_words ?? 5,
  },

  // New: portrait capture settings
  portrait: {
    captureDelayMs: config.portrait_capture_delay_ms ?? 5000,
    jpegQuality: config.portrait_jpeg_quality ?? 0.85,
    minBlobSize: config.portrait_min_blob_size ?? 1024,
    blurRadiusCss: config.portrait_blur_radius_css ?? 25,
  },

  // New: display styling
  display: {
    highlightColor: config.display_highlight_color ?? '#fcd34d',
    spokenOpacity: config.display_spoken_opacity ?? 0.4,
    upcomingOpacity: config.display_upcoming_opacity ?? 0.9,
    fontSize: config.display_font_size,
    lineHeight: config.display_line_height ?? 1.8,
    letterSpacing: config.display_letter_spacing,
    maxWidth: config.display_max_width,
  },

  // New: prompt template (if exists in DB)
  prompt: promptData ?? undefined,
});
```

- [ ] **Step 2: Update ConfigResponseSchema in tablet**

In `apps/tablet/src/lib/api.ts`, extend the Zod schema to accept the new optional fields. Add after the existing fields:

```typescript
const ConfigResponseSchema = z.object({
  // Existing
  mode: ModeSchema,
  term: z.string().nullable(),
  program: z.string().optional(),
  text: z.object({ /* existing */ }).optional(),
  chain_context: z.object({ /* existing */ }).nullable().optional(),
  voice_chain: z.object({ /* existing */ }).nullable().optional(),

  // New optional fields (all optional for backwards compatibility)
  language: z.string().optional(),
  stages: z.object({
    textReading: z.boolean().nullable(),
    termPrompt: z.boolean().nullable(),
    portrait: z.boolean().nullable(),
    printing: z.boolean().nullable(),
  }).optional(),
  faceDetection: z.object({
    enabled: z.boolean(),
    wakeMs: z.number(),
    sleepMs: z.number(),
    intervalMs: z.number(),
    minConfidence: z.number(),
  }).optional(),
  timers: z.object({
    welcomeMs: z.number(),
    termPromptMs: z.number(),
    definitionDisplayMs: z.number(),
    farewellMs: z.number(),
    printTimeoutMs: z.number(),
  }).optional(),
  elevenlabs: z.object({
    agentId: z.string().optional(),
    voiceId: z.string().optional(),
  }).optional(),
  voice: z.object({
    stability: z.number(),
    similarityBoost: z.number(),
    style: z.number(),
    speakerBoost: z.boolean(),
  }).optional(),
  voiceChainConfig: z.object({
    removeBgNoise: z.boolean(),
    retentionWindow: z.number(),
    profileModel: z.string().nullable(),
    profileTemperature: z.number(),
    icebreakerModel: z.string().nullable(),
    icebreakerTemperature: z.number(),
    coldStartDe: z.string().nullable(),
    coldStartEn: z.string().nullable(),
    maxPhrases: z.number(),
    maxFavoriteWords: z.number(),
  }).optional(),
  portrait: z.object({
    captureDelayMs: z.number(),
    jpegQuality: z.number(),
    minBlobSize: z.number(),
    blurRadiusCss: z.number(),
  }).optional(),
  display: z.object({
    highlightColor: z.string(),
    spokenOpacity: z.number(),
    upcomingOpacity: z.number(),
    fontSize: z.string().nullable(),
    lineHeight: z.number(),
    letterSpacing: z.string().nullable(),
    maxWidth: z.string().nullable(),
  }).optional(),
  prompt: z.object({
    system_prompt: z.string(),
    first_message_de: z.string(),
    first_message_en: z.string(),
  }).optional(),
});
```

- [ ] **Step 3: Build and typecheck**

```bash
pnpm --filter @meinungeheuer/shared build
pnpm --filter @meinungeheuer/backend build
pnpm --filter @meinungeheuer/tablet build
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/config.ts apps/tablet/src/lib/api.ts
git commit -m "feat: backend serves full config including timers, voice, display, prompts"
```

---

## Task 7: Tablet reads config from response instead of constants

**Files:**
- Modify: `apps/tablet/src/App.tsx`
- Modify: `apps/tablet/src/hooks/useInstallationMachine.ts`
- Modify: `apps/tablet/src/components/TextReader.tsx`

This is the breaking change. Constants.ts remains as fallback defaults.

- [ ] **Step 1: Store full config in App.tsx**

In `apps/tablet/src/App.tsx`, after the config fetch succeeds, store the full response (not just mode/term/program) in a ref or state that child components can access. The simplest approach: pass config fields down as props or through a context.

Create a minimal config context. Add to `apps/tablet/src/lib/configContext.ts`:

```typescript
import { createContext, useContext } from 'react';
import { FACE_DETECTION, TIMERS } from '@meinungeheuer/shared';

export interface RuntimeConfig {
  faceDetection: {
    enabled: boolean;
    wakeMs: number;
    sleepMs: number;
    intervalMs: number;
    minConfidence: number;
  };
  timers: {
    welcomeMs: number;
    termPromptMs: number;
    definitionDisplayMs: number;
    farewellMs: number;
    printTimeoutMs: number;
  };
  voice: {
    stability: number;
    similarityBoost: number;
    style: number;
    speakerBoost: boolean;
  };
  portrait: {
    captureDelayMs: number;
    jpegQuality: number;
    minBlobSize: number;
    blurRadiusCss: number;
  };
  display: {
    highlightColor: string;
    spokenOpacity: number;
    upcomingOpacity: number;
    fontSize: string;
    lineHeight: number;
    letterSpacing: string;
    maxWidth: string;
  };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  faceDetection: {
    enabled: true,
    wakeMs: FACE_DETECTION.WAKE_THRESHOLD_MS,
    sleepMs: FACE_DETECTION.SLEEP_THRESHOLD_MS,
    intervalMs: FACE_DETECTION.DETECTION_INTERVAL_MS,
    minConfidence: FACE_DETECTION.MIN_CONFIDENCE,
  },
  timers: {
    welcomeMs: TIMERS.WELCOME_DURATION_MS,
    termPromptMs: TIMERS.TERM_PROMPT_DURATION_MS,
    definitionDisplayMs: TIMERS.DEFINITION_DISPLAY_MS,
    farewellMs: TIMERS.FAREWELL_DURATION_MS,
    printTimeoutMs: TIMERS.PRINT_TIMEOUT_MS,
  },
  voice: {
    stability: 0.35,
    similarityBoost: 0.65,
    style: 0.6,
    speakerBoost: true,
  },
  portrait: {
    captureDelayMs: 5000,
    jpegQuality: 0.85,
    minBlobSize: 1024,
    blurRadiusCss: 25,
  },
  display: {
    highlightColor: '#fcd34d',
    spokenOpacity: 0.4,
    upcomingOpacity: 0.9,
    fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
    lineHeight: 1.8,
    letterSpacing: '0.02em',
    maxWidth: '700px',
  },
};

export const RuntimeConfigContext = createContext<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);

export function useRuntimeConfig(): RuntimeConfig {
  return useContext(RuntimeConfigContext);
}
```

- [ ] **Step 2: Provide config context in App.tsx**

In `App.tsx`, after the config fetch, merge the response into a `RuntimeConfig` object and wrap the app in the provider:

```typescript
import { RuntimeConfigContext, DEFAULT_RUNTIME_CONFIG, RuntimeConfig } from './lib/configContext';

// In the component, after config fetch:
const runtimeConfig: RuntimeConfig = {
  faceDetection: configResponse.faceDetection ?? DEFAULT_RUNTIME_CONFIG.faceDetection,
  timers: configResponse.timers ?? DEFAULT_RUNTIME_CONFIG.timers,
  voice: configResponse.voice ?? DEFAULT_RUNTIME_CONFIG.voice,
  portrait: configResponse.portrait ?? DEFAULT_RUNTIME_CONFIG.portrait,
  display: configResponse.display ?? DEFAULT_RUNTIME_CONFIG.display,
};

// Wrap in provider:
<RuntimeConfigContext.Provider value={runtimeConfig}>
  {/* existing app content */}
</RuntimeConfigContext.Provider>
```

- [ ] **Step 3: Use config in TextReader for voice settings**

In `apps/tablet/src/components/TextReader.tsx`, replace the hardcoded `VOICE_SETTINGS`:

```typescript
import { useRuntimeConfig } from '../lib/configContext';

// Inside the component:
const config = useRuntimeConfig();

const voiceSettings = {
  stability: config.voice.stability,
  similarity_boost: config.voice.similarityBoost,
  style: config.voice.style,
  use_speaker_boost: config.voice.speakerBoost,
};
```

- [ ] **Step 4: Build and typecheck**

```bash
pnpm --filter @meinungeheuer/shared build
pnpm --filter @meinungeheuer/tablet build
pnpm typecheck
```

- [ ] **Step 5: Test end-to-end**

Start backend + tablet in dev mode:
```bash
pnpm dev:backend &
pnpm dev:tablet
```

Open tablet in browser, check:
1. Config loads without errors (check console)
2. Face detection thresholds use DB values (or defaults if columns not yet populated)
3. Voice settings work (start a conversation, TTS should use DB stability/style values)

- [ ] **Step 6: Commit**

```bash
git add apps/tablet/src/lib/configContext.ts apps/tablet/src/App.tsx \
        apps/tablet/src/components/TextReader.tsx \
        apps/tablet/src/hooks/useInstallationMachine.ts
git commit -m "feat: tablet reads runtime config from backend instead of hardcoded constants"
```

---

## Task 8: Apply migration to production

- [ ] **Step 1: Apply migration**

Use `mcp__supabase__apply_migration` with the content of `012_config_tables.sql`.

- [ ] **Step 2: Verify**

```sql
SELECT count(*) FROM render_config;
-- Expected: 1

SELECT portrait_config->>'style_prompt' != '' AS has_prompt FROM render_config;
-- Expected: true

SELECT count(*) FROM secrets;
-- Expected: 1

SELECT face_wake_ms, voice_stability, display_highlight_color FROM installation_config;
-- Expected: 3000, 0.35, '#fcd34d'
```

- [ ] **Step 3: Commit verification notes**

No code change — just verify the migration landed correctly. If issues, fix and re-apply.

---

## Deployment Notes

After all tasks are done:

1. The migration is applied and verified
2. The print-renderer can be redeployed — it reads from Supabase when configured, falls back to YAML otherwise
3. The backend serves extended config
4. The tablet reads from config response with fallback to constants
5. **Nothing breaks if Supabase config tables are empty** — every field has defaults matching the current hardcoded values

The config page (Plan B) can now be built on top of this foundation.
