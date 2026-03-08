import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './systemPrompt';

describe('buildSystemPrompt', () => {
  describe('anti-ending guardrails', () => {
    it('includes CRITICAL CONSTRAINT in text_term mode', () => {
      const prompt = buildSystemPrompt('text_term', 'creativity', 'some text');
      expect(prompt).toContain('CRITICAL CONSTRAINT');
      expect(prompt).toContain('You do NOT have the ability to end this conversation');
      expect(prompt).toContain('save_definition');
    });

    it('includes CRITICAL CONSTRAINT in term_only mode', () => {
      const prompt = buildSystemPrompt('term_only', 'BIRD');
      expect(prompt).toContain('CRITICAL CONSTRAINT');
      expect(prompt).toContain('You do NOT have the ability to end this conversation');
    });

    it('includes CRITICAL CONSTRAINT in chain mode', () => {
      const prompt = buildSystemPrompt('chain', 'BIRD', 'previous def');
      expect(prompt).toContain('CRITICAL CONSTRAINT');
      expect(prompt).toContain('You do NOT have the ability to end this conversation');
    });

    it('states save_definition is the ONLY tool', () => {
      const prompt = buildSystemPrompt('text_term', 'test', 'text');
      expect(prompt).toContain('That is the ONLY tool you have');
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
});
