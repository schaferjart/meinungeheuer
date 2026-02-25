/**
 * Printer abstraction.
 *
 * Wraps node-thermal-printer so the rest of the service never touches the
 * library directly.  For connection === 'console' everything is logged to
 * stdout — no physical printer required.
 *
 * The module is structured around a plain object (PrinterHandle) rather than a
 * class so callers can import individual functions without instantiation.
 */

import {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
  BreakLine,
} from 'node-thermal-printer';

import type { PrintPayload } from '@meinungeheuer/shared';
import type { PrinterConfig } from './config.js';
import { formatCard, formatCardForPrinter, dividerLine } from './layout.js';
import type { PrintCommand } from './layout.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrinterHandle {
  /** 'thermal' when a real printer is configured, 'console' for log-only mode. */
  mode: 'thermal' | 'console';
  /** The underlying node-thermal-printer instance (null in console mode). */
  instance: ThermalPrinter | null;
  config: PrinterConfig;
}

// ─── Interface string builder ─────────────────────────────────────────────────

function buildInterfaceString(config: PrinterConfig): string {
  if (config.connection === 'network') {
    const host = config.host ?? '127.0.0.1';
    const port = config.port ?? 9100;
    return `tcp://${host}:${port}`;
  }
  if (config.connection === 'usb') {
    // node-thermal-printer uses the 'printer:' scheme for OS-level printer
    // queues.  For raw USB we fall back to a file device path if the user
    // sets PRINTER_DEVICE_PATH, otherwise use a sensible Linux default.
    return process.env['PRINTER_DEVICE_PATH'] ?? '/dev/usb/lp0';
  }
  // console mode: we still need a string — use /dev/null so the constructor
  // does not throw, but we never call execute() in this mode.
  return '/dev/null';
}

// ─── Character set mapping ────────────────────────────────────────────────────

/**
 * Maps a charset hint from config to a node-thermal-printer CharacterSet enum
 * value.  Defaults to PC850_MULTILINGUAL which covers most Western European
 * characters including German umlauts.
 */
function resolveCharacterSet(charset: string): CharacterSet {
  const upper = charset.toUpperCase();
  // UTF-8 is handled at the application level (transliteration); tell the
  // printer to use a Western codepage.
  if (upper === 'UTF-8' || upper === 'UTF8') return CharacterSet.PC850_MULTILINGUAL;
  if (upper === 'PC850') return CharacterSet.PC850_MULTILINGUAL;
  if (upper === 'PC437') return CharacterSet.PC437_USA;
  if (upper === 'WPC1252') return CharacterSet.WPC1252;
  if (upper === 'ISO8859-15' || upper === 'ISO8859_15') return CharacterSet.ISO8859_15_LATIN9;
  return CharacterSet.PC850_MULTILINGUAL;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates and returns a PrinterHandle.
 *
 * In 'console' mode this is a no-op (no physical printer connection is
 * attempted).  In 'usb' or 'network' mode the node-thermal-printer instance
 * is initialised; the constructor does NOT open a socket/device yet — that
 * only happens on execute().
 */
export function createPrinter(config: PrinterConfig): PrinterHandle {
  if (config.connection === 'console') {
    return { mode: 'console', instance: null, config };
  }

  const interfaceString = buildInterfaceString(config);

  const instance = new ThermalPrinter({
    type: PrinterTypes.EPSON, // ESC/POS standard; works with most brands
    interface: interfaceString,
    width: config.maxWidthChars,
    characterSet: resolveCharacterSet(config.charset),
    removeSpecialCharacters: false, // we handle charset ourselves
    breakLine: BreakLine.WORD,
    options: { timeout: 5000 },
  });

  return { mode: 'thermal', instance, config };
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function getStatus(
  handle: PrinterHandle,
): Promise<{ connected: boolean }> {
  if (handle.mode === 'console') return { connected: true };
  if (handle.instance === null) return { connected: false };

  try {
    const connected = await handle.instance.isPrinterConnected();
    return { connected };
  } catch {
    return { connected: false };
  }
}

// ─── Core print routine ───────────────────────────────────────────────────────

/**
 * Applies a list of PrintCommands to a ThermalPrinter instance.
 * Clears the buffer first.
 */
function applyCommands(
  instance: ThermalPrinter,
  commands: PrintCommand[],
): void {
  instance.clear();

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'empty_line':
        instance.newLine();
        break;

      case 'divider':
        instance.alignLeft();
        instance.println(cmd.text ?? '');
        break;

      case 'text': {
        // Alignment
        if (cmd.alignment === 'center') instance.alignCenter();
        else if (cmd.alignment === 'right') instance.alignRight();
        else instance.alignLeft();

        // Size / weight
        if (cmd.bold) instance.bold(true);
        if (cmd.doubleHeight) instance.setTextDoubleHeight();

        instance.println(cmd.text ?? '');

        // Reset
        if (cmd.doubleHeight) instance.setTextNormal();
        if (cmd.bold) instance.bold(false);
        instance.alignLeft();
        break;
      }

      case 'cut':
        instance.cut();
        break;
    }
  }
}

