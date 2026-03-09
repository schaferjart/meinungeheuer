import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProgram, listPrograms, DEFAULT_PROGRAM } from './index.js';
import { aphorismProgram } from './aphorism.js';

describe('program registry', () => {
  describe('getProgram', () => {
    it('returns the aphorism program for id "aphorism"', () => {
      const program = getProgram('aphorism');
      expect(program.id).toBe('aphorism');
      expect(program.stages.textReading).toBe(true);
      expect(program.stages.portrait).toBe(true);
    });

    it('returns the free_association program for id "free_association"', () => {
      const program = getProgram('free_association');
      expect(program.id).toBe('free_association');
      expect(program.stages.textReading).toBe(false);
      expect(program.stages.portrait).toBe(false);
    });

    it('falls back to aphorism for unknown id and logs warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const program = getProgram('nonexistent');
      expect(program.id).toBe('aphorism');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('nonexistent'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('listPrograms', () => {
    it('returns array of length 2', () => {
      const programs = listPrograms();
      expect(programs).toHaveLength(2);
    });
  });

  describe('DEFAULT_PROGRAM', () => {
    it('is "aphorism"', () => {
      expect(DEFAULT_PROGRAM).toBe('aphorism');
    });
  });

  describe('aphorism program', () => {
    it('builds system prompt with paragraph-numbered context text', () => {
      const prompt = aphorismProgram.buildSystemPrompt({
        term: 'test',
        contextText: 'First para\n\nSecond para',
        language: 'de',
      });
      expect(prompt).toContain('[1] First para');
      expect(prompt).toContain('[2] Second para');
      expect(prompt).toContain('CRITICAL CONSTRAINT');
      expect(prompt).toContain('save_definition');
    });

    it('builds German first message for language "de"', () => {
      const msg = aphorismProgram.buildFirstMessage({
        term: 'test',
        contextText: null,
        language: 'de',
      });
      expect(msg).toContain('Text');
      expect(msg).toMatch(/hängengeblieben|gelesen/);
    });

    it('builds English first message for language "en"', () => {
      const msg = aphorismProgram.buildFirstMessage({
        term: 'test',
        contextText: null,
        language: 'en',
      });
      expect(msg).toContain('text');
      expect(msg).toContain('stayed');
    });

    it('has correct stage config', () => {
      expect(aphorismProgram.stages).toEqual({
        textReading: true,
        termPrompt: false,
        portrait: true,
        printing: true,
      });
    });

    it('has sessionMode text_term', () => {
      expect(aphorismProgram.sessionMode).toBe('text_term');
    });
  });
});
