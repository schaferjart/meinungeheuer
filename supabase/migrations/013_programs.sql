-- 013_programs.sql
-- Programs table: stores named pipeline configurations for the installation.
-- Each program defines an ordered set of pipeline blocks and their JSONB config.

CREATE TABLE IF NOT EXISTS programs (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  pipeline      text[] NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}',
  is_active     boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Public read (tablet and printer bridge use anon key)
CREATE POLICY "programs_read" ON programs FOR SELECT USING (true);

-- Authenticated write (config app / operator)
CREATE POLICY "programs_authenticated_insert" ON programs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "programs_authenticated_update" ON programs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "programs_authenticated_delete" ON programs
  FOR DELETE TO authenticated USING (true);

-- updated_at trigger (update_timestamp() defined in 012_config_tables.sql)
DROP TRIGGER IF EXISTS set_updated_at ON programs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ---------------------------------------------------------------------------
-- Seed: 3 built-in programs (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO programs (id, name, pipeline, config, is_active) VALUES (
  'aphorism',
  'Aphorism',
  ARRAY['face_detect', 'text_display', 'conversation', 'print_card'],
  '{
    "face_detect": {
      "enabled": true,
      "wake_ms": 3000,
      "sleep_ms": 30000,
      "interval_ms": 500,
      "min_confidence": 0.5
    },
    "text_display": {
      "text_id": null,
      "highlight_color": "#fcd34d",
      "spoken_opacity": 0.4,
      "upcoming_opacity": 0.9,
      "font_size": "clamp(1.2rem, 3vw, 1.8rem)",
      "line_height": 1.8,
      "letter_spacing": "0.02em",
      "max_width": "700px"
    },
    "conversation": {
      "prompt_template": "",
      "first_message_de": "Du hast gerade einen Text gelesen. Was ist dir hängengeblieben?",
      "first_message_en": "You just read a text. What stayed with you?",
      "voice_stability": 0.35,
      "voice_similarity_boost": 0.65,
      "voice_style": 0.6,
      "voice_speaker_boost": true,
      "language": "de"
    },
    "print_card": {
      "template": "dictionary",
      "result_display": "aphorism"
    }
  }'::jsonb,
  false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO programs (id, name, pipeline, config, is_active) VALUES (
  'free_association',
  'Free Association',
  ARRAY['face_detect', 'conversation', 'print_card'],
  '{
    "face_detect": {
      "enabled": true,
      "wake_ms": 3000,
      "sleep_ms": 30000,
      "interval_ms": 500,
      "min_confidence": 0.5
    },
    "conversation": {
      "prompt_template": "",
      "first_message_de": "Was geht dir gerade durch den Kopf? Was beschäftigt dich?",
      "first_message_en": "What is on your mind right now? What have you been thinking about?",
      "voice_stability": 0.35,
      "voice_similarity_boost": 0.65,
      "voice_style": 0.6,
      "voice_speaker_boost": true,
      "language": "de"
    },
    "print_card": {
      "template": "dictionary",
      "result_display": "definition"
    }
  }'::jsonb,
  false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO programs (id, name, pipeline, config, is_active) VALUES (
  'voice_chain',
  'Voice Chain',
  ARRAY['face_detect', 'voice_chain', 'conversation', 'portrait_capture', 'print_card'],
  '{
    "face_detect": {
      "enabled": true,
      "wake_ms": 3000,
      "sleep_ms": 30000,
      "interval_ms": 500,
      "min_confidence": 0.5
    },
    "voice_chain": {
      "remove_bg_noise": true,
      "retention_window": 10,
      "profile_model": "google/gemini-2.0-flash-001",
      "profile_temperature": 0.3,
      "icebreaker_model": "google/gemini-2.0-flash-001",
      "icebreaker_temperature": 0.9,
      "cold_start_de": "Jemand war gerade hier vor dir. Sie haben etwas hinterlassen. Ich bin neugierig -- was bringst du mit?",
      "cold_start_en": "Someone was just here before you. They left something behind. I am curious -- what do you bring?",
      "max_phrases": 5,
      "max_favorite_words": 5
    },
    "conversation": {
      "prompt_template": "",
      "first_message_de": "",
      "first_message_en": "",
      "voice_stability": 0.35,
      "voice_similarity_boost": 0.65,
      "voice_style": 0.6,
      "voice_speaker_boost": true,
      "language": "de"
    },
    "portrait_capture": {
      "delay_ms": 5000,
      "jpeg_quality": 0.85,
      "min_blob_size": 1024,
      "blur_radius_css": 25
    },
    "print_card": {
      "template": "dictionary",
      "result_display": "aphorism"
    }
  }'::jsonb,
  true
) ON CONFLICT (id) DO NOTHING;
