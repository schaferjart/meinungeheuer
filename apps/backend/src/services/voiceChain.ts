import {
  SpeechProfileSchema,
  VoiceChainStateSchema,
  VOICE_CLONE,
  SPEECH_PROFILE_EXTRACTION,
  ICEBREAKER_GENERATION,
} from '@denkfink/installation-core';
import type { SpeechProfile, VoiceChainState } from '@denkfink/installation-core';
import { supabase } from './supabase.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function getElevenLabsApiKey(): string {
  const key = process.env['ELEVENLABS_API_KEY'];
  if (!key) throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  return key;
}

function getOpenRouterApiKey(): string {
  const key = process.env['OPENROUTER_API_KEY'];
  if (!key) throw new Error('OPENROUTER_API_KEY environment variable is not set');
  return key;
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ---------------------------------------------------------------------------
// cloneVoice
// ---------------------------------------------------------------------------

/**
 * Submits a visitor audio recording to ElevenLabs to create a voice clone.
 * Returns the new voice_id or null on failure.
 * Never throws.
 */
export async function cloneVoice(audioBuffer: Buffer, sessionId: string): Promise<string | null> {
  try {
    const apiKey = getElevenLabsApiKey();

    // ElevenLabs has an 11MB upload limit — truncate if needed.
    // First ~10MB of webm/opus is plenty for voice cloning (~60-90s of audio).
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB (leave 1MB headroom)
    const trimmedBuffer = audioBuffer.byteLength > MAX_BYTES
      ? audioBuffer.subarray(0, MAX_BYTES)
      : audioBuffer;

    if (audioBuffer.byteLength > MAX_BYTES) {
      console.log('[voiceChain/cloneVoice] Audio trimmed:', {
        original: `${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`,
        trimmed: `${(trimmedBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`,
      });
    }

    const formData = new FormData();
    formData.append('name', `visitor_${sessionId}`);
    formData.append('remove_background_noise', String(VOICE_CLONE.removeBackgroundNoise));

    // Wrap the Buffer in a Blob so FormData can attach it as a file field
    const audioBlob = new Blob([trimmedBuffer], { type: 'audio/webm' });
    formData.append('files', audioBlob, `visitor_${sessionId}.webm`);

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[voiceChain/cloneVoice] ElevenLabs API error:', {
        sessionId,
        status: response.status,
        body: text,
      });
      return null;
    }

    const data = (await response.json()) as { voice_id?: string };
    if (!data.voice_id) {
      console.error('[voiceChain/cloneVoice] No voice_id in response:', { sessionId, data });
      return null;
    }

    console.log('[voiceChain/cloneVoice] Voice cloned successfully:', {
      sessionId,
      voice_id: data.voice_id,
    });
    return data.voice_id;
  } catch (err) {
    console.error('[voiceChain/cloneVoice] Unexpected error:', { sessionId, error: err });
    return null;
  }
}

// ---------------------------------------------------------------------------
// deleteVoiceClone
// ---------------------------------------------------------------------------

/**
 * Deletes a voice clone from ElevenLabs.
 * Fire-and-forget — never throws.
 */
export async function deleteVoiceClone(voiceId: string): Promise<void> {
  try {
    const apiKey = getElevenLabsApiKey();

    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[voiceChain/deleteVoiceClone] ElevenLabs API error:', {
        voiceId,
        status: response.status,
        body: text,
      });
      return;
    }

    console.log('[voiceChain/deleteVoiceClone] Voice clone deleted:', { voiceId });
  } catch (err) {
    console.error('[voiceChain/deleteVoiceClone] Unexpected error:', { voiceId, error: err });
  }
}

// ---------------------------------------------------------------------------
// extractSpeechProfile
// ---------------------------------------------------------------------------

// Speech profile prompt now lives in voiceChainConfig

/**
 * Uses an LLM to extract a structured speech profile from a conversation transcript.
 * Returns null on any failure.
 */
