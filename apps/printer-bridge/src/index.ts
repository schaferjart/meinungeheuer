/**
 * MeinUngeheuer Printer Bridge — main entry point.
 *
 * Lifecycle:
 *  1. Load config
 *  2. Subscribe to Supabase Realtime INSERT on print_queue where status='pending'
 *  3. On each new job: claim → POST to POS server → mark done/error
 *  4. Graceful shutdown on SIGINT / SIGTERM
 */

import { createSupabaseClient } from '@meinungeheuer/shared';
import { PrintPayloadSchema } from '@meinungeheuer/shared';
import { loadConfig } from './config.js';
import { printCard } from './printer.js';

// ─── Boot ─────────────────────────────────────────────────────────────────────

const config = loadConfig();

console.log('[bridge] MeinUngeheuer Printer Bridge starting…');
console.log(`[bridge] POS server: ${config.posServerUrl || '(console mode)'}`);

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabaseUrl = process.env['SUPABASE_URL'] ?? '';
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'] ?? '';

if (!supabaseUrl || !supabaseKey) {
  console.error('[bridge] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set.');
  process.exit(1);
}

const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

// ─── Job processing ───────────────────────────────────────────────────────────

/**
 * Processes a single print_queue row.
 *
 * - Claims the job by setting status → 'printing'
 * - Validates the payload via Zod
 * - POSTs to POS server
 * - Marks done or error
 *
 * Never throws; all errors are caught, logged, and reflected in the DB row.
 */
async function processJob(rowId: string, rawPayload: Record<string, unknown>): Promise<void> {
  console.log(`[bridge] Claiming job ${rowId}`);

  const { error: claimError } = await supabase
    .from('print_queue')
    .update({ status: 'printing' })
    .eq('id', rowId)
    .eq('status', 'pending');

  if (claimError) {
    console.error(`[bridge] Failed to claim job ${rowId}:`, claimError.message);
    return;
  }

  const parseResult = PrintPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    console.error(`[bridge] Invalid payload for job ${rowId}:`, parseResult.error.flatten());
    await supabase
      .from('print_queue')
      .update({ status: 'error' })
      .eq('id', rowId);
    return;
  }

  const payload = parseResult.data;

  try {
    await printCard(config.posServerUrl, payload);

    await supabase
      .from('print_queue')
      .update({ status: 'done', printed_at: new Date().toISOString() })
      .eq('id', rowId);

    console.log(`[bridge] Job ${rowId} done — card printed for #${payload.session_number} "${payload.term}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[bridge] Print error for job ${rowId}: ${message}`);

    const { error: markErrorErr } = await supabase
      .from('print_queue')
      .update({ status: 'error' })
      .eq('id', rowId);
    if (markErrorErr) {
      console.error('[bridge] Failed to update job status to error:', markErrorErr.message);
    }
  }
}

// ─── Realtime subscription ────────────────────────────────────────────────────

async function drainPendingJobs(): Promise<void> {
  console.log('[bridge] Draining pre-existing pending jobs…');

  const { data, error } = await supabase
    .from('print_queue')
    .select('id, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[bridge] Failed to query pending jobs:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('[bridge] No pending jobs found.');
    return;
  }

  console.log(`[bridge] Found ${data.length} pending job(s) to process.`);
  for (const row of data) {
    await processJob(row.id, row.payload as Record<string, unknown>);
  }
}

function startRealtimeSubscription(): void {
  console.log('[bridge] Subscribing to print_queue Realtime events…');

  supabase
    .channel('print_queue_inserts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'print_queue',
        filter: "status=eq.pending",
      },
      (payload) => {
        const row = payload.new as { id: string; payload: Record<string, unknown>; status: string };

        if (row.status !== 'pending') {
          return;
        }

        console.log(`[bridge] Realtime: new pending job ${row.id}`);
        processJob(row.id, row.payload).catch((err: unknown) => {
          console.error('[bridge] Unhandled error in processJob:', err);
        });
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[bridge] Realtime subscription active.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[bridge] Realtime subscription error (${status}):`, err?.message ?? err);
      } else {
        console.log(`[bridge] Realtime status: ${status}`);
      }
    });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n[bridge] Received ${signal}. Shutting down…`);

  supabase.removeAllChannels().catch((err: unknown) => {
    console.error('[bridge] Error removing Supabase channels:', err);
  });

  console.log('[bridge] Goodbye.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await drainPendingJobs();
  startRealtimeSubscription();
  console.log('[bridge] Ready. Listening for print jobs.');
}

main().catch((err: unknown) => {
  console.error('[bridge] Fatal startup error:', err);
  process.exit(1);
});
