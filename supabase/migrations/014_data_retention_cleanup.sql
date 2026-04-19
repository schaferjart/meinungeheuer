-- ---------------------------------------------------------------------------
-- 014: Automatic visitor data cleanup (24h retention)
--
-- Deletes voice clones, conversation audio, and blurred portraits after 24h.
-- AI-masked outputs (styled portraits, definitions, transcripts) are permanent.
-- ---------------------------------------------------------------------------

-- a) Formalize the portraits-blurred bucket (was created manually)
INSERT INTO storage.buckets (id, name, public)
VALUES ('portraits-blurred', 'portraits-blurred', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "portraits_blurred_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portraits-blurred');

CREATE POLICY "portraits_blurred_service_upload"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'portraits-blurred');

CREATE POLICY "portraits_blurred_service_delete"
  ON storage.objects FOR DELETE TO service_role
  USING (bucket_id = 'portraits-blurred');

-- Tablet (anon) needs to upload blurred portraits
CREATE POLICY "portraits_blurred_anon_upload"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'portraits-blurred');

-- b) Enable pg_cron and pg_net for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- c) Partial indexes for cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_stale_conversations
  ON sessions(created_at) WHERE elevenlabs_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_chain_stale
  ON voice_chain_state(created_at) WHERE voice_clone_status = 'ready';

-- d) Daily cleanup cron job at 4 AM UTC
-- Reads backend_url and webhook_secret dynamically from config tables
SELECT cron.schedule(
  'cleanup-visitor-data',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT backend_url FROM installation_config LIMIT 1)
           || '/api/cleanup/run?secret='
           || (SELECT webhook_secret FROM secrets LIMIT 1),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
