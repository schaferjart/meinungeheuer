import type { WordTimestamp } from '../hooks/useTextToSpeechWithTimestamps';
import { getSupabaseClient } from './supabase';

interface CachedTts {
  audioBase64Parts: string[];
  wordTimestamps: WordTimestamp[];
}

/**
 * Compute a SHA-256 cache key from stripped text + voice ID.
 */
export async function computeCacheKey(text: string, voiceId: string): Promise<string> {
  const input = text.replace(/\s+/g, ' ').trim() + '|' + voiceId;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Look up cached TTS data by cache key. Returns null on miss or error.
 */
export async function getCachedTts(cacheKey: string): Promise<CachedTts | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('tts_cache')
      .select('audio_base64_parts, word_timestamps')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) return null;

    return {
      audioBase64Parts: data.audio_base64_parts as string[],
      wordTimestamps: data.word_timestamps as WordTimestamp[],
    };
  } catch (err) {
    console.warn('[TTS Cache] Read error:', err);
    return null;
  }
}

/**
 * Store TTS data in cache. Fire-and-forget — errors are logged, never thrown.
 */
export async function storeTtsCache(
  cacheKey: string,
  audioBase64Parts: string[],
  wordTimestamps: WordTimestamp[],
  textLength: number,
  voiceId: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('tts_cache').insert({
      cache_key: cacheKey,
      audio_base64_parts: audioBase64Parts,
      word_timestamps: wordTimestamps as unknown[],
      text_length: textLength,
      voice_id: voiceId,
    });

    if (error) {
      // Duplicate key is fine — another tab/session may have cached it first
      if (error.code === '23505') {
        console.log('[TTS Cache] Already cached (duplicate key)');
      } else {
        console.warn('[TTS Cache] Write error:', error.message);
      }
    } else {
      console.log('[TTS Cache] Stored successfully, text_length:', textLength);
    }
  } catch (err) {
    console.warn('[TTS Cache] Write error:', err);
  }
}
