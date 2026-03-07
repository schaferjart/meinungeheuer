import type { ParsedParagraph, ParsedLine } from '../types.js';

/**
 * Strip markdown syntax for TTS. Produces the same word sequence
 * as the visual renderer (both skip `#` and `~~` markers).
 */
export function stripMarkdownForTTS(text: string): string {
  return text
    .replace(/^#+\s*/gm, '')   // header markers
    .replace(/~~/g, '')        // strikethrough markers
    .replace(/ {2,}$/gm, ''); // trailing double-space line break markers
}

/**
 * Parse a content string into words with inline strikethrough flags.
 * Splits on `~~` to detect strikethrough regions, then splits each
 * region into whitespace-delimited words.
 */
export function parseContentToWords(
  content: string,
): Array<{ word: string; strikethrough: boolean }> {
  const result: Array<{ word: string; strikethrough: boolean }> = [];
  const parts = content.split(/(~~)/);

  let inStrike = false;
  for (const part of parts) {
    if (part === '~~') {
      inStrike = !inStrike;
      continue;
    }
    const words = part.split(/\s+/).filter(Boolean);
    for (const word of words) {
      result.push({ word, strikethrough: inStrike });
    }
  }

  return result;
}

/**
 * Parse markdown text into paragraphs -> lines -> words.
 * Each word gets a globally sequential index that matches
 * the word sequence produced by `stripMarkdownForTTS`.
 */
export function parseMarkdownText(text: string): ParsedParagraph[] {
  const result: ParsedParagraph[] = [];
  let globalIdx = 0;

  // Split into paragraphs on blank lines (with optional whitespace)
  const rawParagraphs = text.split(/\n\s*\n/);

  for (const rawPara of rawParagraphs) {
    const rawLines = rawPara.split(/\n/).filter((l) => l.trim().length > 0);
    const lines: ParsedLine[] = [];

    for (const rawLine of rawLines) {
      // Strip trailing double-space line break markers
      const line = rawLine.replace(/ {2,}$/, '');

      // Detect line type
      const headerMatch = line.match(/^(#+)\s+(.*)/);
      if (headerMatch) {
        const contentWords = parseContentToWords(headerMatch[2]!);
        lines.push({
          type: 'header',
          words: contentWords.map((w) => ({ ...w, globalIndex: globalIdx++ })),
        });
        continue;
      }

      if (/^\d+\.\s/.test(line)) {
        const contentWords = parseContentToWords(line);
        lines.push({
          type: 'list-item',
          words: contentWords.map((w) => ({ ...w, globalIndex: globalIdx++ })),
        });
        continue;
      }

      const contentWords = parseContentToWords(line);
      lines.push({
        type: 'text',
        words: contentWords.map((w) => ({ ...w, globalIndex: globalIdx++ })),
      });
    }

    if (lines.length > 0) {
      result.push({ lines });
    }
  }

  return result;
}
