// ============================================================
// TTS alignment and word timing types
// ============================================================

export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
  index: number;
}

export type TtsStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error';

/** Character-level alignment data, as returned by ElevenLabs TTS API or any compatible source. */
export interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

// ============================================================
// Parsed text structure types
// ============================================================

export type LineType = 'header' | 'list-item' | 'text';

export interface ParsedWord {
  word: string;
  strikethrough: boolean;
  globalIndex: number;
}

export interface ParsedLine {
  type: LineType;
  words: ParsedWord[];
}

export interface ParsedParagraph {
  lines: ParsedLine[];
}

// ============================================================
// Cache adapter types
// ============================================================

export interface TTSCacheValue {
  audioBase64Parts: string[];
  wordTimestamps: WordTimestamp[];
}

export interface CacheAdapter {
  get(key: string): Promise<TTSCacheValue | null>;
  set(key: string, value: TTSCacheValue): Promise<void>;
}
