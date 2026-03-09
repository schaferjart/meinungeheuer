import { getSupabaseClient } from './supabase';

/**
 * Persist a definition directly to Supabase from the tablet.
 * Fire-and-forget — errors are logged, never block the UI.
 */
export async function persistDefinition(definition: {
  id: string;
  term: string;
  definition_text: string;
  citations: string[] | null;
  language: string;
  session_id?: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('definitions').insert({
      id: definition.id,
      session_id: definition.session_id ?? null,
      term: definition.term,
      definition_text: definition.definition_text,
      citations: definition.citations,
      language: definition.language,
    });

    if (error) {
      // Duplicate is fine — webhook may also insert
      if (error.code === '23505') {
        console.log('[Persist] Definition already exists');
      } else {
        console.warn('[Persist] Definition insert error:', error.message);
      }
    } else {
      console.log('[Persist] Definition saved:', definition.term);
    }
  } catch (err) {
    console.warn('[Persist] Definition error:', err);
  }
}

/**
 * Enqueue a print job in Supabase print_queue.
 * Fire-and-forget — errors are logged, never block the UI.
 */
export async function persistPrintJob(
  definition: {
    term: string;
    definition_text: string;
    citations: string[] | null;
    language: string;
  },
  sessionId: string | null,
  template?: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // Count existing sessions for session_number
    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true });

    const printPayload = {
      term: definition.term,
      definition_text: definition.definition_text,
      citations: definition.citations ?? [],
      language: definition.language,
      session_number: count ?? 1,
      chain_ref: null,
      timestamp: new Date().toISOString(),
      template: template ?? 'dictionary',
    };

    const { error } = await supabase.from('print_queue').insert({
      session_id: sessionId,
      payload: printPayload as unknown as Record<string, unknown>,
      status: 'pending',
    });

    if (error) {
      console.warn('[Persist] Print job insert error:', error.message);
    } else {
      console.log('[Persist] Print job enqueued for:', definition.term);
    }
  } catch (err) {
    console.warn('[Persist] Print job error:', err);
  }
}

/**
 * Persist conversation transcript turns to Supabase.
 * Fire-and-forget.
 */
export async function persistTranscript(
  conversationId: string | undefined,
  transcript: Array<{ role: 'visitor' | 'agent'; content: string }>,
): Promise<void> {
  if (!transcript.length) return;

  try {
    const supabase = getSupabaseClient();

    // Try to find a session with this conversation ID
    let sessionId: string | null = null;
    if (conversationId) {
      const { data } = await supabase
        .from('sessions')
        .select('id')
        .eq('elevenlabs_conversation_id', conversationId)
        .maybeSingle();
      sessionId = data?.id ?? null;
    }

    const turns = transcript.map((t, i) => ({
      session_id: sessionId,
      turn_number: i + 1,
      role: t.role,
      content: t.content,
    }));

    const { error } = await supabase.from('turns').insert(turns);

    if (error) {
      console.warn('[Persist] Transcript insert error:', error.message);
    } else {
      console.log('[Persist] Transcript saved:', turns.length, 'turns');
    }
  } catch (err) {
    console.warn('[Persist] Transcript error:', err);
  }
}
