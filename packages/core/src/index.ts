// Machine
export {
  installationReducer,
  INITIAL_STATE,
  type InstallationState,
  type InstallationAction,
} from './machine/installationReducer.js';

// Prompts
export { buildSystemPrompt, buildModeBlock } from './prompts/systemPrompt.js';
export { buildFirstMessage, extractPreview } from './prompts/firstMessage.js';

// API client
export {
  apiFetch,
  fetchConfig,
  startSession,
  ConfigResponseSchema,
  SessionStartResponseSchema,
  type ConfigResponse,
  type SessionStartResponse,
  type StartSessionParams,
} from './api/client.js';

// TTS timestamps
export {
  buildWordTimestamps,
  splitTextIntoChunks,
  type WordTimestamp,
  type AlignmentData,
} from './tts/timestamps.js';

// Conversation adapter types
export {
  type TranscriptEntry,
  type SaveDefinitionResult,
  type ConversationStatus,
  type ConversationSessionParams,
  type ConversationAdapter,
} from './conversation/types.js';

// Audio adapter types
export {
  type TtsStatus,
  type TtsFetchResult,
  type TtsPlaybackAdapter,
} from './audio/types.js';
