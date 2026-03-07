import { describe, it, expect } from 'vitest';
import { stripMarkdownForTTS, parseMarkdownText } from './markdown.js';

// ---------------------------------------------------------------------------
// stripMarkdownForTTS
// ---------------------------------------------------------------------------

describe('stripMarkdownForTTS', () => {
  it('removes single-level header markers', () => {
    expect(stripMarkdownForTTS('# Title')).toBe('Title');
  });

  it('removes multi-level header markers', () => {
    expect(stripMarkdownForTTS('## Subtitle')).toBe('Subtitle');
    expect(stripMarkdownForTTS('### Deep')).toBe('Deep');
  });

  it('removes strikethrough markers', () => {
    expect(stripMarkdownForTTS('I ~~believe~~ think')).toBe('I believe think');
  });

  it('removes trailing double-space line break markers', () => {
    expect(stripMarkdownForTTS('line one  \nline two')).toBe('line one\nline two');
  });

  it('preserves normal text without markers', () => {
    const text = 'Just a normal sentence.';
    expect(stripMarkdownForTTS(text)).toBe(text);
  });

  it('handles combined markers', () => {
    const input = '# Heading\n~~struck~~ normal  ';
    const expected = 'Heading\nstruck normal';
    expect(stripMarkdownForTTS(input)).toBe(expected);
  });

  it('handles text with no markdown at all', () => {
    const text = 'Plain text\nwith newlines\nand nothing special.';
    expect(stripMarkdownForTTS(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// parseMarkdownText
// ---------------------------------------------------------------------------

describe('parseMarkdownText', () => {
  it('parses single line plain text', () => {
    const result = parseMarkdownText('hello world');
    expect(result).toHaveLength(1);
    expect(result[0].lines).toHaveLength(1);
    expect(result[0].lines[0].type).toBe('text');
    expect(result[0].lines[0].words).toHaveLength(2);
    expect(result[0].lines[0].words[0]).toEqual({ word: 'hello', strikethrough: false, globalIndex: 0 });
    expect(result[0].lines[0].words[1]).toEqual({ word: 'world', strikethrough: false, globalIndex: 1 });
  });

  it('splits multiple paragraphs on blank lines', () => {
    const result = parseMarkdownText('para one\n\npara two');
    expect(result).toHaveLength(2);
  });

  it('detects headers', () => {
    const result = parseMarkdownText('# My Title');
    expect(result[0].lines[0].type).toBe('header');
    // The `#` marker is stripped from word content
    expect(result[0].lines[0].words[0].word).toBe('My');
    expect(result[0].lines[0].words[1].word).toBe('Title');
  });

  it('detects list items', () => {
    const result = parseMarkdownText('1. First item');
    expect(result[0].lines[0].type).toBe('list-item');
  });

  it('marks strikethrough words', () => {
    const result = parseMarkdownText('I ~~believe~~ think');
    const words = result[0].lines[0].words;
    expect(words[0]).toEqual({ word: 'I', strikethrough: false, globalIndex: 0 });
    expect(words[1]).toEqual({ word: 'believe', strikethrough: true, globalIndex: 1 });
    expect(words[2]).toEqual({ word: 'think', strikethrough: false, globalIndex: 2 });
  });

  it('assigns sequential global indices across lines', () => {
    const result = parseMarkdownText('line one\nline two');
    const allWords = result.flatMap(p => p.lines.flatMap(l => l.words));
    expect(allWords.map(w => w.globalIndex)).toEqual([0, 1, 2, 3]);
  });

  it('assigns sequential global indices across paragraphs', () => {
    const result = parseMarkdownText('first\n\nsecond');
    const allWords = result.flatMap(p => p.lines.flatMap(l => l.words));
    expect(allWords.map(w => w.globalIndex)).toEqual([0, 1]);
  });

  it('skips empty paragraphs', () => {
    const result = parseMarkdownText('text\n\n\n\nmore text');
    expect(result).toHaveLength(2);
  });

  it('handles mixed content types', () => {
    const text = '# Title\n\nSome text.\n\n1. Item one\n2. Item two';
    const result = parseMarkdownText(text);
    expect(result).toHaveLength(3);
    expect(result[0].lines[0].type).toBe('header');
    expect(result[1].lines[0].type).toBe('text');
    expect(result[2].lines[0].type).toBe('list-item');
    expect(result[2].lines[1].type).toBe('list-item');
  });

  it('INVARIANT: globalIndex word order matches stripMarkdownForTTS word order', () => {
    // This is the critical invariant: the word at globalIndex N in parseMarkdownText
    // must be the same word as the Nth word in stripMarkdownForTTS output.
    const text = '# 2024-10-28, 2130h\n\nI ~~believe~~ think creativity is overrated.  \nIt is a ~~trap~~ tool.\n\n1. First point.\n2. Second point.';

    const stripped = stripMarkdownForTTS(text);
    const strippedWords = stripped.split(/\s+/).filter(Boolean);

    const parsed = parseMarkdownText(text);
    const parsedWords = parsed
      .flatMap(p => p.lines.flatMap(l => l.words))
      .sort((a, b) => a.globalIndex - b.globalIndex)
      .map(w => w.word);

    expect(parsedWords).toEqual(strippedWords);
  });
});
