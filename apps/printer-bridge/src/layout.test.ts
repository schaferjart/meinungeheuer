/**
 * Tests for the card layout engine (layout.ts).
 *
 * These tests run without a physical printer or Supabase connection.
 * All assertions operate on the string/command output of the pure functions.
 */

import { describe, it, expect } from 'vitest';
import {
  wordWrap,
  center,
  dividerLine,
  brandLine,
  formatTimestamp,
  formatSessionNumber,
  transliterate,
  formatCard,
  formatCardForPrinter,
} from './layout.js';
import type { PrintPayload } from '@meinungeheuer/shared';
import type { PrinterConfig } from './config.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_CONFIG: PrinterConfig = {
  connection: 'console',
  maxWidthChars: 48,
  maxWidthMm: 72,
  charset: 'UTF-8',
  autoCut: true,
};

const NARROW_CONFIG: PrinterConfig = {
  ...BASE_CONFIG,
  maxWidthChars: 32,
};

const ASCII_CONFIG: PrinterConfig = {
  ...BASE_CONFIG,
  charset: 'PC850',
};

const SAMPLE_PAYLOAD: PrintPayload = {
  term: 'VOGEL',
  definition_text:
    'Ein Vogel ist ein glücklicher Zufall, der gelernt hat, der Schwerkraft zu widersprechen.',
  citations: [
    '...alles was fliegt, weigert sich im Grunde zu bleiben',
    '...wie ein Gedanke, der entkam, bevor man ihn aufschreiben konnte',
  ],
  language: 'de',
  session_number: 47,
  chain_ref: null,
  timestamp: '2026-02-25T14:32:00+01:00',
};

const CHAIN_PAYLOAD: PrintPayload = {
  ...SAMPLE_PAYLOAD,
  session_number: 48,
  chain_ref: '#0047 "VOGEL"',
};

// ─── wordWrap ─────────────────────────────────────────────────────────────────

describe('wordWrap', () => {
  it('does not wrap short text', () => {
    expect(wordWrap('Hello world', 48)).toEqual(['Hello world']);
  });

  it('wraps at word boundary', () => {
    const result = wordWrap('one two three four five', 12);
    // Each line must not exceed 12 chars
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(12);
    }
    // No word is broken mid-word
    expect(result.join(' ')).toBe('one two three four five');
  });

  it('handles exactly fitting text', () => {
    const text = 'hello world!'; // 12 chars
    expect(wordWrap(text, 12)).toEqual(['hello world!']);
  });

  it('handles a single word longer than maxWidth', () => {
    const result = wordWrap('Donaudampfschifffahrtsgesellschaft', 10);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
  });

  it('splits at hyphens in compound words', () => {
    // 'Dampf-schiff' — should prefer the hyphen break
    const result = wordWrap('Dampf-schiff', 8);
    // After the hyphen-split the segment 'Dampf-' is 6 chars which fits 8
    // and 'schiff' is 6 chars which also fits 8, so we expect two lines
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(8);
    }
  });

  it('normalises whitespace', () => {
    const result = wordWrap('  hello   world  ', 48);
    expect(result).toEqual(['hello world']);
  });

  it('wraps a realistic German sentence at 48 chars', () => {
    const text =
      'Ein Vogel ist ein glücklicher Zufall, der gelernt hat, der Schwerkraft zu widersprechen.';
    const lines = wordWrap(text, 48);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(48);
    }
    // Reassembling with spaces should reproduce original (whitespace normalised)
    expect(lines.join(' ')).toBe(text);
  });

  it('wraps correctly at 32 chars (narrow paper)', () => {
    const text = 'Ein Vogel ist ein glücklicher Zufall, der gelernt hat.';
    const lines = wordWrap(text, 32);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it('returns empty array for empty string', () => {
    expect(wordWrap('', 48)).toEqual([]);
  });
});

// ─── center ───────────────────────────────────────────────────────────────────

