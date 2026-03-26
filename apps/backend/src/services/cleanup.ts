import { supabase } from './supabase.js';
import { deleteVoiceClone, getElevenLabsApiKey } from './voiceChain.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CleanupResult {
  deleted: number;
  failed: number;
  errors: string[];
}

export interface CleanupSummary {
  cutoff: string;
  conversations: CleanupResult;
  voiceClones: CleanupResult;
  portraits: CleanupResult;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// deleteStaleConversationAudio
// ---------------------------------------------------------------------------

async function deleteElevenLabsConversation(conversationId: string): Promise<boolean> {
  try {
    const apiKey = getElevenLabsApiKey();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      {
        method: 'DELETE',
        headers: { 'xi-api-key': apiKey },
      },
    );

    if (response.ok || response.status === 404) {
      return true;
    }

    const text = await response.text().catch(() => '');
    console.error('[cleanup] ElevenLabs conversation delete failed:', {
      conversationId,
      status: response.status,
      body: text,
    });
    return false;
  } catch (err) {
    console.error('[cleanup] ElevenLabs conversation delete error:', { conversationId, error: err });
    return false;
  }
}

async function deleteStaleConversationAudio(cutoff: Date): Promise<CleanupResult> {
  const result: CleanupResult = { deleted: 0, failed: 0, errors: [] };

  const { data: rows, error } = await supabase
    .from('sessions')
    .select('id, elevenlabs_conversation_id')
    .lt('created_at', cutoff.toISOString())
    .not('elevenlabs_conversation_id', 'is', null);

  if (error) {
    result.errors.push(`Query failed: ${error.message}`);
    return result;
  }

  if (!rows || rows.length === 0) return result;

  for (const row of rows) {
    if (!row.elevenlabs_conversation_id) continue;
    const ok = await deleteElevenLabsConversation(row.elevenlabs_conversation_id);
    if (ok) {
      await supabase
        .from('sessions')
        .update({ elevenlabs_conversation_id: null })
        .eq('id', row.id);
      result.deleted++;
    } else {
      result.failed++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// deleteStaleVoiceClones
// ---------------------------------------------------------------------------

async function deleteStaleVoiceClones(cutoff: Date): Promise<CleanupResult> {
  const result: CleanupResult = { deleted: 0, failed: 0, errors: [] };

  const { data: rows, error } = await supabase
    .from('voice_chain_state')
    .select('id, voice_clone_id')
    .lt('created_at', cutoff.toISOString())
    .eq('voice_clone_status', 'ready')
    .eq('is_active', false);

  if (error) {
    result.errors.push(`Query failed: ${error.message}`);
    return result;
  }

  if (!rows || rows.length === 0) return result;

  for (const row of rows) {
    if (!row.voice_clone_id) {
      result.deleted++;
      continue;
    }

    await deleteVoiceClone(row.voice_clone_id);

    // deleteVoiceClone is fire-and-forget (never throws, treats 404 as ok).
    // Always mark as deleted in DB.
    await supabase
      .from('voice_chain_state')
      .update({ voice_clone_status: 'deleted' })
      .eq('id', row.id);
    result.deleted++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// deleteStaleBlurredPortraits
// ---------------------------------------------------------------------------

function extractStoragePath(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/portraits-blurred/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

async function deleteStaleBlurredPortraits(cutoff: Date): Promise<CleanupResult> {
  const result: CleanupResult = { deleted: 0, failed: 0, errors: [] };

  const { data: rows, error } = await supabase
    .from('voice_chain_state')
    .select('id, portrait_blurred_url')
    .lt('created_at', cutoff.toISOString())
    .not('portrait_blurred_url', 'is', null)
    .eq('is_active', false);

  if (error) {
    result.errors.push(`Query failed: ${error.message}`);
    return result;
  }

  if (!rows || rows.length === 0) return result;

  for (const row of rows) {
    if (!row.portrait_blurred_url) continue;
    const path = extractStoragePath(row.portrait_blurred_url);
    if (!path) {
      result.errors.push(`Bad URL format: ${row.portrait_blurred_url}`);
      result.failed++;
      continue;
    }

    const { error: removeError } = await supabase.storage
      .from('portraits-blurred')
      .remove([path]);

    if (removeError) {
      result.errors.push(`Storage remove failed for ${path}: ${removeError.message}`);
      result.failed++;
      continue;
    }

    await supabase
      .from('voice_chain_state')
      .update({ portrait_blurred_url: null })
      .eq('id', row.id);
    result.deleted++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// runCleanup — orchestrator
// ---------------------------------------------------------------------------

export async function runCleanup(): Promise<CleanupSummary> {
  const start = Date.now();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  console.log('[cleanup] Starting visitor data cleanup, cutoff:', cutoff.toISOString());

  const [conversations, voiceClones, portraits] = await Promise.allSettled([
    deleteStaleConversationAudio(cutoff),
    deleteStaleVoiceClones(cutoff),
    deleteStaleBlurredPortraits(cutoff),
  ]);

  const summary: CleanupSummary = {
    cutoff: cutoff.toISOString(),
    conversations: conversations.status === 'fulfilled'
      ? conversations.value
      : { deleted: 0, failed: 0, errors: [String(conversations.reason)] },
    voiceClones: voiceClones.status === 'fulfilled'
      ? voiceClones.value
      : { deleted: 0, failed: 0, errors: [String(voiceClones.reason)] },
    portraits: portraits.status === 'fulfilled'
      ? portraits.value
      : { deleted: 0, failed: 0, errors: [String(portraits.reason)] },
    durationMs: Date.now() - start,
  };

  console.log('[cleanup] Finished:', JSON.stringify(summary));
  return summary;
}
