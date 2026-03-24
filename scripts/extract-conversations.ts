#!/usr/bin/env npx tsx
/**
 * extract-conversations.ts
 *
 * Pulls all conversation transcripts from ElevenLabs, matches them with
 * definitions from Supabase, and reconstructs the system prompt used
 * for each session.
 *
 * Usage:
 *   npx tsx scripts/extract-conversations.ts
 *
 * Reads env vars from apps/backend/.env:
 *   ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Output: scripts/output/conversations-export.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const AGENT_ID = 'agent_7201kjt1wgyqfjp8zkr68r3ngas6';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const PAGE_SIZE = 100;
// ElevenLabs list_conversations returns timestamps in UTC epoch seconds,
// but the formatted display may be CET. We work with epoch seconds internally.

// ---------------------------------------------------------------------------
// Load env from apps/backend/.env
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

function loadEnv(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const backendEnv = loadEnv(resolve(ROOT, 'apps/backend/.env'));
const tabletEnv = loadEnv(resolve(ROOT, 'apps/tablet/.env'));

const ELEVENLABS_API_KEY = backendEnv.ELEVENLABS_API_KEY || tabletEnv.VITE_ELEVENLABS_API_KEY;
const SUPABASE_URL = backendEnv.SUPABASE_URL || tabletEnv.VITE_SUPABASE_URL;
const SUPABASE_KEY = backendEnv.SUPABASE_SERVICE_ROLE_KEY || tabletEnv.VITE_SUPABASE_ANON_KEY;

if (!ELEVENLABS_API_KEY) throw new Error('Missing ELEVENLABS_API_KEY');
if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_KEY');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ELConversationListItem {
  conversation_id: string;
  status: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count: number;
  call_successful: string;
}

interface ELTranscriptMessage {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs?: number;
}

interface ELConversationDetail {
  conversation_id: string;
  status: string;
  transcript: ELTranscriptMessage[];
  metadata: Record<string, unknown>;
  analysis?: {
    agent_prompt_overrides?: {
      prompt?: { prompt?: string };
    };
    data_collection_results?: Record<string, unknown>;
  };
}

interface Definition {
  id: string;
  term: string;
  definition_text: string;
  citations: string[] | null;
  language: string;
  chain_depth: number;
  created_at: string;
  session_id: string | null;
}

interface VoiceChainState {
  id: string;
  session_id: string | null;
  speech_profile: Record<string, unknown> | null;
  icebreaker: string | null;
  chain_position: number;
  created_at: string;
}

interface MatchedConversation {
  conversation_id: string;
  status: string;
  started_at_utc: string;
  started_at_unix: number;
  duration_seconds: number;
  message_count: number;
  call_successful: string;
  transcript: ELTranscriptMessage[];
  matched_definition: Definition | null;
  match_method: string | null;
  match_confidence: 'high' | 'medium' | 'low' | null;
  inferred_program: string;
  reconstructed_system_prompt: string | null;
  voice_chain_state: VoiceChainState | null;
  first_agent_message: string | null;
}

// ---------------------------------------------------------------------------
// ElevenLabs API
// ---------------------------------------------------------------------------

async function elFetch(path: string): Promise<unknown> {
  const url = `${ELEVENLABS_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs API ${res.status}: ${body}`);
  }
  return res.json();
}

async function listAllConversations(): Promise<ELConversationListItem[]> {
  const all: ELConversationListItem[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (true) {
    page++;
    const params = new URLSearchParams({
      agent_id: AGENT_ID,
      page_size: String(PAGE_SIZE),
    });
    if (cursor) params.set('cursor', cursor);

    console.log(`  Fetching conversation list page ${page}...`);
    const data = (await elFetch(`/convai/conversations?${params}`)) as {
      conversations: ELConversationListItem[];
      next_cursor?: string;
    };

    all.push(...data.conversations);
    console.log(`  Got ${data.conversations.length} conversations (total: ${all.length})`);

    if (!data.next_cursor || data.conversations.length === 0) break;
    cursor = data.next_cursor;
  }

  return all;
}

async function getConversation(id: string): Promise<ELConversationDetail> {
  return (await elFetch(`/convai/conversations/${id}`)) as ELConversationDetail;
}

// ---------------------------------------------------------------------------
// Supabase REST API
// ---------------------------------------------------------------------------

async function supabaseQuery<T>(table: string, queryParams: string = ''): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body}`);
  }
  return res.json() as Promise<T[]>;
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function citationMatchScore(citations: string[], transcript: ELTranscriptMessage[]): number {
  const userMessages = transcript
    .filter(m => m.role === 'user')
    .map(m => normalizeText(m.message));
  const allUserText = userMessages.join(' ');

  let matched = 0;
  for (const citation of citations) {
    const normCitation = normalizeText(citation);
    if (normCitation.length < 3) continue; // skip trivial citations like "..."
    if (allUserText.includes(normCitation)) {
      matched++;
    }
  }

  return citations.length > 0 ? matched / citations.length : 0;
}

function matchDefinition(
  conv: { started_at_unix: number; duration_seconds: number; transcript: ELTranscriptMessage[] },
  definitions: Definition[],
): { definition: Definition | null; method: string | null; confidence: 'high' | 'medium' | 'low' | null } {
  // Conversation time window: definition should be created near the end of conversation
  const convEndUnix = conv.started_at_unix + conv.duration_seconds;

  // Strategy 1: Citation text matching
  const candidates: Array<{ def: Definition; score: number; timeDiff: number }> = [];

  for (const def of definitions) {
    const defUnix = new Date(def.created_at).getTime() / 1000;

    // Definition should be created within a reasonable window:
    // after conversation start, up to 60s after conversation end
    const timeDiff = defUnix - convEndUnix;
    if (defUnix < conv.started_at_unix - 60 || timeDiff > 120) continue;

    if (def.citations && def.citations.length > 0) {
      const score = citationMatchScore(def.citations, conv.transcript);
      if (score > 0) {
        candidates.push({ def, score, timeDiff: Math.abs(timeDiff) });
      }
    }
  }

  // Sort by citation match score (desc), then by time proximity (asc)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timeDiff - b.timeDiff;
  });

  if (candidates.length > 0) {
    const best = candidates[0];
    const confidence = best.score >= 0.66 ? 'high' : best.score >= 0.33 ? 'medium' : 'low';
    return { definition: best.def, method: `citation_match (${(best.score * 100).toFixed(0)}%)`, confidence };
  }

  // Strategy 2: Timestamp proximity only (for definitions without citations)
  const timeMatches: Array<{ def: Definition; timeDiff: number }> = [];
  for (const def of definitions) {
    const defUnix = new Date(def.created_at).getTime() / 1000;
    const timeDiff = defUnix - convEndUnix;
    // Definition should be created very close to conversation end
    if (timeDiff >= -30 && timeDiff <= 60) {
      timeMatches.push({ def, timeDiff: Math.abs(timeDiff) });
    }
  }

  if (timeMatches.length === 1) {
    return { definition: timeMatches[0].def, method: 'timestamp_proximity', confidence: 'medium' };
  }

  return { definition: null, method: null, confidence: null };
}

// ---------------------------------------------------------------------------
// Program inference
// ---------------------------------------------------------------------------

function inferProgram(transcript: ELTranscriptMessage[], voiceChainState: VoiceChainState | null): string {
  if (transcript.length === 0) return 'unknown';

  const firstAgent = transcript.find(m => m.role === 'agent' && m.message && m.message !== 'None');
  if (!firstAgent) return 'unknown';

  const msg = firstAgent.message.toLowerCase();

  // Aphorism program: starts with text reading reference
  if (msg.includes('du hast gerade einen text gelesen') || msg.includes('you just read a text')) {
    return 'aphorism';
  }

  // Free association: starts with open question
  if (msg.includes('was geht dir gerade durch den kopf') || msg.includes('what is on your mind right now')) {
    return 'free_association';
  }

  // Voice chain: cold start messages
  if (
    msg.includes('jemand war gerade hier vor dir') ||
    msg.includes('someone was just here before you')
  ) {
    return 'voice_chain';
  }

  // Voice chain: custom icebreaker (if we have voice chain state matching)
  if (voiceChainState) {
    return 'voice_chain';
  }

  // Default: if it starts with a provocative/custom opening, likely voice_chain
  // Check for typical voice_chain patterns
  if (
    msg.includes('earlier') ||
    msg.includes('conversation') ||
    msg.includes('left behind') ||
    msg.includes('hinterlassen')
  ) {
    return 'voice_chain (inferred)';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// System prompt reconstruction
// ---------------------------------------------------------------------------

function reconstructSystemPrompt(program: string, _voiceChainState: VoiceChainState | null): string | null {
  // We return the template name and parameters, not the full prompt text
  // (since the full prompt is very long and available in the source code)
  switch (program) {
    case 'aphorism':
      return '[APHORISM PROGRAM] System prompt from packages/shared/src/programs/aphorism.ts — buildSystemPrompt() with contextText from the active text. Exact contextText not recoverable per-session (not stored).';
    case 'free_association':
      return '[FREE ASSOCIATION PROGRAM] Static system prompt from packages/shared/src/programs/free-association.ts — no dynamic parameters.';
    case 'voice_chain':
    case 'voice_chain (inferred)':
      if (_voiceChainState?.speech_profile) {
        return `[VOICE CHAIN PROGRAM] System prompt from packages/shared/src/programs/voice-chain.ts with speechProfile: ${JSON.stringify(_voiceChainState.speech_profile, null, 2).slice(0, 500)}... icebreaker: "${_voiceChainState.icebreaker ?? 'N/A'}"`;
      }
      return '[VOICE CHAIN PROGRAM] System prompt from packages/shared/src/programs/voice-chain.ts — speechProfile not found in voice_chain_state.';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== MeinUngeheuer Conversation Extraction ===\n');

  // 1. Fetch all conversations from ElevenLabs
  console.log('1. Fetching conversation list from ElevenLabs...');
  const conversations = await listAllConversations();
  console.log(`   Total conversations: ${conversations.length}\n`);

  // 2. Fetch definitions from Supabase
  console.log('2. Fetching definitions from Supabase...');
  const definitions = await supabaseQuery<Definition>('definitions', 'order=created_at.asc');
  console.log(`   Total definitions: ${definitions.length}\n`);

  // 3. Fetch voice chain state from Supabase
  console.log('3. Fetching voice chain state from Supabase...');
  const voiceChainStates = await supabaseQuery<VoiceChainState>(
    'voice_chain_state',
    'order=created_at.asc',
  );
  console.log(`   Total voice chain states: ${voiceChainStates.length}\n`);

  // 4. Filter substantive conversations (>1 message, not failed)
  const substantive = conversations.filter(
    c => c.message_count > 1 && c.status !== 'failed',
  );
  const skipped = conversations.length - substantive.length;
  console.log(`4. Substantive conversations: ${substantive.length} (skipped ${skipped} trivial/failed)\n`);

  // 5. Fetch full transcripts
  console.log('5. Fetching full transcripts...');
  const results: MatchedConversation[] = [];
  const usedDefinitionIds = new Set<string>();

  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < substantive.length; i += BATCH_SIZE) {
    const batch = substantive.slice(i, i + BATCH_SIZE);
    const details = await Promise.all(
      batch.map(async (conv) => {
        try {
          return await getConversation(conv.conversation_id);
        } catch (err) {
          console.error(`   Error fetching ${conv.conversation_id}: ${err}`);
          return null;
        }
      }),
    );

    for (let j = 0; j < batch.length; j++) {
      const conv = batch[j];
      const detail = details[j];
      if (!detail) continue;

      const startedAtUtc = new Date(conv.start_time_unix_secs * 1000).toISOString();

      // Filter transcript: remove None messages
      const transcript = (detail.transcript || []).filter(
        (m: ELTranscriptMessage) => m.message && m.message !== 'None',
      );

      // Match with definition (excluding already-used definitions)
      const availableDefinitions = definitions.filter(d => !usedDefinitionIds.has(d.id));
      const match = matchDefinition(
        {
          started_at_unix: conv.start_time_unix_secs,
          duration_seconds: conv.call_duration_secs,
          transcript,
        },
        availableDefinitions,
      );

      if (match.definition) {
        usedDefinitionIds.add(match.definition.id);
      }

      // Find associated voice chain state (by time proximity to conversation)
      const vcs = voiceChainStates.find(v => {
        const vcsUnix = new Date(v.created_at).getTime() / 1000;
        const convEnd = conv.start_time_unix_secs + conv.call_duration_secs;
        return Math.abs(vcsUnix - convEnd) < 120;
      });

      const firstAgentMsg = transcript.find((m: ELTranscriptMessage) => m.role === 'agent');
      const program = inferProgram(transcript, vcs ?? null);

      results.push({
        conversation_id: conv.conversation_id,
        status: conv.status,
        started_at_utc: startedAtUtc,
        started_at_unix: conv.start_time_unix_secs,
        duration_seconds: conv.call_duration_secs,
        message_count: conv.message_count,
        call_successful: conv.call_successful,
        transcript,
        matched_definition: match.definition,
        match_method: match.method,
        match_confidence: match.confidence,
        inferred_program: program,
        reconstructed_system_prompt: reconstructSystemPrompt(program, vcs ?? null),
        voice_chain_state: vcs ?? null,
        first_agent_message: firstAgentMsg?.message ?? null,
      });
    }

    const processed = Math.min(i + BATCH_SIZE, substantive.length);
    console.log(`   Processed ${processed}/${substantive.length}`);
  }

  // Also include single-message conversations as stubs
  const trivial = conversations.filter(
    c => c.message_count <= 1 && c.status !== 'failed',
  );
  for (const conv of trivial) {
    results.push({
      conversation_id: conv.conversation_id,
      status: conv.status,
      started_at_utc: new Date(conv.start_time_unix_secs * 1000).toISOString(),
      started_at_unix: conv.start_time_unix_secs,
      duration_seconds: conv.call_duration_secs,
      message_count: conv.message_count,
      call_successful: conv.call_successful,
      transcript: [],
      matched_definition: null,
      match_method: 'skipped (trivial)',
      match_confidence: null,
      inferred_program: 'unknown',
      reconstructed_system_prompt: null,
      voice_chain_state: null,
      first_agent_message: null,
    });
  }

  // Sort by start time (newest first)
  results.sort((a, b) => b.started_at_unix - a.started_at_unix);

  // 6. Write output
  const outputDir = resolve(__dirname, 'output');
  mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, 'conversations-export.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));

  // 7. Summary
  console.log('\n=== Summary ===');
  console.log(`Total conversations: ${conversations.length}`);
  console.log(`Substantive (>1 msg): ${substantive.length}`);
  console.log(`Definitions in DB: ${definitions.length}`);
  console.log(`Matched: ${results.filter(r => r.matched_definition).length}`);
  console.log(`Unmatched conversations: ${results.filter(r => !r.matched_definition && r.message_count > 1).length}`);
  console.log(`Unmatched definitions: ${definitions.filter(d => !usedDefinitionIds.has(d.id)).length}`);

  // Program breakdown
  const programCounts: Record<string, number> = {};
  for (const r of results) {
    programCounts[r.inferred_program] = (programCounts[r.inferred_program] || 0) + 1;
  }
  console.log('\nProgram breakdown:');
  for (const [program, count] of Object.entries(programCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${program}: ${count}`);
  }

  // Match confidence breakdown
  const confidenceCounts: Record<string, number> = {};
  for (const r of results.filter(r => r.match_confidence)) {
    confidenceCounts[r.match_confidence!] = (confidenceCounts[r.match_confidence!] || 0) + 1;
  }
  console.log('\nMatch confidence:');
  for (const [conf, count] of Object.entries(confidenceCounts)) {
    console.log(`  ${conf}: ${count}`);
  }

  console.log(`\nOutput written to: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
