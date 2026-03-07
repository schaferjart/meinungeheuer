import type { CacheAdapter, WordTimestamp } from '../../types.js';

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