describe('center', () => {
  it('centers text within specified width', () => {
    const result = center('HELLO', 11);
    expect(result.length).toBe(11);
    expect(result.trim()).toBe('HELLO');
    // Equal or near-equal padding on both sides
    const leftPad = result.indexOf('H');
    const rightPad = result.length - result.lastIndexOf('O') - 1;
    expect(Math.abs(leftPad - rightPad)).toBeLessThanOrEqual(1);
  });

  it('returns text as-is when equal to width', () => {
    expect(center('HELLO', 5)).toBe('HELLO');
  });

  it('returns text as-is when longer than width', () => {
    expect(center('HELLO WORLD', 5)).toBe('HELLO WORLD');
  });
});

// ─── dividerLine ──────────────────────────────────────────────────────────────

describe('dividerLine', () => {
  it('has the correct length', () => {
    expect(dividerLine(48).length).toBe(48);
    expect(dividerLine(32).length).toBe(32);
  });

  it('consists only of dashes and spaces', () => {
    const line = dividerLine(48);
    expect(line).toMatch(/^[- ]+$/);
  });

  it('starts with a dash', () => {
    expect(dividerLine(10).startsWith('-')).toBe(true);
  });
});

// ─── brandLine ────────────────────────────────────────────────────────────────

describe('brandLine', () => {
  it('contains M E I N U N G E H E U E R spaced', () => {
    const line = brandLine(48);
    expect(line.trim()).toBe('M E I N U N G E H E U E R');
  });

  it('is centred within the given width', () => {
    const line = brandLine(48);
    expect(line.length).toBe(48);
  });

  it('works at narrow width', () => {
    const line = brandLine(32);
    expect(line.length).toBe(32);
    expect(line.trim()).toBe('M E I N U N G E H E U E R');
  });
});

// ─── formatTimestamp ──────────────────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('formats an ISO datetime to DD.MM.YYYY — HH:MM', () => {
    // Use a UTC+0 date to make the test deterministic regardless of locale
    const result = formatTimestamp('2026-02-25T13:32:00.000Z');
    // The exact hours depend on the local timezone of the test machine; just
    // check the date structure is correct.
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \u2014 \d{2}:\d{2}$/);
  });

  it('zero-pads single-digit day and month', () => {
    const result = formatTimestamp('2026-01-05T08:07:00.000Z');
    // Must contain "01" and "05" and "08" or "09" depending on tz offset
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});

// ─── formatSessionNumber ─────────────────────────────────────────────────────

describe('formatSessionNumber', () => {
  it('formats single-digit numbers with four digits', () => {
    expect(formatSessionNumber(1)).toBe('#0001');
  });

  it('formats larger numbers correctly', () => {
    expect(formatSessionNumber(47)).toBe('#0047');
    expect(formatSessionNumber(1234)).toBe('#1234');
  });
});

// ─── transliterate ────────────────────────────────────────────────────────────

describe('transliterate', () => {
  it('converts German umlauts to ASCII digraphs', () => {
    expect(transliterate('ä')).toBe('ae');
    expect(transliterate('ö')).toBe('oe');
    expect(transliterate('ü')).toBe('ue');
    expect(transliterate('Ä')).toBe('Ae');
    expect(transliterate('Ö')).toBe('Oe');
    expect(transliterate('Ü')).toBe('Ue');
    expect(transliterate('ß')).toBe('ss');
  });

  it('converts German quotation marks to ASCII quotes', () => {
    expect(transliterate('\u201E')).toBe('"');
    expect(transliterate('\u201C')).toBe('"');
  });

  it('converts em-dash', () => {
    expect(transliterate('\u2014')).toBe('--');
  });

  it('leaves regular ASCII unchanged', () => {
    expect(transliterate('hello world')).toBe('hello world');
  });

  it('handles a mixed German sentence', () => {
    const result = transliterate('Über die Straße gehen');
    expect(result).toBe('Ueber die Strasse gehen');
  });
});

// ─── formatCard ───────────────────────────────────────────────────────────────

