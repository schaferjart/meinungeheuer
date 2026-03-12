-- Voice chain state: tracks cloned voices, speech profiles, and icebreakers
-- for the voice chain program where each visitor's voice/style feeds the next.

CREATE TABLE IF NOT EXISTS voice_chain_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The session this chain link was produced from
  session_id UUID REFERENCES sessions(id),
  -- ElevenLabs voice clone ID (used in TTS override for next visitor)
  voice_clone_id TEXT,
  -- Clone lifecycle: pending → ready → deleted (after 2 sessions)
  voice_clone_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (voice_clone_status IN ('pending', 'ready', 'failed', 'deleted')),
  -- LLM-extracted speech profile of the visitor
  speech_profile JSONB,
  -- Generated icebreaker for the next visitor
  icebreaker TEXT,
  -- URL to the blurred portrait in Supabase Storage
  portrait_blurred_url TEXT,
  -- Position in the chain (1 = first visitor, increments)
  chain_position INTEGER NOT NULL DEFAULT 1,
  -- Whether this is the active/latest chain state
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Path to visitor's audio sample in Supabase Storage
  visitor_audio_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup for the latest active chain state
CREATE INDEX idx_voice_chain_active ON voice_chain_state(is_active, created_at DESC);

-- RLS: allow anon to read active voice chain state (tablet needs it on startup)
ALTER TABLE voice_chain_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read active voice chain state"
  ON voice_chain_state
  FOR SELECT
  TO anon
  USING (is_active = true);

-- Backend (service role) has full access via service_role key, no policy needed.
-- But we need anon INSERT for the tablet to write audio capture metadata:
CREATE POLICY "anon can insert voice chain state"
  ON voice_chain_state
  FOR INSERT
  TO anon
  WITH CHECK (true);
