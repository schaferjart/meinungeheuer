import { useCallback, useEffect, useRef, useState } from 'react';
import { computeCacheKey, getCachedTts, storeTtsCache } from '../lib/ttsCache';

// ============================================================
// Types
// ============================================================

export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
  index: number;
}

export type TtsStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error';

export interface UseTextToSpeechWithTimestampsParams {
  text: string;
  voiceId: string;
  apiKey: string;
  autoPlay?: boolean;
}

export interface UseTextToSpeechWithTimestampsReturn {
  status: TtsStatus;
  words: WordTimestamp[];
  activeWordIndex: number;
  play: () => void;
  pause: () => void;
  error: string | null;
  volume: number;
  setVolume: (v: number) => void;
}

// ============================================================
// ElevenLabs TTS with-timestamps response shape
// ============================================================

interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface TtsResponse {
  audio_base64: string;
  alignment: AlignmentData | null;
  normalized_alignment: AlignmentData | null;
}

// ============================================================
// Pure functions (exported for testing)
// ============================================================

/**
 * Convert character-level alignment data into word-level timestamps.
 *
 * Walks through the original text splitting on whitespace boundaries and
 * maps each word to the start time of its first character and the end
 * time of its last character from the alignment data.
 */
export function buildWordTimestamps(
  text: string,
  alignment: AlignmentData,
  timeOffset: number = 0,
): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  const { character_start_times_seconds, character_end_times_seconds } = alignment;

  // Walk through the text identifying word boundaries.
  // A "word" is any contiguous run of non-whitespace characters.
  let charIndex = 0;
  let wordIndex = 0;
  const textLength = text.length;

  while (charIndex < textLength) {
    // Skip whitespace
    while (charIndex < textLength && /\s/.test(text[charIndex] ?? '')) {
      charIndex++;
    }

    if (charIndex >= textLength) break;

    // Collect word characters
    const wordStart = charIndex;
    while (charIndex < textLength && !/\s/.test(text[charIndex] ?? '')) {
      charIndex++;
    }
    const wordEnd = charIndex; // exclusive

    const wordStr = text.slice(wordStart, wordEnd);
    if (wordStr.length === 0) continue;

    // Map to alignment times. The alignment array should have one entry
    // per character in the input text. Guard against mismatches.
    const startCharIdx = wordStart;
    const endCharIdx = wordEnd - 1;

    const startTime = character_start_times_seconds[startCharIdx];
    const endTime = character_end_times_seconds[endCharIdx];

    if (startTime !== undefined && endTime !== undefined) {
      words.push({
        word: wordStr,
        startTime: startTime + timeOffset,
        endTime: endTime + timeOffset,
        index: wordIndex,
      });
    } else {
      // Alignment data shorter than text — use last known times as fallback
      const lastKnownStart =
        character_start_times_seconds[character_start_times_seconds.length - 1] ?? 0;
      const lastKnownEnd =
        character_end_times_seconds[character_end_times_seconds.length - 1] ?? lastKnownStart;
      words.push({
        word: wordStr,
        startTime: lastKnownStart + timeOffset,
        endTime: lastKnownEnd + timeOffset,
        index: wordIndex,
      });
    }

    wordIndex++;
  }

  return words;
}

/**
 * Split long text into chunks at sentence boundaries.
 * Each chunk targets ~maxWordsPerChunk words but won't break mid-sentence.
 */
export function splitTextIntoChunks(text: string, maxWordsPerChunk: number = 200): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g);

  // If no sentence boundaries found, or text is short enough, return as-is
  if (!sentences) return [text];

  const totalWords = text.split(/\s+/).filter(Boolean).length;
  if (totalWords <= maxWordsPerChunk) return [text];

  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).filter(Boolean).length;

    if (currentWordCount + sentenceWordCount > maxWordsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWordCount = 0;
    }

    currentChunk += sentence;
    currentWordCount += sentenceWordCount;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

// ============================================================
// API call
// ============================================================