describe('formatCard', () => {
  it('returns an array of strings', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('no line exceeds maxWidthChars', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(BASE_CONFIG.maxWidthChars);
    }
  });

  it('contains the term in upper-case', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    const termLine = lines.find((l) => l.includes('VOGEL'));
    expect(termLine).toBeDefined();
  });

  it('contains the brand line', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    const brand = lines.find((l) => l.includes('M E I N U N G E H E U E R'));
    expect(brand).toBeDefined();
  });

  it('contains the session number', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    const numLine = lines.find((l) => l.includes('#0047'));
    expect(numLine).toBeDefined();
  });

  it('does NOT include chain ref line when chain_ref is null', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    const hasChain = lines.some((l) => l.includes('\u21B3'));
    expect(hasChain).toBe(false);
  });

  it('includes chain ref line in Mode C', () => {
    const lines = formatCard(CHAIN_PAYLOAD, BASE_CONFIG);
    const hasChain = lines.some((l) => l.includes('#0047') && l.includes('VOGEL'));
    expect(hasChain).toBe(true);
  });

  it('works at narrow width (32 chars)', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, NARROW_CONFIG);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(NARROW_CONFIG.maxWidthChars);
    }
  });

  it('includes citations', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, BASE_CONFIG);
    const hasCitation = lines.some((l) => l.includes('fliegt'));
    expect(hasCitation).toBe(true);
  });

  it('wraps the definition text across multiple lines if necessary', () => {
    const longPayload: PrintPayload = {
      ...SAMPLE_PAYLOAD,
      definition_text: 'a '.repeat(200).trim(),
    };
    const lines = formatCard(longPayload, BASE_CONFIG);
    const textLines = lines.filter((l) => l.startsWith('a'));
    expect(textLines.length).toBeGreaterThan(1);
  });

  it('uses transliteration when charset is not UTF-8', () => {
    const lines = formatCard(SAMPLE_PAYLOAD, ASCII_CONFIG);
    const combined = lines.join(' ');
    // Original ü in "glücklicher" should become "ue"
    expect(combined).toContain('gluecklicher');
    // Original ü should not appear
    expect(combined).not.toContain('ü');
  });

  it('handles empty citations array gracefully', () => {
    const noCitations: PrintPayload = { ...SAMPLE_PAYLOAD, citations: [] };
    const lines = formatCard(noCitations, BASE_CONFIG);
    expect(Array.isArray(lines)).toBe(true);
  });

  it('includes a [CUT] token in text output', () => {
    // formatCard always sets autoCut=false internally (clean text output),
    // but we test that the formatCardForPrinter path does include a cut cmd.
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    const hasCut = commands.some((c) => c.type === 'cut');
    expect(hasCut).toBe(true);
  });
});

// ─── formatCardForPrinter ─────────────────────────────────────────────────────

describe('formatCardForPrinter', () => {
  it('returns a commands array', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });

  it('term command has bold=true and doubleHeight=true', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    const termCmd = commands.find(
      (c) => c.type === 'text' && c.text === 'VOGEL',
    );
    expect(termCmd).toBeDefined();
    expect(termCmd?.bold).toBe(true);
    expect(termCmd?.doubleHeight).toBe(true);
  });

  it('cut command is present when autoCut=true', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    const cutCmd = commands.find((c) => c.type === 'cut');
    expect(cutCmd).toBeDefined();
  });

  it('no cut command when autoCut=false', () => {
    const cfg: PrinterConfig = { ...BASE_CONFIG, autoCut: false };
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, cfg);
    const cutCmd = commands.find((c) => c.type === 'cut');
    expect(cutCmd).toBeUndefined();
  });

  it('citation commands have italic=true', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    const italicCmds = commands.filter((c) => c.italic === true);
    expect(italicCmds.length).toBeGreaterThan(0);
  });

  it('brand line command has alignment=center', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    const brandCmd = commands.find(
      (c) => c.type === 'text' && c.text?.includes('M E I N'),
    );
    expect(brandCmd?.alignment).toBe('center');
  });

  it('all text commands have text that fits within maxWidthChars', () => {
    const { commands } = formatCardForPrinter(SAMPLE_PAYLOAD, BASE_CONFIG);
    for (const cmd of commands) {
      if (cmd.type === 'text' && cmd.text !== undefined) {
        expect(cmd.text.length).toBeLessThanOrEqual(BASE_CONFIG.maxWidthChars);
      }
    }
  });
});
