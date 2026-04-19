/**
 * Printer — HTTP relay to POS thermal-printer server.
 *
 * Two flows:
 *   1. Text payloads (dictionary cards) → render via cloud print-renderer → send PNG to POS server
 *   2. Portrait payloads (pre-rendered images) → download from Supabase Storage → send to POS server
 */

import type { PrintPayload, PortraitPrintPayload } from '@denkfink/installation-core';

/**
 * Renders a text payload (dictionary card) via the cloud print-renderer,
 * then sends the resulting PNG to the POS server.
 *
 * Retries once on network error.
 */
export async function renderAndPrint(
  posServerUrl: string,
  rendererUrl: string,
  renderApiKey: string,
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

  // Step 1: Try cloud render-api, fall back to legacy POS server rendering
  let imageBlob: Blob | null = null;

  try {
    const renderBody = {
      word: payload.term,
      definition: payload.definition_text,
      citations: payload.citations,
      template: payload.template ?? 'helvetica',
      definition_id: payload.definition_id ?? null,
    };

    const renderHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (renderApiKey) {
      renderHeaders['X-Api-Key'] = renderApiKey;
    }

    const renderRes = await fetch(`${rendererUrl.replace(/\/+$/, '')}/render/dictionary`, {
      method: 'POST',
      headers: renderHeaders,
      body: JSON.stringify(renderBody),
      signal: AbortSignal.timeout(15_000),
    });

    if (!renderRes.ok) {
      throw new Error(`Render API ${renderRes.status}`);
    }

    imageBlob = await renderRes.blob();
  } catch (err) {
    console.warn(`[printer] Render API unavailable (${err instanceof Error ? err.message : err}), falling back to legacy POS rendering`);
  }

  if (imageBlob) {
    // New flow: send pre-rendered PNG to /print/image
    const printUrl = `${posServerUrl.replace(/\/+$/, '')}/print/image`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const form = new FormData();
        form.append('file', imageBlob, 'card.png');

        const printRes = await fetch(printUrl, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(10_000),
        });

        if (!printRes.ok) {
          const text = await printRes.text().catch(() => '');
          throw new Error(`POS server responded ${printRes.status}: ${text}`);
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
  } else {
    // Legacy fallback: send JSON to POS server's /print/dictionary (it renders text itself)
    const legacyUrl = `${posServerUrl.replace(/\/+$/, '')}/print/dictionary`;
    const legacyBody = {
      word: payload.term,
      definition: payload.definition_text,
      citations: payload.citations,
      template: payload.template ?? 'helvetica',
      timestamp: payload.timestamp,
      session_number: payload.session_number,
      chain_ref: payload.chain_ref,
      language: payload.language,
    };

    const res = await fetch(legacyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyBody),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Legacy POS server responded ${res.status}: ${text}`);
    }
  }
}

/**
 * Downloads pre-rendered portrait images from Supabase Storage,
 * sends them as a batch to POS server /print/batch.
 *
 * Retries once on network error.
 */
export async function printPortrait(
  posServerUrl: string,
  payload: PortraitPrintPayload,
): Promise<void> {
  if (!posServerUrl || posServerUrl === 'console') {
    console.log(`\n[portrait] Job ${payload.job_id}: ${payload.image_urls.length} zoom levels`);
    for (const img of payload.image_urls) {
      console.log(`  ${img.name}: ${img.url}`);
    }
    return;
  }

  // Download all images first
  const images: { name: string; blob: Blob }[] = [];
  for (const img of payload.image_urls) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`Failed to download ${img.name}: ${res.status}`);
    images.push({ name: img.name, blob: await res.blob() });
  }

  // Send all as batch (single cut at the end)
  const url = `${posServerUrl.replace(/\/+$/, '')}/print/batch`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const form = new FormData();
      for (const img of images) {
        form.append('files', img.blob, `${img.name}.png`);
      }

      const res = await fetch(url, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POS server responded ${res.status}: ${text}`);
      }

      console.log(`[portrait] Printed ${images.length} zoom levels for job ${payload.job_id}`);
      return;
    } catch (err) {
      if (attempt === 1) {
        console.warn(`[portrait] First attempt failed, retrying… (${err instanceof Error ? err.message : err})`);
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
    definition_id: '00000000-0000-0000-0000-000000000047',
  };
}
