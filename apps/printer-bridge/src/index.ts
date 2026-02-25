/**
 * MeinUngeheuer Printer Bridge — main entry point.
 *
 * Lifecycle:
 *  1. Load config
 *  2. Connect to printer (or enter console mode)
 *  3. Subscribe to Supabase Realtime INSERT on print_queue where status='pending'
 *  4. On each new job: claim → format → print → mark done/error
 *  5. Heartbeat every 30 s: check printer, reconnect if needed
 *  6. Graceful shutdown on SIGINT / SIGTERM
 */

import { createSupabaseClient } from '@meinungeheuer/shared';
import { PrintPayloadSchema } from '@meinungeheuer/shared';
import { PRINTER } from '@meinungeheuer/shared';
import { loadConfig } from './config.js';
import { createPrinter, printCard, getStatus, reconnect } from './printer.js';
import type { PrinterHandle } from './printer.js';

// ─── Boot ─────────────────────────────────────────────────────────────────────

const config = loadConfig();

console.log('[bridge] MeinUngeheuer Printer Bridge starting…');
console.log(`[bridge] Printer connection: ${config.connection}`);
console.log(`[bridge] Paper width: ${config.maxWidthChars} chars / ${config.maxWidthMm} mm`);

// ─── Printer init ─────────────────────────────────────────────────────────────

let printerHandle: PrinterHandle = createPrinter(config);

async function ensurePrinterConnected(): Promise<void> {
  const { connected } = await getStatus(printerHandle);
  if (!connected) {
    console.warn('[bridge] Printer not connected — attempting reconnect…');
    printerHandle = await reconnect(
      printerHandle,
      PRINTER.RECONNECT_ATTEMPTS,
      PRINTER.RECONNECT_DELAY_MS,
    );
  }
}

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
 * - Sends to printer
 * - Marks done or error
 *
 * Never throws; all errors are caught, logged, and reflected in the DB row.
 */
async function processJob(rowId: string, rawPayload: Record<string, unknown>): Promise<void> {
  console.log(`[bridge] Claiming job ${rowId}`);

  // Claim: set status to 'printing' — prevents double-processing if multiple
  // bridge instances are running (advisory lock via Supabase update).
  const { error: claimError } = await supabase
    .from('print_queue')
    .update({ status: 'printing' })
    .eq('id', rowId)
    .eq('status', 'pending'); // only claim if still pending

  if (claimError) {
    console.error(`[bridge] Failed to claim job ${rowId}:`, claimError.message);
    return;
  }

  // Validate payload shape
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
    await ensurePrinterConnected();
    await printCard(printerHandle, payload);

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

/**
 * Also checks for any pending jobs that were created before the bridge started
 * (e.g. during downtime) so we don't miss them.
 */
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
          // Filter is server-side but double-check client-side for safety
          return;
        }

        console.log(`[bridge] Realtime: new pending job ${row.id}`);
        // Process asynchronously; do not await here so we don't block the
        // Realtime event loop.
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

// ─── Heartbeat ────────────────────────────────────────────────────────────────

let heartbeatTimer: NodeJS.Timeout | null = null;

function startHeartbeat(): void {
  heartbeatTimer = setInterval(async () => {
    try {
      const { connected } = await getStatus(printerHandle);
      if (!connected && printerHandle.mode !== 'console') {
        console.warn('[bridge] Heartbeat: printer disconnected, reconnecting…');
        printerHandle = await reconnect(
          printerHandle,
          PRINTER.RECONNECT_ATTEMPTS,
          PRINTER.RECONNECT_DELAY_MS,
        );
        const { connected: nowConnected } = await getStatus(printerHandle);
        if (nowConnected) {
          console.log('[bridge] Heartbeat: reconnected successfully.');
        } else {
          console.error('[bridge] Heartbeat: reconnect failed.');
        }
      } else {
        console.log(`[bridge] Heartbeat: printer ${connected ? 'OK' : 'N/A (console mode)'}`);
      }
    } catch (err) {
      console.error('[bridge] Heartbeat error:', err);
    }
  }, PRINTER.HEARTBEAT_INTERVAL_MS);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n[bridge] Received ${signal}. Shutting down…`);

  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
  }

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
  // Initial printer connectivity check (non-fatal in console mode)
  try {
    await ensurePrinterConnected();
    const { connected } = await getStatus(printerHandle);
    if (connected) {
      console.log('[bridge] Printer ready.');
    } else {
      console.warn('[bridge] Printer not reachable at startup — continuing anyway.');
    }
  } catch (err) {
    console.error('[bridge] Printer startup error:', err);
  }

  // Process any jobs that accumulated while the bridge was offline
  await drainPendingJobs();

  // Listen for new jobs
  startRealtimeSubscription();

  // Monitor printer health
  startHeartbeat();

  console.log('[bridge] Ready. Listening for print jobs.');
}

main().catch((err: unknown) => {
  console.error('[bridge] Fatal startup error:', err);
  process.exit(1);
});
