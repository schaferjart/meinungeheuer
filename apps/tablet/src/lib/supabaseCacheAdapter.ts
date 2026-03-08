import type { CacheAdapter, TTSCacheValue } from 'karaoke-reader';
import { getSupabaseClient } from './supabase';

/**
 * Create a Supabase-backed TTS cache adapter implementing the generic
 * CacheAdapter interface from karaoke-reader.
 *
 * Reads/writes the `tts_cache` table. Errors never throw -- get returns
 * null on failure, set silently swallows errors (fire-and-forget).
 */
export function createSupabaseTTSCache(): CacheAdapter {
  return {
    async get(key: string): Promise<TTSCacheValue | null> {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('tts_cache')
          .select('audio_base64_parts, word_timestamps')
          .eq('cache_key', key)
          .single();
        if (error || !data) return null;
        return {
          audioBase64Parts: data.audio_base64_parts as string[],
          wordTimestamps: data.word_timestamps as TTSCacheValue['wordTimestamps'],
        };
      } catch {
        return null;
      }
    },
    async set(key: string, value: TTSCacheValue): Promise<void> {
      try {
        const supabase = getSupabaseClient();
        // text_length and voice_id are NOT NULL in the DB schema.
        // The generic CacheAdapter interface doesn't carry these, so we
        // compute text_length from the word timestamps and default voice_id.
        const textLength = value.wordTimestamps.reduce(
          (acc, w) => acc + w.word.length + 1,
          0,
        );
        const { error } = await supabase.from('tts_cache').insert({
          cache_key: key,
          audio_base64_parts: value.audioBase64Parts,
          word_timestamps: value.wordTimestamps as unknown[],
          text_length: textLength,
          voice_id: 'unknown',
        });
        if (error && error.code !== '23505') {
          console.warn('[TTS Cache] Write error:', error.message);
        }
      } catch (err) {
        console.warn('[TTS Cache] Write error:', err);
      }
    },
  };
}
