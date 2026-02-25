import { Hono } from 'hono';
import { z } from 'zod';
import { supabase } from '../services/supabase.js';
import { advanceChain } from '../services/chain.js';
import { generateEmbedding } from '../services/embeddings.js';

export const webhookRoutes = new Hono();

// ---------------------------------------------------------------------------
// Shared secret verification middleware
// ---------------------------------------------------------------------------

webhookRoutes.use('*', async (c, next) => {
  const secret = process.env['WEBHOOK_SECRET'];

  // If no secret is configured, skip verification (dev mode)
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
});

// ---------------------------------------------------------------------------
// Zod schemas for request bodies
// ---------------------------------------------------------------------------

const SaveDefinitionWebhookSchema = z.object({
  tool_call_id: z.string(),
  tool_name: z.string(),
  parameters: z.object({
    term: z.string().min(1),
    definition_text: z.string().min(1),
    citations: z.array(z.string()).optional().default([]),
    language: z.string().min(1),
  }),
  conversation_id: z.string(),
});

const ConversationDataWebhookSchema = z.object({
  conversation_id: z.string(),
  transcript: z.array(
    z.object({
      role: z.string(),
      message: z.string(),
    }),
  ),
  metadata: z
    .object({
      duration_seconds: z.number().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /webhook/definition
// Called by ElevenLabs when agent invokes the save_definition tool
// ---------------------------------------------------------------------------

webhookRoutes.post('/definition', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = SaveDefinitionWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { parameters, conversation_id } = parsed.data;
  const { term, definition_text, citations, language } = parameters;

  // -------------------------------------------------------------------------
  // 1. Find or create session by elevenlabs_conversation_id
  // -------------------------------------------------------------------------

  let session: { id: string; mode: string } | null = null;

  const { data: existingSession, error: sessionFetchError } = await supabase
    .from('sessions')
    .select('id, mode')
    .eq('elevenlabs_conversation_id', conversation_id)
    .maybeSingle();

  if (sessionFetchError) {
    console.error('[webhook/definition] Session fetch error:', {
      conversation_id,
      error: sessionFetchError,
    });
    return c.json({ error: 'Database error fetching session' }, 500);
  }

  if (existingSession) {
    session = existingSession;
  } else {
    // Create a minimal session so the definition can be linked
    const { data: newSession, error: sessionCreateError } = await supabase
      .from('sessions')
      .insert({
        elevenlabs_conversation_id: conversation_id,
        mode: 'term_only',
        term,
      })
      .select('id, mode')
      .single();

    if (sessionCreateError || !newSession) {
      console.error('[webhook/definition] Session create error:', {
        conversation_id,
        error: sessionCreateError,
      });
      return c.json({ error: 'Database error creating session' }, 500);
    }

    session = newSession;
  }

  const sessionId = session.id;
  const sessionMode = session.mode;

  // -------------------------------------------------------------------------
  // 2. Determine chain depth if in chain mode
  // -------------------------------------------------------------------------

  let chainDepth: number | null = null;
  if (sessionMode === 'chain') {
    const { count } = await supabase
      .from('definitions')
      .select('*', { count: 'exact', head: true })
      .not('chain_depth', 'is', null);
    chainDepth = (count ?? 0) + 1;
  }

  // -------------------------------------------------------------------------
  // 3. Insert the definition
  // -------------------------------------------------------------------------

  const { data: definition, error: defInsertError } = await supabase
    .from('definitions')
    .insert({
      session_id: sessionId,
      term,
      definition_text,
      citations,
      language,
      chain_depth: chainDepth,
    })
    .select('id')
    .single();

  if (defInsertError || !definition) {
    console.error('[webhook/definition] Definition insert error:', {
      session_id: sessionId,
      conversation_id,
      error: defInsertError,
    });
    return c.json({ error: 'Database error saving definition' }, 500);
  }

  const definitionId = definition.id;

  // -------------------------------------------------------------------------
  // 4. Count sessions for session_number on the print card
  // -------------------------------------------------------------------------

  const { count: sessionCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true });

  const sessionNumber = sessionCount ?? 1;

  // -------------------------------------------------------------------------
  // 5. Build PrintPayload and insert into print_queue
  // -------------------------------------------------------------------------

  const printPayload = {
    term,
    definition_text,
    citations,
    language,
    session_number: sessionNumber,
    chain_ref: null as string | null,
    timestamp: new Date().toISOString(),
  };

  // For Mode C, attach the parent definition text as the chain reference
  if (sessionMode === 'chain' && chainDepth !== null && chainDepth > 1) {
    const { data: parentChain } = await supabase
      .from('chain_state')
      .select('definitions(definition_text)')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (parentChain) {
      const rawDef = (parentChain as Record<string, unknown>)['definitions'];
      if (rawDef && typeof rawDef === 'object' && 'definition_text' in rawDef) {
        printPayload.chain_ref = (rawDef as { definition_text: string }).definition_text;
      }
    }
  }

  const { error: printInsertError } = await supabase.from('print_queue').insert({
    session_id: sessionId,
    payload: printPayload as unknown as Record<string, unknown>,
    status: 'pending',
  });

  if (printInsertError) {
    // Log but don't fail — the definition is already saved
    console.error('[webhook/definition] Print queue insert error:', {
      session_id: sessionId,
      conversation_id,
      error: printInsertError,
    });
  }

  // -------------------------------------------------------------------------
  // 6. If mode is 'chain': advance the chain state
  // -------------------------------------------------------------------------

  if (sessionMode === 'chain') {
    try {
      await advanceChain(definitionId);
    } catch (chainErr) {
      console.error('[webhook/definition] Chain advance error:', {
        session_id: sessionId,
        definition_id: definitionId,
        error: chainErr,
      });
      // Non-fatal: definition is saved, continue
    }
  }

  // -------------------------------------------------------------------------
  // 7. Fire-and-forget embedding generation
  // -------------------------------------------------------------------------

  void generateEmbedding(definitionId);

  return c.json({ success: true, session_id: sessionId, definition_id: definitionId }, 200);
});

// ---------------------------------------------------------------------------
// POST /webhook/conversation-data
// Called by ElevenLabs post-conversation webhook with the full transcript
// ---------------------------------------------------------------------------

webhookRoutes.post('/conversation-data', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = ConversationDataWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { conversation_id, transcript, metadata } = parsed.data;

  // -------------------------------------------------------------------------
  // 1. Find session by elevenlabs_conversation_id
  // -------------------------------------------------------------------------

  const { data: session, error: sessionFetchError } = await supabase
    .from('sessions')
    .select('id')
    .eq('elevenlabs_conversation_id', conversation_id)
    .maybeSingle();

  if (sessionFetchError) {
    console.error('[webhook/conversation-data] Session fetch error:', {
      conversation_id,
      error: sessionFetchError,
    });
    return c.json({ error: 'Database error fetching session' }, 500);
  }

  if (!session) {
    console.warn('[webhook/conversation-data] No session found for conversation_id:', conversation_id);
    return c.json({ error: 'Session not found for this conversation_id' }, 404);
  }

  const sessionId = session.id;

  // -------------------------------------------------------------------------
  // 2. Insert all transcript turns
  // -------------------------------------------------------------------------

  if (transcript.length > 0) {
    const turnsToInsert = transcript.map((turn, index) => ({
      session_id: sessionId,
      turn_number: index + 1,
      role: (turn.role === 'agent' ? 'agent' : 'visitor') as 'agent' | 'visitor',
      content: turn.message,
      language: null as string | null,
    }));

    const { error: turnsInsertError } = await supabase.from('turns').insert(turnsToInsert);

    if (turnsInsertError) {
      console.error('[webhook/conversation-data] Turns insert error:', {
        session_id: sessionId,
        conversation_id,
        error: turnsInsertError,
      });
      // Log but continue — try to update session metadata
    }
  }

  // -------------------------------------------------------------------------
  // 3. Update session with duration and turn count
  // -------------------------------------------------------------------------

  const updatePayload: Record<string, unknown> = {
    turn_count: transcript.length,
    ended_at: new Date().toISOString(),
  };

  if (metadata?.duration_seconds !== undefined) {
    updatePayload['duration_seconds'] = metadata.duration_seconds;
  }

  const { error: sessionUpdateError } = await supabase
    .from('sessions')
    .update(updatePayload)
    .eq('id', sessionId);

  if (sessionUpdateError) {
    console.error('[webhook/conversation-data] Session update error:', {
      session_id: sessionId,
      conversation_id,
      error: sessionUpdateError,
    });
    return c.json({ error: 'Database error updating session' }, 500);
  }

  return c.json({ success: true, session_id: sessionId }, 200);
});
