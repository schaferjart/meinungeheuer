import { useCallback, useEffect, useRef, useState } from 'react';

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
}

// ============================================================
// ElevenLabs NDJSON response chunk shape
// ============================================================

interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface TtsChunk {
  audio_base64: string;
  alignment: AlignmentData | null;
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
): Promise<{ audioBase64Chunks: string[]; alignment: AlignmentData }> {
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
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs TTS API error ${response.status}: ${errorText}`);
  }

  const body = await response.text();

  // Parse NDJSON: each line is a JSON object
  const lines = body.split('\n').filter((line) => line.trim().length > 0);

  const audioBase64Chunks: string[] = [];
  let mergedAlignment: AlignmentData = {
    characters: [],
    character_start_times_seconds: [],
    character_end_times_seconds: [],
  };

  for (const line of lines) {
    const chunk = JSON.parse(line) as TtsChunk;

    if (chunk.audio_base64 && chunk.audio_base64.length > 0) {
      audioBase64Chunks.push(chunk.audio_base64);
    }

    if (chunk.alignment) {
      mergedAlignment = {
        characters: [...mergedAlignment.characters, ...chunk.alignment.characters],
        character_start_times_seconds: [
          ...mergedAlignment.character_start_times_seconds,
          ...chunk.alignment.character_start_times_seconds,
        ],
        character_end_times_seconds: [
          ...mergedAlignment.character_end_times_seconds,
          ...chunk.alignment.character_end_times_seconds,
        ],
      };
    }
  }

  return { audioBase64Chunks, alignment: mergedAlignment };
}

/**
 * Decode multiple base64 audio chunks into a single Blob URL.
 */
function base64ChunksToAudioUrl(chunks: string[]): string {
  const binaryParts: BlobPart[] = [];

  for (const chunk of chunks) {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    binaryParts.push(bytes as unknown as BlobPart);
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
    const currentWords = wordsRef.current;

    if (!audio || currentWords.length === 0) {
      animationFrameRef.current = requestAnimationFrame(updateActiveWord);
      return;
    }

    const currentTime = audio.currentTime;

    // Binary-ish search: words are sorted by startTime, so we can find the
    // active word efficiently. For simplicity with typical text lengths
    // (< 500 words), a linear scan is fine and more readable.
    let foundIndex = -1;
    for (let i = 0; i < currentWords.length; i++) {
      const w = currentWords[i];
      if (w && currentTime >= w.startTime && currentTime < w.endTime) {
        foundIndex = i;
        break;
      }
      // If we're past this word's end but before the next word's start,
      // keep the last word highlighted
      if (w && currentTime >= w.endTime) {
        const nextWord = currentWords[i + 1];
        if (!nextWord || currentTime < nextWord.startTime) {
          foundIndex = i;
        }
      }
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
    if (!text || !voiceId || !apiKey) return;

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
        const chunks = splitTextIntoChunks(text);
        const allAudioChunks: string[] = [];
        let allWords: WordTimestamp[] = [];
        let timeOffset = 0;

        for (const chunk of chunks) {
          if (cancelled) return;

          const { audioBase64Chunks, alignment } = await fetchTtsWithTimestamps(
            chunk,
            voiceId,
            apiKey,
          );

          allAudioChunks.push(...audioBase64Chunks);

          const chunkWords = buildWordTimestamps(chunk, alignment, timeOffset);
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

        if (cancelled) return;

        // Build audio element
        const audioUrl = base64ChunksToAudioUrl(allAudioChunks);
        audioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Audio event handlers
        audio.addEventListener('ended', () => {
          setStatus('done');
          setActiveWordIndex(allWords.length > 0 ? allWords.length - 1 : -1);
          if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        });

        audio.addEventListener('error', () => {
          setError('Audio playback error');
          setStatus('error');
        });

        setWords(allWords);
        setStatus('ready');

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
  };
}
