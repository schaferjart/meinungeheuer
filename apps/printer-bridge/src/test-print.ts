/**
 * test-print.ts — CLI script for printing a sample card via print-renderer + POS server.
 *
 * Usage:
 *   pnpm run test-print
 *   pnpm run test-print --text "custom definition text"
 *   pnpm run test-print --term "BEISPIEL"
 */

import { loadConfig } from './config.js';
import { renderAndPrint, buildTestPayload } from './printer.js';
import type { PrintPayload } from '@denkfink/installation-core';

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const config = loadConfig();

  console.log('[test-print] Configuration:');
  console.log(`  POS server: ${config.posServerUrl || '(console mode)'}`);
  console.log(`  Print renderer: ${config.printRendererUrl}`);
  console.log('');

  const base = buildTestPayload();
  const payload: PrintPayload = {
    ...base,
    term: args.term ?? base.term,
    definition_text: args.text ?? base.definition_text,
  };

  await renderAndPrint(config.posServerUrl, config.printRendererUrl, config.renderApiKey, payload);
  console.log('[test-print] Done.');
}

main().catch((err: unknown) => {
  console.error('[test-print] Error:', err);
  process.exit(1);
});
