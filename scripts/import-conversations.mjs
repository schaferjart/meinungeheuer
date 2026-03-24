import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const URL = 'https://zkgkyvvdeotqzxdgushn.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2t5dnZkZW90cXp4ZGd1c2huIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ5ODc3OCwiZXhwIjoyMDg4MDc0Nzc4fQ.9-rvrivGjzfZTbM1z22OB8zA47d5eBFEUA7HJeEplbo';
const HEADERS = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

const data = JSON.parse(readFileSync('scripts/output/conversations-export.json', 'utf8'));
let sessions = 0, defs = 0, turns = 0;

for (const conv of data) {
  if (!conv.matched_definition) continue;
  const sid = randomUUID();

  // Insert session
  let r = await fetch(`${URL}/sessions`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ id: sid, elevenlabs_conversation_id: conv.conversation_id, created_at: conv.started_at_utc, mode: 'text_term', term: conv.matched_definition.term, context_text: 'imported' }) });
  if (!r.ok) { console.error('S:', r.status, await r.text()); continue; }
  sessions++;

  // Link definition
  r = await fetch(`${URL}/definitions?id=eq.${conv.matched_definition.id}&session_id=is.null`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ session_id: sid }) });
  if (r.ok) defs++;

  // Insert turns
  const rows = conv.transcript.filter(t => t.message && t.message.trim()).map((t, i) => ({
    session_id: sid, turn_number: i + 1,
    role: t.role === 'user' ? 'visitor' : 'agent',
    content: t.message, language: conv.matched_definition.language || 'en',
    created_at: conv.started_at_utc
  }));

  if (rows.length) {
    r = await fetch(`${URL}/turns`, { method: 'POST', headers: HEADERS, body: JSON.stringify(rows) });
    if (!r.ok) console.error('T:', r.status, await r.text());
    else turns += rows.length;
  }
}

console.log(`${sessions} sessions, ${defs} defs linked, ${turns} turns imported`);
