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
 * Advance the chain state after a definition is saved.
 * Called in chain mode to make the new definition the active chain link.
 * Fire-and-forget — errors are logged, never block the UI.
 */
export async function advanceChain(
  backendUrl: string,
  definitionId: string,
): Promise<void> {
  try {
    const res = await fetch(`${backendUrl}/api/chain/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definition_id: definitionId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Persist] Chain advance failed:', res.status, text);
    } else {
      console.log('[Persist] Chain advanced for definition:', definitionId);
    }
  } catch (err) {
    console.warn('[Persist] Chain advance error:', err);
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
  definitionId?: string,
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
      definition_id: definitionId,
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
 * Upload a blurred portrait JPEG to Supabase Storage.
 * Fire-and-forget — returns the public URL on success, null on any error.
 *
 * Storage bucket: 'portraits-blurred' (must exist with public read access).
 */
export async function uploadBlurredPortrait(blob: Blob): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const path = `portraits-blurred/${crypto.randomUUID()}.jpg`;

    const { error } = await supabase.storage
      .from('portraits-blurred')
      .upload(path, blob, { contentType: 'image/jpeg' });

    if (error) {
      console.warn('[Persist] Blurred portrait upload error:', error.message);
      return null;
    }

    const { data } = supabase.storage.from('portraits-blurred').getPublicUrl(path);
    console.log('[Persist] Blurred portrait uploaded:', data.publicUrl);
    return data.publicUrl;
  } catch (err) {
    console.warn('[Persist] Blurred portrait upload error:', err);
    return null;
  }
}

/**
 * Persist conversation transcript turns to Supabase.
 * Fire-and-forget.
 */
export async function persistTranscript(
  sessionId: string | null,
  transcript: Array<{ role: 'visitor' | 'agent'; content: string }>,
): Promise<void> {
  if (!transcript.length) return;

  try {
    const supabase = getSupabaseClient();

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
