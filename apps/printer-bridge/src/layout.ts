/**
 * Card layout engine.
 *
 * Converts a PrintPayload into an array of text lines (formatCard) and into
 * a structured command list (formatCardForPrinter) that carries styling
 * metadata for the printer abstraction layer.
 *
 * All spacing is calculated dynamically from PrinterConfig.maxWidthChars so
 * the same code works for 58 mm (32 chars) and 80 mm (48 chars) paper.
 */

import type { PrintPayload } from '@meinungeheuer/shared';
import type { PrinterConfig } from './config.js';

// ─── Transliteration ─────────────────────────────────────────────────────────

const TRANSLITERATION_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
  // German quotation marks → ASCII equivalents
  '„': '"',
  '\u201C': '"',
  '\u2018': "'",
  '\u2019': "'",
  // Common typographic characters that may not be in codepage
  '\u2014': '--', // em dash
  '\u2013': '-',  // en dash
  '\u2026': '...', // ellipsis
  '\u2192': '->',  // right arrow (used in chain ref ↳)
  '\u21B3': '->',  // ↳
  '\u2500': '-',   // box drawing horizontal
};

export function transliterate(text: string): string {
  return text
    .split('')
    .map((ch) => TRANSLITERATION_MAP[ch] ?? ch)
    .join('');
}

function sanitize(text: string, charset: string): string {
  if (charset.toUpperCase() === 'UTF-8') return text;
  return transliterate(text);
}

// ─── Word wrapping ────────────────────────────────────────────────────────────

/**
 * Wraps text to fit within maxWidth characters.
 *
 * Rules:
 *  - Never break mid-word.
 *  - Split at hyphens inside long compound words if no other break is possible.
 *  - Returns an array of lines (no trailing newlines).
 */
export function wordWrap(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  // Normalise whitespace sequences to a single space
  const words = text.replace(/\s+/g, ' ').trim().split(' ');

  let currentLine = '';

  for (const word of words) {
    if (word === '') continue;

    // If the word alone exceeds maxWidth, split at hyphens or force-break
    if (word.length > maxWidth) {
      // First flush any existing current line
      if (currentLine !== '') {
        lines.push(currentLine);
        currentLine = '';
      }
      // Try splitting at hyphens (German compound words)
      const segments = splitLongWord(word, maxWidth);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg === undefined) continue;
        if (i < segments.length - 1) {
          lines.push(seg);
        } else {
          currentLine = seg;
        }
      }
      continue;
    }

    const candidate = currentLine === '' ? word : `${currentLine} ${word}`;
    if (candidate.length <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine !== '') lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine !== '') lines.push(currentLine);
  return lines;
}

/**
 * Splits a word that is longer than maxWidth at hyphens where possible,
 * otherwise hard-breaks it.
 */
function splitLongWord(word: string, maxWidth: number): string[] {
  const parts: string[] = [];
  // Break at hyphens first
  const hyphenParts = word.split('-');

  let buffer = '';
  for (let i = 0; i < hyphenParts.length; i++) {
    const part = hyphenParts[i];
    if (part === undefined) continue;
    const isLast = i === hyphenParts.length - 1;
    const segment = isLast ? part : `${part}-`;

    if (buffer === '') {
      if (segment.length <= maxWidth) {
        buffer = segment;
      } else {
        // Hard break within segment
        const chunks = hardBreak(segment, maxWidth);
        for (let j = 0; j < chunks.length - 1; j++) {
          const c = chunks[j];
          if (c !== undefined) parts.push(c);
        }
        buffer = chunks[chunks.length - 1] ?? '';
      }
    } else {
      const candidate = buffer + segment;
      if (candidate.length <= maxWidth) {
        buffer = candidate;
      } else {
        parts.push(buffer);
        if (segment.length <= maxWidth) {
          buffer = segment;
        } else {
          const chunks = hardBreak(segment, maxWidth);
          for (let j = 0; j < chunks.length - 1; j++) {
            const c = chunks[j];
            if (c !== undefined) parts.push(c);
          }
          buffer = chunks[chunks.length - 1] ?? '';
        }
      }
    }
  }

  if (buffer !== '') parts.push(buffer);
  return parts;
}

function hardBreak(text: string, maxWidth: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxWidth) {
    chunks.push(text.slice(i, i + maxWidth));
  }
  return chunks;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Centers a string within a field of width chars.
 * If text is wider than width it is returned as-is.
 */
