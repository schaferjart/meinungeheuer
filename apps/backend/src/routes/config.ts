import { Hono } from 'hono';
import { z } from 'zod';
import { ModeSchema } from '@meinungeheuer/shared';
import { supabase } from '../services/supabase.js';
import { getActiveChainContext, getChainHistory } from '../services/chain.js';

export const configRoutes = new Hono();

// ---------------------------------------------------------------------------
// Admin middleware — protects mutation endpoints with WEBHOOK_SECRET
// ---------------------------------------------------------------------------

const adminMiddleware = async (
  c: Parameters<Parameters<typeof configRoutes.use>[1]>[0],
  next: Parameters<Parameters<typeof configRoutes.use>[1]>[1],
) => {
  const secret = process.env['WEBHOOK_SECRET'];

  if (!secret) {
    // No secret configured — allow in dev mode
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  const querySecret = c.req.query('secret');

  if (bearerSecret !== secret && querySecret !== secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UpdateConfigSchema = z.object({
  mode: ModeSchema.optional(),
  term: z.string().min(1).optional(),
  active_text_id: z.string().nullable().optional(),
});

const DefinitionsQuerySchema = z.object({
  term: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// GET /api/config
// Called by the tablet on startup; returns current installation config
// ---------------------------------------------------------------------------

configRoutes.get('/', async (c) => {
  // Fetch the single installation_config row (there should be exactly one)
  const { data: config, error: configError } = await supabase
    .from('installation_config')
    .select('id, mode, active_term, active_text_id, program, updated_at')
    .limit(1)
    .maybeSingle();

  if (configError) {
    console.error('[config/GET] Config fetch error:', configError);
    return c.json({ error: 'Database error fetching config' }, 500);
  }

  if (!config) {
    return c.json({ error: 'Installation config not found' }, 404);
  }

  const response: Record<string, unknown> = {
    mode: config.mode,
    term: config.active_term,
    program: config.program ?? null,
  };

  // For text_term mode: fetch the active text content
  if (config.mode === 'text_term' && config.active_text_id) {
    const { data: text, error: textError } = await supabase
      .from('texts')
      .select('*')
      .eq('id', config.active_text_id)
      .maybeSingle();

    if (textError) {
      console.error('[config/GET] Text fetch error:', { active_text_id: config.active_text_id, error: textError });
    } else if (text) {
      response['text'] = text;

      // If no active_term is set, or active_term doesn't belong to this text,
      // pick a random term from the text's terms array
      const terms = (text as { terms?: string[] }).terms ?? [];
      if (terms.length > 0 && (!config.active_term || !terms.includes(config.active_term))) {
        const randomTerm = terms[Math.floor(Math.random() * terms.length)];
        response['term'] = randomTerm;
      }
    }
  }

  // For chain mode: fetch the latest active chain definition
  if (config.mode === 'chain') {
    const chainContext = await getActiveChainContext();
    if (chainContext) {
      response['chain_context'] = {
        term: chainContext.definition.term,
        definition_text: chainContext.definition.definition_text,
        chain_depth: chainContext.definition.chain_depth,
        language: chainContext.definition.language,
      };
    } else {
      response['chain_context'] = null;
    }
  }

  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// POST /api/config/update
// Admin endpoint to update installation config
// ---------------------------------------------------------------------------

configRoutes.post('/update', adminMiddleware, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = UpdateConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  // Build the update object using the database column names
  const dbUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.mode !== undefined) dbUpdate['mode'] = updates.mode;
  if (updates.term !== undefined) dbUpdate['active_term'] = updates.term;
  if (updates.active_text_id !== undefined) dbUpdate['active_text_id'] = updates.active_text_id;

  // Upsert: update the first row (or insert one if none exists)
  const { data: existing } = await supabase
    .from('installation_config')
    .select('id')
    .limit(1)
    .maybeSingle();

  let updateError: { message: string } | null = null;

  if (existing) {
    const { error } = await supabase
      .from('installation_config')
      .update(dbUpdate)
      .eq('id', existing.id);
    updateError = error;
  } else {
    // No config row exists — create one with defaults + overrides
    const { error } = await supabase.from('installation_config').insert({
      mode: (dbUpdate['mode'] as 'text_term' | 'term_only' | 'chain') ?? 'term_only',
      active_term: (dbUpdate['active_term'] as string | null) ?? null,
      active_text_id: (dbUpdate['active_text_id'] as string | null) ?? null,
    });
    updateError = error;
  }

  if (updateError) {
    console.error('[config/update] Update error:', updateError);
    return c.json({ error: 'Database error updating config' }, 500);
  }

  return c.json({ success: true }, 200);
});

// ---------------------------------------------------------------------------
// GET /api/definitions
// Returns definitions with optional filters for the admin dashboard
// ---------------------------------------------------------------------------

configRoutes.get('/definitions', async (c) => {
  const queryRaw = {
    term: c.req.query('term'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  };

  const parsed = DefinitionsQuerySchema.safeParse(queryRaw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, 400);
  }

  const { term, limit, offset } = parsed.data;

  let query = supabase
    .from('definitions')
    .select('id, session_id, term, definition_text, citations, language, chain_depth, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (term) {
    query = query.ilike('term', `%${term}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[config/definitions] Query error:', { term, error });
    return c.json({ error: 'Database error fetching definitions' }, 500);
  }

  return c.json({ definitions: data ?? [], total: count ?? 0, limit, offset }, 200);
});

// ---------------------------------------------------------------------------
// GET /api/chain
// Returns the full chain history for Mode C visualization
// ---------------------------------------------------------------------------

configRoutes.get('/chain', async (c) => {
  const history = await getChainHistory();
  return c.json({ chain: history }, 200);
});
