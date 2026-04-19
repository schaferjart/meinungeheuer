/**
 * denkfink Printer Bridge — main entry point.
 *
 * Lifecycle:
 *  1. Load config
 *  2. Subscribe to Supabase Realtime INSERT on print_queue where status='pending'
 *  3. On each new job: claim → POST to POS server → mark done/error
 *  4. Graceful shutdown on SIGINT / SIGTERM
 */

import { APP_NAME, createSupabaseClient } from '@meinungeheuer/shared';
import { PrintPayloadSchema, PortraitPrintPayloadSchema } from '@meinungeheuer/shared';
import { loadConfig } from './config.js';
import { renderAndPrint, printPortrait } from './printer.js';

// ─── Boot ─────────────────────────────────────────────────────────────────────

const config = loadConfig();

console.log(`[bridge] ${APP_NAME} Printer Bridge starting…`);
console.log(`[bridge] POS server: ${config.posServerUrl || '(console mode)'}`);
console.log(`[bridge] Print renderer: ${config.printRendererUrl}`);

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

  try {
    if (rawPayload.type === 'portrait') {
      // Portrait: pre-rendered images, download from Storage and print
      const parsed = PortraitPrintPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        console.error(`[bridge] Invalid portrait payload for job ${rowId}:`, parsed.error.flatten());
        await supabase.from('print_queue').update({ status: 'error' }).eq('id', rowId);
        return;
      }
      await printPortrait(config.posServerUrl, parsed.data);
      console.log(`[bridge] Job ${rowId} done — portrait ${parsed.data.job_id}`);
    } else {
      // Text: render via cloud print-renderer, then print
      const parsed = PrintPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        console.error(`[bridge] Invalid payload for job ${rowId}:`, parsed.error.flatten());
        await supabase.from('print_queue').update({ status: 'error' }).eq('id', rowId);
        return;
      }
      await renderAndPrint(config.posServerUrl, config.printRendererUrl, config.renderApiKey, parsed.data);
      console.log(`[bridge] Job ${rowId} done — card for #${parsed.data.session_number} "${parsed.data.term}"`);
    }

    await supabase
      .from('print_queue')
      .update({ status: 'done', printed_at: new Date().toISOString() })
      .eq('id', rowId);
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

// ─── Poll for pending jobs ───────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
let polling = false;

async function pollPendingJobs(): Promise<void> {
  if (polling) return; // prevent overlapping polls
  polling = true;

  try {
    const { data, error } = await supabase
      .from('print_queue')
      .select('id, payload')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[bridge] Poll error:', error.message);
      return;
    }

    if (!data || data.length === 0) return;

    console.log(`[bridge] Found ${data.length} pending job(s).`);
    for (const row of data) {
      await processJob(row.id, row.payload as Record<string, unknown>);
    }
  } finally {
    polling = false;
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
        console.log(`[bridge] Falling back to polling every ${POLL_INTERVAL_MS / 1000}s.`);
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
  // Initial drain
  await pollPendingJobs();

  // Try Realtime, but always start polling as backup
  startRealtimeSubscription();

  // Poll every 5s — works even when Realtime is down
  setInterval(() => {
    pollPendingJobs().catch((err: unknown) => {
      console.error('[bridge] Poll error:', err);
    });
  }, POLL_INTERVAL_MS);

  console.log('[bridge] Ready. Listening for print jobs (Realtime + polling).');
}

main().catch((err: unknown) => {
  console.error('[bridge] Fatal startup error:', err);
  process.exit(1);
});
