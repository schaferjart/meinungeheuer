import type { AlignmentData, WordTimestamp } from '../tts/timestamps.js';

// ============================================================
// TTS playback adapter interfaces
// ============================================================

export type TtsStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error';

export interface TtsFetchResult {
  audioBase64Chunks: string[];
  alignment: AlignmentData;
}

export interface TtsPlaybackAdapter {
  load(text: string, voiceId: string, apiKey: string): Promise<void>;
  play(): void;
  pause(): void;
  dispose(): void;
  readonly status: TtsStatus;
  readonly activeWordIndex: number;
  readonly words: WordTimestamp[];
}