export async function extractSpeechProfile(
  transcript: Array<{ role: string; content: string }>,
): Promise<SpeechProfile | null> {
  try {
    const apiKey = getOpenRouterApiKey();

    // Filter to visitor-only turns for analysis
    const visitorTurns = transcript.filter((t) => t.role === 'user' || t.role === 'visitor');

    if (visitorTurns.length === 0) {
      console.warn('[voiceChain/extractSpeechProfile] No visitor turns in transcript');
      return null;
    }

    const transcriptText = visitorTurns.map((t) => `Visitor: ${t.content}`).join('\n');

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SPEECH_PROFILE_EXTRACTION.model,
        messages: [
          { role: 'system', content: SPEECH_PROFILE_EXTRACTION.systemPrompt },
          { role: 'user', content: transcriptText },
        ],
        temperature: SPEECH_PROFILE_EXTRACTION.temperature,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[voiceChain/extractSpeechProfile] OpenRouter API error:', {
        status: response.status,
        body: text,
      });
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error('[voiceChain/extractSpeechProfile] No content in response');
      return null;
    }

    // Strip possible markdown code fences before parsing
    const jsonText = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error('[voiceChain/extractSpeechProfile] JSON parse error:', { rawContent });
      return null;
    }

    const validated = SpeechProfileSchema.safeParse(parsed);
    if (!validated.success) {
      console.error('[voiceChain/extractSpeechProfile] Schema validation failed:', {
        errors: validated.error.flatten(),
        parsed,
      });
      return null;
    }

    return validated.data;
  } catch (err) {
    console.error('[voiceChain/extractSpeechProfile] Unexpected error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// generateIcebreaker
// ---------------------------------------------------------------------------

// Icebreaker prompt now lives in voiceChainConfig

/**
 * Generates a conversation icebreaker derived from a transcript.
 * Returns null on any failure.
 */
export async function generateIcebreaker(
  transcript: Array<{ role: string; content: string }>,
): Promise<string | null> {
  try {
    const apiKey = getOpenRouterApiKey();

    const transcriptText = transcript
      .map((t) => `${t.role === 'user' || t.role === 'visitor' ? 'Visitor' : 'Agent'}: ${t.content}`)
      .join('\n');

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ICEBREAKER_GENERATION.model,
        messages: [
          { role: 'system', content: ICEBREAKER_GENERATION.systemPrompt },
          { role: 'user', content: transcriptText },
        ],
        temperature: ICEBREAKER_GENERATION.temperature,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[voiceChain/generateIcebreaker] OpenRouter API error:', {
        status: response.status,
        body: text,
      });
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error('[voiceChain/generateIcebreaker] No content in response');
      return null;
    }

    return content;
  } catch (err) {
    console.error('[voiceChain/generateIcebreaker] Unexpected error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getLatestVoiceChainState
// ---------------------------------------------------------------------------

/**
 * Returns the latest active voice_chain_state row, or null if none exists.
 */
export async function getLatestVoiceChainState(): Promise<VoiceChainState | null> {
  try {
    const { data, error } = await supabase
      .from('voice_chain_state')
      .select(
        'id, session_id, voice_clone_id, voice_clone_status, speech_profile, icebreaker, portrait_blurred_url, chain_position, created_at',
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[voiceChain/getLatestVoiceChainState] Query error:', error);
      return null;
    }

    if (!data) return null;

    // Normalize: the DB row may not have is_active in the SELECT above, so
    // we add it before validating (always true since we filtered on it).
    const rowWithActive = { ...data, is_active: true };
    const validated = VoiceChainStateSchema.safeParse(rowWithActive);
    if (!validated.success) {
      console.error('[voiceChain/getLatestVoiceChainState] Schema validation failed:', {
        errors: validated.error.flatten(),
        data,
      });
      return null;
    }

    return validated.data;
  } catch (err) {
    console.error('[voiceChain/getLatestVoiceChainState] Unexpected error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// processVoiceChain (main orchestrator)
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full voice chain processing pipeline after a conversation ends:
 * 1. Clone the visitor's voice (parallel with steps 2+3)
 * 2. Extract their speech profile from the transcript
 * 3. Generate an icebreaker from the transcript
 * 4. Deactivate all existing voice_chain_state rows
 * 5. Insert a new active row with results
 * 6. Clean up old voice clones beyond the retention window
 *
 * This function should be called fire-and-forget. It never throws.
 */
export async function processVoiceChain(params: {
  audioBuffer: Buffer;
  transcript: Array<{ role: string; content: string }>;
  sessionId: string;
  portraitBlurredUrl: string | null;
}): Promise<void> {
  const { audioBuffer, transcript, sessionId, portraitBlurredUrl } = params;

  console.log('[voiceChain/processVoiceChain] Starting pipeline for session:', sessionId);

  try {
    // -----------------------------------------------------------------------
    // 1-3. Run independent tasks in parallel
    // -----------------------------------------------------------------------

    const [voiceCloneId, speechProfile, icebreaker] = await Promise.all([
      cloneVoice(audioBuffer, sessionId),
      extractSpeechProfile(transcript),
      generateIcebreaker(transcript),
    ]);

    // -----------------------------------------------------------------------
    // 4. Deactivate all existing active rows
    // -----------------------------------------------------------------------

    const { error: deactivateError } = await supabase
      .from('voice_chain_state')
      .update({ is_active: false })
      .eq('is_active', true);

    if (deactivateError) {
      console.error('[voiceChain/processVoiceChain] Deactivate error:', {
        sessionId,
        error: deactivateError,
      });
      // Continue — we still want to insert the new row
    }

    // -----------------------------------------------------------------------
    // 5. Calculate chain position and insert new row
    // -----------------------------------------------------------------------

    const { data: maxRow } = await supabase
      .from('voice_chain_state')
      .select('chain_position')
      .order('chain_position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newChainPosition = ((maxRow as { chain_position?: number } | null)?.chain_position ?? 0) + 1;

    const { data: inserted, error: insertError } = await supabase
      .from('voice_chain_state')
      .insert({
        session_id: sessionId && sessionId !== 'unknown' ? sessionId : null,
        voice_clone_id: voiceCloneId,
        voice_clone_status: voiceCloneId ? 'ready' : 'failed',
        speech_profile: speechProfile,
        icebreaker,
        portrait_blurred_url: portraitBlurredUrl,
        chain_position: newChainPosition,
        is_active: true,
      })
      .select('id, chain_position')
      .single();

    if (insertError || !inserted) {
      console.error('[voiceChain/processVoiceChain] Insert error:', {
        sessionId,
        error: insertError,
      });
      return;
    }

    console.log('[voiceChain/processVoiceChain] New chain state inserted:', {
      id: inserted.id,
      chain_position: inserted.chain_position,
      has_voice_clone: !!voiceCloneId,
      has_speech_profile: !!speechProfile,
      has_icebreaker: !!icebreaker,
    });

    // -----------------------------------------------------------------------
    // 6. Clean up old voice clones (retain current + 1 previous)
    // -----------------------------------------------------------------------

    const retentionCutoff = newChainPosition - VOICE_CLONE.retentionWindow;

    if (retentionCutoff > 0) {
      const { data: staleRows, error: staleError } = await supabase
        .from('voice_chain_state')
        .select('id, voice_clone_id')
        .lt('chain_position', retentionCutoff + 1) // chain_position < retentionCutoff + 1  i.e. <= retentionCutoff
        .eq('voice_clone_status', 'ready');

      if (staleError) {
        console.error('[voiceChain/processVoiceChain] Stale rows query error:', staleError);
      } else if (staleRows && staleRows.length > 0) {
        // Fire-and-forget deletes in parallel
        const deletePromises = staleRows.map(async (row: { id: string; voice_clone_id: string | null }) => {
          if (row.voice_clone_id) {
            await deleteVoiceClone(row.voice_clone_id);
          }
          await supabase
            .from('voice_chain_state')
            .update({ voice_clone_status: 'deleted' })
            .eq('id', row.id);
        });

        await Promise.all(deletePromises);

        console.log('[voiceChain/processVoiceChain] Cleaned up old voice clones:', {
          count: staleRows.length,
        });
      }
    }
  } catch (err) {
    console.error('[voiceChain/processVoiceChain] Unexpected error in pipeline:', {
      sessionId,
      error: err,
    });
  }
}
