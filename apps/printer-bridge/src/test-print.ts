/**
 * test-print.ts — CLI script for printing a sample card without Supabase.
 *
 * Usage:
 *   pnpm run test-print
 *   pnpm run test-print --text "custom definition text"
 *   pnpm run test-print --term "BEISPIEL"
 *
 * Reads the same env vars as the main service so the output respects the
 * configured paper width, connection type, etc.
 */

import { loadConfig } from './config.js';
import { createPrinter, testPrint, buildTestPayload, printCard } from './printer.js';
import type { PrintPayload } from '@meinungeheuer/shared';

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(argv: string[]): { text?: string; term?: string } {
  const result: { text?: string; term?: string } = {};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--text' && argv[i + 1] !== undefined) {
      result.text = argv[i + 1];
      i++;
    } else if (arg === '--term' && argv[i + 1] !== undefined) {
      result.term = argv[i + 1];
      i++;
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const config = loadConfig();

  console.log('[test-print] Configuration:');
  console.log(`  connection    : ${config.connection}`);
  console.log(`  maxWidthChars : ${config.maxWidthChars}`);
  console.log(`  maxWidthMm    : ${config.maxWidthMm}`);
  console.log(`  charset       : ${config.charset}`);
  console.log(`  autoCut       : ${config.autoCut}`);
  if (config.connection === 'network') {
    console.log(`  host          : ${config.host}:${config.port}`);
  }
  console.log('');

  const handle = createPrinter(config);

  if (args.text !== undefined || args.term !== undefined) {
    // Custom payload from CLI args
    const base = buildTestPayload();
    const payload: PrintPayload = {
      ...base,
      term: args.term ?? base.term,
      definition_text: args.text ?? base.definition_text,
    };
    await printCard(handle, payload);
  } else {
    // Default sample card
    await testPrint(handle);
  }
}

main().catch((err: unknown) => {
  console.error('[test-print] Error:', err);
  process.exit(1);
});
