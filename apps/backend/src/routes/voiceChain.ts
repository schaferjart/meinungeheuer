import { Hono } from 'hono';
import { z } from 'zod';
import { getLatestVoiceChainState, processVoiceChain } from '../services/voiceChain.js';

export const voiceChainRoutes = new Hono();

// ---------------------------------------------------------------------------
// Shared secret middleware (same pattern as webhook routes)
// ---------------------------------------------------------------------------

const secretMiddleware = async (
  c: Parameters<Parameters<typeof voiceChainRoutes.use>[1]>[0],
  next: Parameters<Parameters<typeof voiceChainRoutes.use>[1]>[1],
) => {
  const secret = process.env['WEBHOOK_SECRET'];

  // No secret configured — skip in dev mode
  if (!secret) {
    await next();
    return;
  }

  const querySecret = c.req.query('secret');
  const authHeader = c.req.header('Authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  if (querySecret !== secret && bearerSecret !== secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
};

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

voiceChainRoutes.post('/process', secretMiddleware, async (c) => {
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
