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

// TTS
export {
  buildWordTimestamps,
  splitTextIntoChunks,
  type WordTimestamp,
  type AlignmentData,
} from './tts/timestamps.js';
export { type TtsStatus } from './audio/types.js';

// Conversation
export {
  type TranscriptEntry,
  type SaveDefinitionResult,
} from './conversation/types.js';
