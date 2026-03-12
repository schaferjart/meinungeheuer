import { describe, it, expect } from 'vitest';
import { extractConcepts } from './conceptExtractor';

describe('extractConcepts', () => {
  it('extracts meaningful nouns from English sentence', () => {
    const result = extractConcepts(
      'The creative process involves imagination and persistence through difficult challenges.'
    );
    const labels = result.concepts.map((c) => c.normalized);
    expect(labels).toContain('creative');
    expect(labels).toContain('process');
    expect(labels).toContain('involves');
    expect(labels).toContain('imagination');
    expect(labels).toContain('persistence');
    expect(labels).toContain('difficult');
    expect(labels).toContain('challenges');
  });

  it('extracts meaningful nouns from German sentence', () => {
    const result = extractConcepts(
      'Die Gedanken entstehen beim Reden und entwickeln sich durch Sprache.'
    );
    const labels = result.concepts.map((c) => c.normalized);
    expect(labels).toContain('gedanken');
    expect(labels).toContain('entstehen');
    expect(labels).toContain('reden');
    expect(labels).toContain('entwickeln');
    expect(labels).toContain('sprache');
  });

  it('filters English stopwords', () => {
    const result = extractConcepts('I think that the something is very good');
    const labels = result.concepts.map((c) => c.normalized);
    expect(labels).not.toContain('think');
    expect(labels).not.toContain('that');
    expect(labels).not.toContain('the');
    expect(labels).not.toContain('something');
    expect(labels).not.toContain('very');
    expect(labels).not.toContain('good');
  });

  it('filters German stopwords', () => {
    const result = extractConcepts('Ich denke dass dieses etwas ist und werden');
    const labels = result.concepts.map((c) => c.normalized);
    expect(labels).not.toContain('denke');
    expect(labels).not.toContain('dass');
    expect(labels).not.toContain('dieses');
    expect(labels).not.toContain('etwas');
    expect(labels).not.toContain('werden');
  });

  it('handles empty input gracefully', () => {
    expect(extractConcepts('').concepts).toEqual([]);
    expect(extractConcepts('   ').concepts).toEqual([]);
    expect(extractConcepts('').rawText).toBe('');
  });

  it('deduplicates concepts', () => {
    const result = extractConcepts(
      'Creativity sparks creativity. The word creativity appears three times.'
    );
    const labels = result.concepts.map((c) => c.normalized);
    const creativityCount = labels.filter((l) => l === 'creativity').length;
    expect(creativityCount).toBe(1);
  });

  it('ignores very short words (< 4 chars)', () => {
    const result = extractConcepts('art dog cat fly run');
    expect(result.concepts).toHaveLength(0);
  });

  it('preserves original display casing', () => {
    const result = extractConcepts('Imagination leads to Discovery');
    const imagination = result.concepts.find((c) => c.normalized === 'imagination');
    expect(imagination?.display).toBe('Imagination');
    const discovery = result.concepts.find((c) => c.normalized === 'discovery');
    expect(discovery?.display).toBe('Discovery');
  });

  it('strips punctuation from words', () => {
    const result = extractConcepts('philosophy, truth; existence!');
    const labels = result.concepts.map((c) => c.normalized);
    expect(labels).toContain('philosophy');
    expect(labels).toContain('truth');
    expect(labels).toContain('existence');
  });

  it('ignores pure numbers', () => {
    const result = extractConcepts('paragraph 1234 discussion 5678');
    const labels = result.concepts.map((c) => c.normalized);
    expect(labels).not.toContain('1234');
    expect(labels).not.toContain('5678');
    expect(labels).toContain('paragraph');
    expect(labels).toContain('discussion');
  });
});
