import { describe, it, expect } from 'vitest';
import { APP_NAME } from '../constants.js';
import { freeAssociationProgram } from './free-association.js';

describe('free_association program', () => {
  it('has id "free_association"', () => {
    expect(freeAssociationProgram.id).toBe('free_association');
  });

  it('skips textReading, termPrompt, and portrait stages', () => {
    expect(freeAssociationProgram.stages).toEqual({
      textReading: false,
      termPrompt: false,
      portrait: false,
      printing: true,
    });
  });

  it('builds system prompt mentioning the installation brand name', () => {
    const prompt = freeAssociationProgram.buildSystemPrompt({
      term: 'test',
      contextText: null,
      language: 'de',
    });
    expect(prompt).toContain(APP_NAME);
  });

  it('builds German first message for language "de"', () => {
    const msg = freeAssociationProgram.buildFirstMessage({
      term: 'test',
      contextText: null,
      language: 'de',
    });
    // Should be German text
    expect(msg).not.toBe('');
    expect(typeof msg).toBe('string');
    // German check — should not be English
    expect(msg).toMatch(/[äöüß]|Was|Kopf|Gedanken/i);
  });

  it('builds English first message for language "en"', () => {
    const msg = freeAssociationProgram.buildFirstMessage({
      term: 'test',
      contextText: null,
      language: 'en',
    });
    expect(msg).toMatch(/mind|think|What/i);
  });

  it('has sessionMode term_only', () => {
    expect(freeAssociationProgram.sessionMode).toBe('term_only');
  });

  it('has printLayout dictionary', () => {
    expect(freeAssociationProgram.printLayout).toBe('dictionary');
  });
});
