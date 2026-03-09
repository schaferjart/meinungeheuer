/**
 * Printer — thin HTTP relay to POS thermal-printer server.
 *
 * POSTs print jobs to the standalone POS server's /print/dictionary endpoint
 * instead of formatting ESC/POS directly.
 */

import type { PrintPayload } from '@meinungeheuer/shared';

/**
 * Posts a print job to the POS server. In console mode (empty URL or "console"),
 * logs the payload to stdout instead.
 *
 * Retries once on network error.
 */
export async function printCard(
  posServerUrl: string,
  payload: PrintPayload,
): Promise<void> {
  if (!posServerUrl || posServerUrl === 'console') {
    console.log('\n' + '='.repeat(48));
    console.log(`  ${payload.term}`);
    console.log('-'.repeat(48));
    console.log(payload.definition_text);
    if (payload.citations.length > 0) {
      console.log('');
      for (const c of payload.citations) {
        console.log(`  "${c}"`);
      }
    }
    console.log(`  #${payload.session_number} ${payload.chain_ref ?? ''}`);
    console.log('='.repeat(48) + '\n');
    return;
  }

  const body = {
    word: payload.term,
    definition: payload.definition_text,
    citations: payload.citations,
    language: payload.language,
    session_number: payload.session_number,
    chain_ref: payload.chain_ref,
    timestamp: payload.timestamp,
    template: payload.template ?? 'dictionary',
  };

  const url = `${posServerUrl.replace(/\/+$/, '')}/print/dictionary`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POS server responded ${res.status}: ${text}`);
      }

      return;
    } catch (err) {
      if (attempt === 1) {
        console.warn(`[printer] First attempt failed, retrying… (${err instanceof Error ? err.message : err})`);
        continue;
      }
      throw err;
    }
  }
}

/** Sample payload for test prints. */
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