export function center(text: string, width: number): string {
  if (text.length >= width) return text;
  const totalPad = width - text.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

/**
 * Returns a dashed divider line: "- - - - - -" that fills maxWidthChars.
 *
 * The pattern is "- " repeated, trimmed to width. We use simple ASCII dashes
 * so they are universally printable on any codepage.
 */
export function dividerLine(width: number): string {
  // Build "- - - - ..." until we have at least `width` chars, then slice
  const pattern = '- ';
  const repeated = pattern.repeat(Math.ceil(width / pattern.length));
  return repeated.slice(0, width);
}

/**
 * Builds the spaced-caps brand line: "M E I N U N G E H E U E R"
 * Centered on maxWidthChars.
 */
export function brandLine(width: number): string {
  const spaced = 'MEINUNGEHEUER'.split('').join(' ');
  return center(spaced, width);
}

/** Formats a Date-like ISO string to "DD.MM.YYYY — HH:MM" (German style). */
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year} \u2014 ${hours}:${minutes}`;
}

/** Formats a session number as a zero-padded 4-digit string, e.g. "#0047". */
export function formatSessionNumber(n: number): string {
  return `#${String(n).padStart(4, '0')}`;
}

// ─── PrintCommand types ───────────────────────────────────────────────────────

export type Alignment = 'left' | 'center' | 'right';

export interface PrintCommand {
  type:
    | 'empty_line'
    | 'text'
    | 'divider'
    | 'cut';
  text?: string;
  bold?: boolean;
  doubleHeight?: boolean;
  italic?: boolean;
  alignment?: Alignment;
}

export interface PrintCommands {
  commands: PrintCommand[];
}

// ─── Core layout builder ──────────────────────────────────────────────────────

/**
 * Internal builder that works with pre-sanitised strings and a concrete width.
 */
function buildCommands(
  payload: PrintPayload,
  width: number,
  charset: string,
  autoCut: boolean,
): PrintCommand[] {
  const s = (text: string) => sanitize(text, charset);
  const cmds: PrintCommand[] = [];

  const add = (cmd: PrintCommand) => cmds.push(cmd);
  const emptyLine = () => add({ type: 'empty_line' });
  const divider = () => add({ type: 'divider', text: dividerLine(width) });

  // ── Header ────────────────────────────────────────────────────────────────
  emptyLine();
  add({
    type: 'text',
    text: brandLine(width),
    alignment: 'center',
    bold: false,
  });
  emptyLine();
  divider();
  emptyLine();

  // ── Term ──────────────────────────────────────────────────────────────────
  add({
    type: 'text',
    text: s(payload.term.toUpperCase()),
    bold: true,
    doubleHeight: true,
    alignment: 'left',
  });
  emptyLine();

  // ── Definition text ───────────────────────────────────────────────────────
  const defLines = wordWrap(s(payload.definition_text), width);
  for (const line of defLines) {
    add({ type: 'text', text: line, alignment: 'left' });
  }
  emptyLine();
  divider();
  emptyLine();

  // ── Citations ─────────────────────────────────────────────────────────────
  const citations = payload.citations ?? [];
  if (citations.length > 0) {
    for (const citation of citations) {
      // Wrap citation in German quotation marks if not already quoted
      const quoted =
        citation.trimStart().startsWith('\u201E') ||
        citation.trimStart().startsWith('\u00AB') ||
        citation.trimStart().startsWith('"')
          ? s(citation)
          : `\u201E${s(citation)}\u201C`;

      const citLines = wordWrap(quoted, width);
      for (const line of citLines) {
        add({ type: 'text', text: line, italic: true, alignment: 'left' });
      }
      emptyLine();
    }
    divider();
    emptyLine();
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  add({
    type: 'text',
    text: s(formatTimestamp(payload.timestamp)),
    alignment: 'left',
  });
  add({
    type: 'text',
    text: formatSessionNumber(payload.session_number),
    alignment: 'left',
  });

  // Mode C chain reference
  if (payload.chain_ref !== null && payload.chain_ref !== undefined && payload.chain_ref !== '') {
    const chainText = s(`\u21B3 from ${payload.chain_ref}`);
    const chainLines = wordWrap(chainText, width);
    for (const line of chainLines) {
      add({ type: 'text', text: line, alignment: 'left' });
    }
  }

  emptyLine();

  if (autoCut) {
    add({ type: 'cut' });
  }

  return cmds;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a flat array of text lines suitable for console output or logging.
 * Style information (bold, italic) is dropped; only the text content is kept.
 */
export function formatCard(payload: PrintPayload, config: PrinterConfig): string[] {
  const cmds = buildCommands(
    payload,
    config.maxWidthChars,
    config.charset,
    false, // no '[CUT]' token in plain text mode
  );

  const lines: string[] = [];
  for (const cmd of cmds) {
    switch (cmd.type) {
      case 'empty_line':
        lines.push('');
        break;
      case 'divider':
        lines.push(cmd.text ?? dividerLine(config.maxWidthChars));
        break;
      case 'text':
        lines.push(cmd.text ?? '');
        break;
      case 'cut':
        lines.push('[CUT]');
        break;
    }
  }
  return lines;
}

/**
 * Returns structured print commands with full styling metadata.
 * Used by the printer abstraction layer to issue ESC/POS commands.
 */
export function formatCardForPrinter(
  payload: PrintPayload,
  config: PrinterConfig,
): PrintCommands {
  return {
    commands: buildCommands(
      payload,
      config.maxWidthChars,
      config.charset,
      config.autoCut,
    ),
  };
}
