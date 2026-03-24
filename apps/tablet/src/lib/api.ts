import { z } from 'zod';
import { ModeSchema, SpeechProfileSchema } from '@meinungeheuer/shared';
import type { Mode } from '@meinungeheuer/shared';

// ============================================================
// Response schemas
// ============================================================

export const ConfigResponseSchema = z.object({
  mode: ModeSchema,
  term: z.string().nullable(),
  program: z.string().optional(),
  contextText: z.string().nullable().optional(),
  parentSessionId: z.string().uuid().nullable().optional(),
  text: z.object({
    id: z.string(),
    title: z.string(),
    content_de: z.string().nullable(),
    content_en: z.string().nullable(),
    terms: z.array(z.string()),
  }).optional(),
  chain_context: z.object({
    term: z.string(),
    definition_text: z.string(),
    chain_depth: z.number(),
    language: z.string(),
  }).nullable().optional(),
  voice_chain: z.object({
    id: z.string(),
    voice_clone_id: z.string().nullable(),
    voice_clone_status: z.string(),
    speech_profile: SpeechProfileSchema.nullable(),
    icebreaker: z.string().nullable(),
    portrait_blurred_url: z.string().nullable(),
    chain_position: z.number(),
  }).nullable().optional(),

  // New optional fields — all optional for backwards compatibility with old backends
  language: z.string().optional(),
  stages: z.object({
    textReading: z.boolean().nullable(),
    termPrompt: z.boolean().nullable(),
    portrait: z.boolean().nullable(),
    printing: z.boolean().nullable(),
  }).optional(),
  faceDetection: z.object({
    enabled: z.boolean(),
    wakeMs: z.number(),
    sleepMs: z.number(),
    intervalMs: z.number(),
    minConfidence: z.number(),
  }).optional(),
  timers: z.object({
    welcomeMs: z.number(),
    termPromptMs: z.number(),
    definitionDisplayMs: z.number(),
    farewellMs: z.number(),
    printTimeoutMs: z.number(),
  }).optional(),
  elevenlabs: z.object({
    agentId: z.string().optional(),
    voiceId: z.string().optional(),
  }).optional(),
  voice: z.object({
    stability: z.number(),
    similarityBoost: z.number(),
    style: z.number(),
    speakerBoost: z.boolean(),
  }).optional(),
  voiceChainConfig: z.object({
    removeBgNoise: z.boolean(),
    retentionWindow: z.number(),
    profileModel: z.string().nullable(),
    profileTemperature: z.number(),
    icebreakerModel: z.string().nullable(),
    icebreakerTemperature: z.number(),
    coldStartDe: z.string().nullable(),
    coldStartEn: z.string().nullable(),
    maxPhrases: z.number(),
    maxFavoriteWords: z.number(),
  }).optional(),
  portrait: z.object({
    captureDelayMs: z.number(),
    jpegQuality: z.number(),
    minBlobSize: z.number(),
    blurRadiusCss: z.number(),
  }).optional(),
  display: z.object({
    highlightColor: z.string(),
    spokenOpacity: z.number(),
    upcomingOpacity: z.number(),
    fontSize: z.string().nullable(),
    lineHeight: z.number(),
    letterSpacing: z.string().nullable(),
    maxWidth: z.string().nullable(),
  }).optional(),
  prompt: z.object({
    system_prompt: z.string(),
    first_message_de: z.string(),
    first_message_en: z.string(),
  }).optional(),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

export const SessionStartResponseSchema = z.object({
  session_id: z.string().uuid(),
});
export type SessionStartResponse = z.infer<typeof SessionStartResponseSchema>;

// ============================================================
// Helpers
// ============================================================

async function apiFetch<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json: unknown = await res.json();
  return schema.parse(json);
}

// ============================================================
// Endpoints
// ============================================================

export async function fetchConfig(backendUrl: string): Promise<ConfigResponse> {
  return apiFetch(
    `${backendUrl}/api/config`,
    { method: 'GET' },
    ConfigResponseSchema,
  );
}

export interface StartSessionParams {
  mode: Mode;
  term: string;
  context_text: string | null;
  parent_session_id: string | null;
  elevenlabs_conversation_id: string;
}

export async function startSession(
  backendUrl: string,
  params: StartSessionParams,
): Promise<SessionStartResponse> {
  return apiFetch(
    `${backendUrl}/api/session/start`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    SessionStartResponseSchema,
  );
}

// ============================================================
// Voice chain
// ============================================================

export interface SubmitVoiceChainDataParams {
  /** Recorded visitor audio blob (webm/opus or mp4). */
  audio: Blob;
  /** Installation session ID. */
  sessionId: string;
  /** Full conversation transcript. */
  transcript: Array<{ role: string; content: string }>;
  /** Public URL of the blurred portrait in Supabase Storage, or null. */
  portraitBlurredUrl: string | null;
}

/**
 * Submit voice chain data to the backend for async processing.
 *
 * The backend will:
 * - Clone the visitor's voice via ElevenLabs IVC
 * - Extract a speech profile from the transcript
 * - Generate an icebreaker for the next visitor
 * - Store everything in voice_chain_state
 *
 * Fire-and-forget — errors are logged, never thrown or blocking.
 */
export async function submitVoiceChainData(
  backendUrl: string,
  params: SubmitVoiceChainDataParams,
): Promise<void> {
  try {
    const formData = new FormData();
    formData.append('audio', params.audio, 'visitor_audio.webm');
    formData.append('session_id', params.sessionId);
    formData.append('transcript', JSON.stringify(params.transcript));
    if (params.portraitBlurredUrl !== null) {
      formData.append('portrait_blurred_url', params.portraitBlurredUrl);
    }

    const res = await fetch(`${backendUrl}/api/voice-chain/process`, {
      method: 'POST',
      body: formData,
      // No Content-Type header — browser sets it with correct multipart boundary
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[API] Voice chain submit failed:', res.status, text);
    } else {
      console.log('[API] Voice chain data submitted successfully');
    }
  } catch (err) {
    console.warn('[API] Voice chain submit error:', err);
  }
}
