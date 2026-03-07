-- ============================================================
-- Seed: Kreativitätsrant text
-- ============================================================
INSERT INTO texts (id, title, content_en, terms) VALUES (
  'kreativitaetsrant',
  'Kreativitätsrant (2024-10-28)',
  E'# 2024-10-28, 2130h\nI am in the bus, I have been the last twelve and a half hours at school.\nThat''s not bragging. That''s sad.\nAs I said, I am in the bus.\nBus No 32 - to "Strassenverkehrsamt", traversing Langstrasse, districts 5, 4 and 3.\n\nToday, as it happens from time to time, I contemplated my distorted sense of reality.\nTo me, my lack of beliefs, of principle, of truths, are - or so I ~~believe~~ think, a driver for creativity.\n\nI had this thought a while ago, that it is ironic / beautiful that as someone who constantly questions reality, I do architecture, changing space in time.\n\nSo, today my thinking and theory is, that since hard truths come with consequences, and as someone-who-is-afraid-of-consequences-although-enjoys-taking-risks, that believing in something bigger is an unpleasant constant (reality rotates around me, after all, not some imaginary creator. (This is no blasphemy but an egotrip. Or a mental condition.)\n\nI will simplify things, and call this mental condition, on a tangible layer, "creativity".\n\nTherefore, I wonder.\nI wonder, if "creative people" are:\n1. "Creative" because they cannot accept consequences, hide from consequences of reality in imaginary worlds.\n2. Less inclined to be religious\n3. ~~The best hope for humanity.~~ Yes.\n4. If everything that goes wrong on this earth is related to architecture. Yes, according to some. But this is not a serious question. I need to put down even my most silly thoughts otherwise this writing stuff is only half as fun.\n\nThe first two are interesting.\nBut inside.\nA deeper truth.\n\nFear of death.\nThe end of everything.\n\nAnother one(s):\n5. Are creative people more inclined to be egocentric, egoistic, assholes? (After all, the world around them does not really exist. And there is no god to judge them later. Or anyway, they cannot accept this idea because it would mean that they would have to justify there misdoings sometime.)\n6. Am I using "Creative" as a slur for "people-like-me"?\n7. Why am I so angry?\n8. Am I actually angry?\n9. Why am I writing all this? Probably I have something important to do and I am procrastinating. So what is it?\n\n(Actually, I revised that text after I came to the conclusion below that I should now meditate, at least, I get a sense of how this stupid, sometimes not so stupid machine works.)\n\nOkay, last one:\n1. Am I just hating on people with more money? That are doing "normal shit"?',
  ARRAY['CREATIVITY', 'REALITY', 'CONSEQUENCES', 'FEAR', 'MEDITATION']
) ON CONFLICT (id) DO NOTHING;

-- Point installation_config to the new text
UPDATE installation_config
SET active_text_id = 'kreativitaetsrant',
    updated_at = now();

-- ============================================================
-- TTS cache table
-- ============================================================
CREATE TABLE IF NOT EXISTS tts_cache (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key          TEXT NOT NULL UNIQUE,
  audio_base64_parts JSONB NOT NULL,
  word_timestamps    JSONB NOT NULL,
  text_length        INTEGER NOT NULL,
  voice_id           TEXT NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_tts_cache" ON tts_cache
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_tts_cache" ON tts_cache
  FOR INSERT TO anon WITH CHECK (true);