const TTS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

async function fetchTtsWithTimestamps(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<{ audioBase64: string; alignment: AlignmentData }> {
  const url = `${TTS_BASE_URL}/${voiceId}/with-timestamps`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.65,
        style: 0.6,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs TTS API error ${response.status}: ${errorText}`);
  }

  // Response is a single JSON object (not NDJSON)
  const data = (await response.json()) as TtsResponse;

  if (!data.audio_base64) {
    throw new Error('ElevenLabs TTS returned no audio data');
  }

  // Prefer alignment over normalized_alignment — alignment maps to the original text characters
  const alignment = data.alignment ?? data.normalized_alignment;
  if (!alignment) {
    throw new Error('ElevenLabs TTS returned no alignment data');
  }

  console.log('[TTS] API response:', {
    audioBase64Length: data.audio_base64.length,
    alignmentChars: alignment.characters.length,
    textLength: text.length,
  });

  return { audioBase64: data.audio_base64, alignment };
}

/**
 * Decode one or more base64 audio strings into a single Blob URL.
 * Each string is decoded independently and concatenated as raw bytes.
 */
function base64PartsToAudioUrl(parts: string[]): string {
  const binaryParts: Uint8Array[] = [];

  for (const part of parts) {
    const binary = atob(part);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    binaryParts.push(bytes);
  }

  const blob = new Blob(binaryParts, { type: 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

// ============================================================
// Hook
// ============================================================

export function useTextToSpeechWithTimestamps(
  params: UseTextToSpeechWithTimestampsParams,
): UseTextToSpeechWithTimestampsReturn {
  const { text, voiceId, apiKey, autoPlay = false } = params;

  const [status, setStatus] = useState<TtsStatus>('idle');
  const [words, setWords] = useState<WordTimestamp[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1);
  const volumeRef = useRef(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Store words in a ref for the animation frame callback
  const wordsRef = useRef<WordTimestamp[]>([]);
  wordsRef.current = words;

  // -----------------------------------------------------------------------
  // Animation frame loop: sync activeWordIndex to audio.currentTime
  // -----------------------------------------------------------------------
  const updateActiveWord = useCallback(() => {
    const audio = audioRef.current;
    const cues = wordsRef.current;

    if (!audio || cues.length === 0) {
      animationFrameRef.current = requestAnimationFrame(updateActiveWord);
      return;
    }

    const t = audio.currentTime;

    // Binary search: cues are sorted by startTime
    let lo = 0;
    let hi = cues.length - 1;
    let foundIndex = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const w = cues[mid];
      if (!w) break;
      if (w.endTime <= t) {
        lo = mid + 1;
      } else if (w.startTime > t) {
        hi = mid - 1;
      } else {
        foundIndex = mid;
        break;
      }
    }

    // Gap between words: keep highlighting the last word we passed
    if (foundIndex === -1 && lo > 0) {
      foundIndex = lo - 1;
    }

    setActiveWordIndex(foundIndex);
    animationFrameRef.current = requestAnimationFrame(updateActiveWord);
  }, []);

  const startAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(updateActiveWord);
  }, [updateActiveWord]);

  const stopAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Volume control
  // -----------------------------------------------------------------------
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Play / Pause controls
  // -----------------------------------------------------------------------
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (status === 'done') {
      // Restart from beginning
      audio.currentTime = 0;
    }

    audio.play().catch((err: unknown) => {
      console.error('[TTS] Playback error:', err);
      setError(err instanceof Error ? err.message : 'Playback failed');
      setStatus('error');
    });
    setStatus('playing');
    startAnimationLoop();
  }, [status, startAnimationLoop]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setStatus('paused');
    stopAnimationLoop();
  }, [stopAnimationLoop]);

  // -----------------------------------------------------------------------
  // Fetch TTS data when text/voiceId/apiKey change
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!text || !voiceId || !apiKey) {
      console.warn('[TTS] Missing params:', { text: !!text, voiceId: !!voiceId, apiKey: !!apiKey });
      return;
    }

    console.log('[TTS] Starting TTS fetch for text length:', text.length);

    // Reset state
    setStatus('loading');
    setWords([]);
    setActiveWordIndex(-1);
    setError(null);

    // Cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    stopAnimationLoop();

    let cancelled = false;

    async function loadTts() {
      try {
        let allAudioBase64Parts: string[];
        let allWords: WordTimestamp[];

        // --- Cache lookup ---
        const cacheKey = await computeCacheKey(text, voiceId);

        if (cancelled) return;

        const cached = await getCachedTts(cacheKey);

        if (cached) {
          console.log('[TTS] Cache hit');
          allAudioBase64Parts = cached.audioBase64Parts;
          allWords = cached.wordTimestamps;
        } else {
          console.log('[TTS] Cache miss — fetching from API');

          // For long texts, split into chunks and fetch each separately
          const textChunks = splitTextIntoChunks(text);
          allAudioBase64Parts = [];
          allWords = [];
          let timeOffset = 0;

          for (const textChunk of textChunks) {
            if (cancelled) return;

            const { audioBase64, alignment } = await fetchTtsWithTimestamps(
              textChunk,
              voiceId,
              apiKey,
            );

            allAudioBase64Parts.push(audioBase64);

            const chunkWords = buildWordTimestamps(textChunk, alignment, timeOffset);
            // Reindex words to be globally sequential
            const baseIndex = allWords.length;
            const reindexed = chunkWords.map((w, i) => ({
              ...w,
              index: baseIndex + i,
            }));
            allWords = [...allWords, ...reindexed];

            // Calculate time offset for next chunk: use the last character's end time
            const lastEndTime =
              alignment.character_end_times_seconds[
                alignment.character_end_times_seconds.length - 1
              ];
            if (lastEndTime !== undefined) {
              timeOffset += lastEndTime;
            }
          }

          // Fire-and-forget: store in cache
          void storeTtsCache(cacheKey, allAudioBase64Parts, allWords, text.length, voiceId);
        }

        if (cancelled) return;

        console.log('[TTS] Ready:', {
          chunks: allAudioBase64Parts.length,
          totalWords: allWords.length,
          fromCache: !!cached,
        });

        // Build audio element
        const audioUrl = base64PartsToAudioUrl(allAudioBase64Parts);
        audioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audio.volume = volumeRef.current;
        audioRef.current = audio;

        // Audio event handlers
        audio.addEventListener('ended', () => {
          console.log('[TTS] Audio ended');
          setStatus('done');
          setActiveWordIndex(allWords.length > 0 ? allWords.length - 1 : -1);
          if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        });

        audio.addEventListener('error', (e) => {
          console.error('[TTS] Audio element error:', e);
          setError('Audio playback error');
          setStatus('error');
        });

        audio.addEventListener('canplaythrough', () => {
          console.log('[TTS] Audio canplaythrough, duration:', audio.duration);
        });

        setWords(allWords);
        setStatus('ready');
        console.log('[TTS] Status → ready, autoPlay:', autoPlay);

        if (autoPlay) {
          audio.play().catch((err: unknown) => {
            console.error('[TTS] Auto-play blocked:', err);
            // Browsers may block autoplay — stay in ready state
            setStatus('ready');
          });
          setStatus('playing');
          if (animationFrameRef.current === null) {
            animationFrameRef.current = requestAnimationFrame(updateActiveWord);
          }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'TTS request failed';
        console.error('[TTS] Fetch error:', message);
        setError(message);
        setStatus('error');
      }
    }

    void loadTts();

    return () => {
      cancelled = true;
      stopAnimationLoop();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [text, voiceId, apiKey, autoPlay, stopAnimationLoop, updateActiveWord]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnimationLoop();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, [stopAnimationLoop]);

  return {
    status,
    words,
    activeWordIndex,
    play,
    pause,
    error,
    volume,
    setVolume,
  };
}
