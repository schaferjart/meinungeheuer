// Types
export type {
  WordTimestamp,
  AlignmentData,
  TtsStatus,
  LineType,
  ParsedWord,
  ParsedLine,
  ParsedParagraph,
} from './types.js';

// Utilities
export { buildWordTimestamps } from './utils/buildWordTimestamps.js';
export { splitTextIntoChunks } from './utils/splitTextIntoChunks.js';
export { computeCacheKey } from './utils/computeCacheKey.js';
export { stripMarkdownForTTS, parseContentToWords, parseMarkdownText } from './utils/markdown.js';

// Hooks
export {
  useAudioSync,
  useAutoScroll,
  useKaraokeReader,
} from './hooks/index.js';
export type {
  UseAudioSyncParams,
  UseAudioSyncReturn,
  UseAutoScrollParams,
  UseKaraokeReaderParams,
  UseKaraokeReaderReturn,
} from './hooks/index.js';
