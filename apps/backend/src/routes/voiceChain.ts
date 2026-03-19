import { Hono } from 'hono';
import { z } from 'zod';
import { getLatestVoiceChainState, processVoiceChain } from '../services/voiceChain.js';

export const voiceChainRoutes = new Hono();

// ---------------------------------------------------------------------------
// Zod schema for process endpoint query fields (non-file fields)
// ---------------------------------------------------------------------------

const ProcessBodySchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
  transcript: z.string().min(1, 'transcript is required'),
  portrait_blurred_url: z.string().optional(),
});

const TranscriptEntrySchema = z.array(
  z.object({
    role: z.string(),
    content: z.string(),
  }),
);

// ---------------------------------------------------------------------------
// POST /api/voice-chain/process
// Accepts multipart/form-data: audio (file), session_id, transcript (JSON), portrait_blurred_url
// Protected by WEBHOOK_SECRET.
// Returns 202 immediately and processes asynchronously.
// ---------------------------------------------------------------------------

voiceChainRoutes.post('/process', async (c) => {
  let body: Record<string, string | File | undefined>;
  try {
    body = (await c.req.parseBody()) as Record<string, string | File | undefined>;
  } catch (err) {
    console.error('[voice-chain/process] Failed to parse multipart body:', err);
    return c.json({ error: 'Failed to parse request body' }, 400);
  }

  // Validate non-file fields
  const fieldsParsed = ProcessBodySchema.safeParse({
    session_id: body['session_id'],
    transcript: body['transcript'],
    portrait_blurred_url: body['portrait_blurred_url'],
  });

  if (!fieldsParsed.success) {
    return c.json(
      { error: 'Invalid request fields', details: fieldsParsed.error.flatten() },
      400,
    );
  }

  const { session_id, transcript: transcriptRaw, portrait_blurred_url } = fieldsParsed.data;

  // Parse and validate the transcript JSON string
  let transcript: Array<{ role: string; content: string }>;
  try {
    const parsed: unknown = JSON.parse(transcriptRaw);
    const validated = TranscriptEntrySchema.safeParse(parsed);
    if (!validated.success) {
      return c.json(
        { error: 'Invalid transcript format', details: validated.error.flatten() },
        400,
      );
    }
    transcript = validated.data;
  } catch {
    return c.json({ error: 'transcript field must be valid JSON' }, 400);
  }

  // Extract audio file
  const audioFile = body['audio'];
  if (!audioFile || typeof audioFile === 'string') {
    return c.json({ error: 'audio field is required and must be a file' }, 400);
  }

  // Convert File to Buffer
  let audioBuffer: Buffer;
  try {
    const arrayBuffer = await audioFile.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('[voice-chain/process] Failed to read audio file:', { session_id, error: err });
    return c.json({ error: 'Failed to read audio file' }, 400);
  }

  // Fire-and-forget — do not await
  void processVoiceChain({
    audioBuffer,
    transcript,
    sessionId: session_id,
    portraitBlurredUrl: portrait_blurred_url ?? null,
  });

  return c.json({ success: true, message: 'Voice chain processing started' }, 202);
});

// ---------------------------------------------------------------------------
// GET /api/voice-chain/latest
// Returns the latest active voice chain state.
// No auth required — tablet reads this on startup.
// ---------------------------------------------------------------------------

voiceChainRoutes.get('/latest', async (c) => {
  const voiceChain = await getLatestVoiceChainState();
  return c.json({ voiceChain }, 200);
});

// ---------------------------------------------------------------------------
// POST /api/voice-chain/apply-voice
// PATCHes the ElevenLabs agent to use the given voice clone ID.
// Must be called before starting a conversation with a cloned voice,
// because the Conversational AI WebSocket does NOT support tts.voiceId
// overrides for instant voice clones.
// ---------------------------------------------------------------------------

voiceChainRoutes.post('/apply-voice', async (c) => {
  const body = await c.req.json<{ voice_id: string; agent_id: string }>().catch(() => null);
  if (!body?.voice_id || !body?.agent_id) {
    return c.json({ error: 'voice_id and agent_id are required' }, 400);
  }

  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) {
    return c.json({ error: 'ELEVENLABS_API_KEY not set' }, 500);
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${body.agent_id}`,
      {
        method: 'PATCH',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_config: {
            tts: {
              voice_id: body.voice_id,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[voice-chain/apply-voice] ElevenLabs PATCH error:', {
        status: response.status,
        body: text,
      });
      return c.json({ error: 'Failed to update agent voice', details: text }, 502);
    }

    console.log('[voice-chain/apply-voice] Agent voice updated to:', body.voice_id);
    return c.json({ success: true, voice_id: body.voice_id });
  } catch (err) {
    console.error('[voice-chain/apply-voice] Unexpected error:', err);
    return c.json({ error: 'Internal error' }, 500);
  }
});
