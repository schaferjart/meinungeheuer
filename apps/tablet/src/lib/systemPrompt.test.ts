import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './systemPrompt';

describe('buildSystemPrompt', () => {
  describe('conversation ending guardrails', () => {
    it('includes KNOWING WHEN TO STOP in text_term mode', () => {
      const prompt = buildSystemPrompt('text_term', 'creativity', 'some text');
      expect(prompt).toContain('KNOWING WHEN TO STOP');
      expect(prompt).toContain('save_definition');
    });

    it('includes KNOWING WHEN TO STOP in term_only mode', () => {
      const prompt = buildSystemPrompt('term_only', 'BIRD');
      expect(prompt).toContain('KNOWING WHEN TO STOP');
      expect(prompt).toContain('CRYSTALLIZED');
    });

    it('includes KNOWING WHEN TO STOP in chain mode', () => {
      const prompt = buildSystemPrompt('chain', 'BIRD', 'previous def');
      expect(prompt).toContain('KNOWING WHEN TO STOP');
      expect(prompt).toContain('CRYSTALLIZED');
    });

    it('instructs to stop after 10+ exchanges without crystallization', () => {
      const prompt = buildSystemPrompt('text_term', 'test', 'text');
      expect(prompt).toContain('10+ exchanges without crystallization');
    });
  });

  describe('mode-specific content', () => {
    it('text_term prompt includes context text', () => {
      const prompt = buildSystemPrompt('text_term', 'creativity', 'My sample text');
      expect(prompt).toContain('My sample text');
    });

    it('term_only prompt includes the term', () => {
      const prompt = buildSystemPrompt('term_only', 'FREEDOM');
      expect(prompt).toContain('FREEDOM');
    });

    it('chain prompt includes previous visitor text', () => {
      const prompt = buildSystemPrompt('chain', 'TRUTH', 'A previous definition');
      expect(prompt).toContain('A previous definition');
    });
  });

  describe('citation improvements (R8)', () => {
    it('numbers paragraphs in text_term context text', () => {
      const prompt = buildSystemPrompt('text_term', 'test', 'First para\n\nSecond para');
      expect(prompt).toContain('[1] First para');
      expect(prompt).toContain('[2] Second para');
    });

    it('handles single paragraph', () => {
      const prompt = buildSystemPrompt('text_term', 'test', 'Just one paragraph');
      expect(prompt).toContain('[1] Just one paragraph');
    });

    it('QUOTE move references paragraph numbers', () => {
      const prompt = buildSystemPrompt('text_term', 'test', 'some text');
      expect(prompt).toMatch(/QUOTE.*paragraph/is);
    });

    it('includes TEXT ENGAGEMENT requirement', () => {
      const prompt = buildSystemPrompt('text_term', 'test', 'some text');
      expect(prompt).toContain('TEXT ENGAGEMENT');
      expect(prompt).toMatch(/at least 2 specific paragraphs/i);
    });

    it('does NOT add paragraph numbers to term_only mode', () => {
      const prompt = buildSystemPrompt('term_only', 'BIRD');
      expect(prompt).not.toContain('[1]');
      expect(prompt).not.toContain('TEXT ENGAGEMENT');
    });

    it('does NOT add paragraph numbers to chain mode', () => {
      const prompt = buildSystemPrompt('chain', 'TRUTH', 'A previous definition');
      expect(prompt).not.toContain('[1]');
      expect(prompt).not.toContain('TEXT ENGAGEMENT');
    });
  });
});
