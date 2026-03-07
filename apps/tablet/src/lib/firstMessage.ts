import type { Mode } from '@meinungeheuer/shared';

/**
 * Build the first message the AI agent speaks to the visitor.
 *
 * This is injected into the ElevenLabs session via `overrides.agent.firstMessage`
 * at session start time. The agent speaks this message immediately on connect
 * before the visitor says anything.
 */
export function buildFirstMessage(
  mode: Mode,
  term: string,
  contextText?: string | null,
  language: string = 'de',
): string {
  const isGerman = language.startsWith('de');

  switch (mode) {
    case 'term_only':
      return isGerman
        ? `Was ist fur dich ${term}?`
        : `What is ${term} to you?`;

    case 'text_term':
      return isGerman
        ? `Du hast gerade einen Text gelesen. Was ist dir hängengeblieben?`
        : `You just read a text. What stayed with you?`;

    case 'chain': {
      const preview = extractPreview(contextText);
      return isGerman
        ? `Jemand vor dir hat geschrieben: "${preview}" — was denkst du daruber?`
        : `Someone before you wrote: "${preview}" — what do you think about that?`;
    }
  }
}

/**
 * Extract a short preview from the context text for the chain mode opening.
 * Takes roughly the first sentence or first 80 characters, whichever is shorter.
 */
function extractPreview(text?: string | null): string {
  if (!text) return '...';

  const trimmed = text.trim();

  // Try to find the first sentence boundary
  const sentenceEnd = trimmed.search(/[.!?]\s/);
  if (sentenceEnd !== -1 && sentenceEnd < 120) {
    return trimmed.slice(0, sentenceEnd + 1);
  }

  // Fall back to character limit with word boundary
  if (trimmed.length <= 80) return trimmed;

  const cutoff = trimmed.lastIndexOf(' ', 80);
  const end = cutoff > 40 ? cutoff : 80;
  return trimmed.slice(0, end) + '...';
}
