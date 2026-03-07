/**
 * Tests for splitTextIntoChunks.
 *
 * Transferred from apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts
 * with import paths updated for the karaoke-reader package.
 */
import { describe, it, expect } from 'vitest';
import { splitTextIntoChunks } from './splitTextIntoChunks.js';

describe('splitTextIntoChunks', () => {
  it('returns single chunk for short text', () => {
    const text = 'This is a short sentence.';
    const chunks = splitTextIntoChunks(text, 200);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('does not split text under maxWordsPerChunk', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ') + '.';
    const chunks = splitTextIntoChunks(words, 200);

    expect(chunks).toHaveLength(1);
  });

  it('splits long text at sentence boundaries', () => {
    // Build text with 10 sentences, each ~25 words
    const sentences: string[] = [];
    for (let s = 0; s < 10; s++) {
      const sentenceWords = Array.from({ length: 25 }, (_, i) => `word${s}_${i}`);
      sentences.push(sentenceWords.join(' ') + '.');
    }
    const text = sentences.join(' ');
    const totalWords = text.split(/\s+/).filter(Boolean).length;

    // 250 words total, chunk at 100 words
    expect(totalWords).toBe(250);
    const chunks = splitTextIntoChunks(text, 100);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(4);

    // Verify no sentence was split mid-word
    for (const chunk of chunks) {
      // Each chunk should end with a period
      expect(chunk.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('returns text as-is if no sentence boundaries found', () => {
    const text = 'just a bunch of words with no sentence ending punctuation';
    const chunks = splitTextIntoChunks(text, 3);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('handles text with mixed punctuation', () => {
    const text = 'First sentence. Second sentence! Third sentence? Fourth sentence.';
    const chunks = splitTextIntoChunks(text, 3);

    // Each sentence is 2 words, so with maxWordsPerChunk=3, we get
    // at least 2 chunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('handles single sentence', () => {
    const text = 'This is just one single sentence.';
    const chunks = splitTextIntoChunks(text, 2);

    // Can't split within a sentence, so returns the whole sentence
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });
});
