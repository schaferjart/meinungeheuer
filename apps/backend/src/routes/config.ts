import { Hono } from 'hono';
import { z } from 'zod';
import { ModeSchema, type Database } from '@denkfink/installation-core';
import { supabase } from '../services/supabase.js';
import { getActiveChainContext, getChainHistory, advanceChain } from '../services/chain.js';

type InstallationConfigRow = Database['public']['Tables']['installation_config']['Row'];

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
  const { data: configRaw, error: configError } = await supabase
    .from('installation_config')
    .select('*')
    .limit(1)
    .maybeSingle();
  // Cast to the full Row type — select('*') loses column-level type inference
  // in PostgREST's TypeScript generics but fetches all columns at runtime.
  const config = configRaw as InstallationConfigRow | null;

  if (configError) {
    console.error('[config/GET] Config fetch error:', configError);
    return c.json({ error: 'Database error fetching config' }, 500);
  }

  if (!config) {
    return c.json({ error: 'Installation config not found' }, 404);
  }

  // Fetch the active prompt template (non-fatal if missing)
  const { data: promptData } = await supabase
    .from('prompts')
    .select('system_prompt, first_message_de, first_message_en')
    .eq('program_id', config.program || 'aphorism')
    .maybeSingle();

  const response: Record<string, unknown> = {
    mode: config.mode,
    term: config.active_term,
    program: config.program ?? null,

    // Language
    language: config.language || 'de',

    // Stage overrides (null = use program defaults)
    stages: {
      textReading: config.stage_text_reading,
      termPrompt: config.stage_term_prompt,
      portrait: config.stage_portrait,
      printing: config.stage_printing,
    },

    // Face detection
    faceDetection: {
      enabled: config.face_detection_enabled ?? true,
      wakeMs: config.face_wake_ms ?? 3000,
      sleepMs: config.face_sleep_ms ?? 30000,
      intervalMs: config.face_detection_interval_ms ?? 500,
      minConfidence: config.face_min_confidence ?? 0.5,
    },

    // Timers
    timers: {
      welcomeMs: config.welcome_duration_ms ?? 3000,
      termPromptMs: config.term_prompt_duration_ms ?? 2000,
      definitionDisplayMs: config.definition_display_ms ?? 10000,
      farewellMs: config.farewell_duration_ms ?? 15000,
      printTimeoutMs: config.print_timeout_ms ?? 30000,
    },

    // ElevenLabs (non-secret)
    elevenlabs: {
      agentId: config.elevenlabs_agent_id || undefined,
      voiceId: config.elevenlabs_voice_id || undefined,
    },

    // Voice settings
    voice: {
      stability: config.voice_stability ?? 0.35,
      similarityBoost: config.voice_similarity_boost ?? 0.65,
      style: config.voice_style ?? 0.6,
      speakerBoost: config.voice_speaker_boost ?? true,
    },

    // Voice chain config
    voiceChainConfig: {
      removeBgNoise: config.vc_remove_bg_noise ?? true,
      retentionWindow: config.vc_retention_window ?? 10,
      profileModel: config.vc_profile_model,
      profileTemperature: config.vc_profile_temperature ?? 0.3,
      icebreakerModel: config.vc_icebreaker_model,
      icebreakerTemperature: config.vc_icebreaker_temperature ?? 0.9,
      coldStartDe: config.vc_cold_start_de,
      coldStartEn: config.vc_cold_start_en,
      maxPhrases: config.vc_max_phrases ?? 5,
      maxFavoriteWords: config.vc_max_favorite_words ?? 5,
    },

    // Portrait capture settings
    portrait: {
      captureDelayMs: config.portrait_capture_delay_ms ?? 5000,
      jpegQuality: config.portrait_jpeg_quality ?? 0.85,
      minBlobSize: config.portrait_min_blob_size ?? 1024,
      blurRadiusCss: config.portrait_blur_radius_css ?? 25,
    },

    // Display styling
    display: {
      highlightColor: config.display_highlight_color ?? '#fcd34d',
      spokenOpacity: config.display_spoken_opacity ?? 0.4,
      upcomingOpacity: config.display_upcoming_opacity ?? 0.9,
      fontSize: config.display_font_size,
      lineHeight: config.display_line_height ?? 1.8,
      letterSpacing: config.display_letter_spacing,
      maxWidth: config.display_max_width,
    },

    // Prompt template (if exists in DB)
    prompt: promptData ?? undefined,
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

  // For the voice_chain program: include the latest active voice chain state
  if (config.program === 'voice_chain') {
    try {
      const { getLatestVoiceChainState } = await import('../services/voiceChain.js');
      const voiceChainState = await getLatestVoiceChainState();
      response['voice_chain'] = voiceChainState;
    } catch (err) {
      console.error('[config/GET] Failed to fetch voice chain state:', err);
      response['voice_chain'] = null;
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

// ---------------------------------------------------------------------------
// POST /api/chain/advance
// Called by the tablet after save_definition to advance the chain state.
// This is the primary chain advancement path — the webhook is a backup.
// ---------------------------------------------------------------------------

const ChainAdvanceSchema = z.object({
  definition_id: z.string().uuid(),
});

configRoutes.post('/chain/advance', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = ChainAdvanceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { definition_id } = parsed.data;

  try {
    // Set chain_depth on the definition
    const { count } = await supabase
      .from('definitions')
      .select('*', { count: 'exact', head: true })
      .not('chain_depth', 'is', null);
    const chainDepth = (count ?? 0) + 1;

    const { error: updateError } = await supabase
      .from('definitions')
      .update({ chain_depth: chainDepth })
      .eq('id', definition_id);

    if (updateError) {
      console.error('[chain/advance] Definition update error:', updateError);
    }

    // Advance the chain state
    await advanceChain(definition_id);

    console.log(`[chain/advance] Chain advanced to depth ${chainDepth}, definition ${definition_id}`);
    return c.json({ success: true, chain_depth: chainDepth }, 200);
  } catch (err) {
    console.error('[chain/advance] Error:', err);
    return c.json({ error: 'Failed to advance chain' }, 500);
  }
});