// ─── Print card ───────────────────────────────────────────────────────────────

/**
 * Formats a PrintPayload and sends it to the printer.
 *
 * In console mode, the card is printed to stdout.
 * Throws on printer communication errors so the caller can mark the job as
 * error and continue without crashing.
 */
export async function printCard(
  handle: PrinterHandle,
  payload: PrintPayload,
): Promise<void> {
  if (handle.mode === 'console') {
    const lines = formatCard(payload, handle.config);
    console.log('\n' + '='.repeat(handle.config.maxWidthChars));
    for (const line of lines) {
      console.log(line);
    }
    console.log('='.repeat(handle.config.maxWidthChars) + '\n');
    return;
  }

  if (handle.instance === null) {
    throw new Error('Printer instance is not initialised');
  }

  const { commands } = formatCardForPrinter(payload, handle.config);
  applyCommands(handle.instance, commands);
  await handle.instance.execute();
}

// ─── Test print ───────────────────────────────────────────────────────────────

/** Sample payload used for test prints (no Supabase dependency). */
export function buildTestPayload(): PrintPayload {
  return {
    term: 'VOGEL',
    definition_text:
      'Ein Vogel ist ein glücklicher Zufall, der gelernt hat, der Schwerkraft zu widersprechen. ' +
      'Er ist die einzige Antwort auf eine Frage, die niemand gestellt hat, ' +
      'und gleichzeitig der Beweis dafür, dass die Natur manchmal einfach übertreibt.',
    citations: [
      '...alles was fliegt, weigert sich im Grunde zu bleiben',
      '...wie ein Gedanke, der entkam, bevor man ihn aufschreiben konnte',
    ],
    language: 'de',
    session_number: 47,
    chain_ref: '#0046 "FLUG"',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Prints a hardcoded test card.
 *
 * Useful for verifying printer connectivity and layout without a live Supabase
 * connection.
 */
export async function testPrint(handle: PrinterHandle): Promise<void> {
  console.log('[printer] Sending test card...');
  const payload = buildTestPayload();
  await printCard(handle, payload);
  console.log('[printer] Test card sent.');
}

// ─── Reconnect helper ─────────────────────────────────────────────────────────

/**
 * Attempts to create a fresh printer handle if the existing one is
 * disconnected.  Returns the same handle if it is still healthy.
 *
 * The caller is responsible for replacing its reference with the returned value.
 */
export async function reconnect(
  handle: PrinterHandle,
  attempts: number,
  delayMs: number,
): Promise<PrinterHandle> {
  for (let i = 1; i <= attempts; i++) {
    const { connected } = await getStatus(handle);
    if (connected) return handle;

    console.warn(`[printer] Reconnect attempt ${i}/${attempts}…`);
    if (i < attempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }

    // Re-initialise the underlying instance
    handle = createPrinter(handle.config);
  }

  const { connected } = await getStatus(handle);
  if (!connected) {
    console.error('[printer] All reconnect attempts failed. Continuing in degraded state.');
  }
  return handle;
}

// ─── Divider re-export (for console header in testPrint) ─────────────────────

export { dividerLine };
