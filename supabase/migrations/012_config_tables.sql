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
