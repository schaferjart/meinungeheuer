import { useState, useEffect } from 'react';
import type { CacheAdapter, AlignmentData, WordTimestamp } from '../../types.js';
import { buildWordTimestamps } from '../../utils/buildWordTimestamps.js';
import { splitTextIntoChunks } from '../../utils/splitTextIntoChunks.js';
import { computeCacheKey } from '../../utils/computeCacheKey.js';

// ============================================================
// Types
// ============================================================

export interface ElevenLabsTTSOptions {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId?: string;
  outputFormat?: string;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  maxWordsPerChunk?: number;
  cache?: CacheAdapter;
  signal?: AbortSignal;
}

export interface ElevenLabsTTSResult {
  /** Blob URL — caller must revoke when done */
  audioUrl: string;
  timestamps: WordTimestamp[];
}

// ============================================================
// Internal types
// ============================================================

interface ChunkResponse {
  audio_base64: string;
  alignment: AlignmentData | null;
  normalized_alignment: AlignmentData | null;
}

// ============================================================
// Helpers (non-exported)
// ============================================================

/**
 * Decode an array of base64-encoded audio strings into a single Blob URL.
 */
function base64PartsToAudioUrl(parts: string[]): string {
  const byteArrays = parts.map((base64) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  });

  const blob = new Blob(byteArrays, { type: 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

/**
 * Fetch TTS audio + alignment data for a single text chunk from the ElevenLabs API.
 */
async function fetchChunkTTS(options: {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId: string;
  outputFormat: string;
  voiceSettings?: ElevenLabsTTSOptions['voiceSettings'];
  signal?: AbortSignal;
}): Promise<ChunkResponse> {
  const { apiKey, voiceId, text, modelId, outputFormat, voiceSettings, signal } = options;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        output_format: outputFormat,
        ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
      }),
      signal,
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `ElevenLabs TTS API error (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as ChunkResponse;

  if (!data.alignment && !data.normalized_alignment) {
    throw new Error(
      'ElevenLabs TTS API returned no alignment data. Both alignment and normalized_alignment are null.',
    );
  }

  return data;
}

// ============================================================
// Main orchestration function
// ============================================================

/**
 * Fetch TTS audio with word-level timestamps from the ElevenLabs API.
 *
 * Handles text chunking for long inputs, cache integration, and
 * abort signal support. Returns a blob URL (caller must revoke) and
 * an array of WordTimestamp objects compatible with KaraokeReader.
 */
export async function fetchElevenLabsTTS(
  options: ElevenLabsTTSOptions,
): Promise<ElevenLabsTTSResult> {
  const {
    apiKey,
    voiceId,
    text,
    modelId = 'eleven_multilingual_v2',
    outputFormat = 'mp3_44100_128',
    voiceSettings,
    maxWordsPerChunk = 200,
    cache,
    signal,
  } = options;

  // 1. Compute cache key (async — uses crypto.subtle.digest)
  const cacheKey = await computeCacheKey(text, voiceId);

  // 2. Try cache hit
  if (cache) {
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        const audioUrl = base64PartsToAudioUrl(cached.audioBase64Parts);
        return { audioUrl, timestamps: cached.wordTimestamps };
      }
    } catch {
      // Cache errors never throw — fall through to fetch
    }
  }

  // 3. Split text into chunks
  const chunks = splitTextIntoChunks(text, maxWordsPerChunk);

  // 4. Fetch each chunk sequentially
  const allBase64Parts: string[] = [];
  const allTimestamps: WordTimestamp[] = [];
  let timeOffset = 0;
  let totalWordCount = 0;

  for (const chunkText of chunks) {
    const data = await fetchChunkTTS({
      apiKey,
      voiceId,
      text: chunkText,
      modelId,
      outputFormat,
      voiceSettings,
      signal,
    });

    // Use alignment if non-null; otherwise fall back to normalized_alignment
    const alignment = (data.alignment ?? data.normalized_alignment) as AlignmentData;

    // Build word timestamps with accumulated time offset
    const chunkTimestamps = buildWordTimestamps(chunkText, alignment, timeOffset);

    // Reindex word timestamps by adding the total word count from prior chunks
    const reindexed = chunkTimestamps.map((ts) => ({
      ...ts,
      index: ts.index + totalWordCount,
    }));

    // Update accumulators
    allBase64Parts.push(data.audio_base64);
    allTimestamps.push(...reindexed);
    totalWordCount += chunkTimestamps.length;

    // Update time offset to the last character's end time
    const endTimes = alignment.character_end_times_seconds;
    if (endTimes.length > 0) {
      timeOffset = endTimes[endTimes.length - 1] ?? timeOffset;
    }
  }

  // 5. Create blob URL from all base64 parts
  const audioUrl = base64PartsToAudioUrl(allBase64Parts);

  // 6. Fire-and-forget cache store
  if (cache) {
    cache.set(cacheKey, {
      audioBase64Parts: allBase64Parts,
      wordTimestamps: allTimestamps,
    }).catch(() => {
      // Cache errors never throw — swallow rejections
    });
  }

  // 7. Return result
  return { audioUrl, timestamps: allTimestamps };
}

// ============================================================
// React convenience hook
// ============================================================

type ElevenLabsTTSStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseElevenLabsTTSReturn {
  status: ElevenLabsTTSStatus;
  result: ElevenLabsTTSResult | null;
  error: Error | null;
}

/**
 * React hook that wraps `fetchElevenLabsTTS`.
 *
 * Pass `null` to stay idle (no fetch). Pass options to trigger a fetch.
 * Handles abort on cleanup and revokes blob URLs from previous results.
 */
export function useElevenLabsTTS(
  options: ElevenLabsTTSOptions | null,
): UseElevenLabsTTSReturn {
  const [status, setStatus] = useState<ElevenLabsTTSStatus>('idle');
  const [result, setResult] = useState<ElevenLabsTTSResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!options) {
      setStatus('idle');
      setResult(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let blobUrl: string | null = null;

    setStatus('loading');
    setError(null);

    fetchElevenLabsTTS({ ...options, signal: controller.signal })
      .then((fetchResult) => {
        if (controller.signal.aborted) return;
        blobUrl = fetchResult.audioUrl;
        setResult(fetchResult);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      });

    return () => {
      controller.abort();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
    // Stringify options to stabilize dependency — options object identity may change on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options ? JSON.stringify(options) : null]);

  return { status, result, error };
}
