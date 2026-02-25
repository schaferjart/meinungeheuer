import { Hono } from 'hono';
import { z } from 'zod';
import { ModeSchema } from '@meinungeheuer/shared';
import { supabase } from '../services/supabase.js';

export const sessionRoutes = new Hono();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const StartSessionSchema = z.object({
  mode: ModeSchema,
  term: z.string().min(1),
  context_text: z.string().nullable().optional(),
  parent_session_id: z.string().uuid().nullable().optional(),
  elevenlabs_conversation_id: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST /api/session/start
// Called by the tablet when a conversation begins
// ---------------------------------------------------------------------------

sessionRoutes.post('/start', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = StartSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { mode, term, context_text, parent_session_id, elevenlabs_conversation_id } = parsed.data;

  const { data: session, error: insertError } = await supabase
    .from('sessions')
    .insert({
      mode,
      term,
      context_text: context_text ?? null,
      parent_session_id: parent_session_id ?? null,
      elevenlabs_conversation_id,
    })
    .select('id')
    .single();

  if (insertError || !session) {
    console.error('[session/start] Insert error:', { error: insertError });
    return c.json({ error: 'Database error creating session' }, 500);
  }

  return c.json({ session_id: session.id }, 201);
});
