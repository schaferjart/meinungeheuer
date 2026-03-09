import { describe, it, expect, vi } from 'vitest';
import { getProgram, listPrograms, DEFAULT_PROGRAM } from './index.js';
import { aphorismProgram } from './aphorism.js';
import { PrintPayloadSchema, InstallationConfigSchema } from '../types.js';

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

  describe('shared type updates', () => {
    it('PrintPayloadSchema validates with optional template field', () => {
      const base = {
        term: 'test',
        definition_text: 'A definition',
        citations: ['quote1'],
        language: 'de',
        session_number: 1,
        chain_ref: null,
        timestamp: '2026-03-09T12:00:00Z',
      };

      // Without template
      const result1 = PrintPayloadSchema.safeParse(base);
      expect(result1.success).toBe(true);

      // With template
      const result2 = PrintPayloadSchema.safeParse({
        ...base,
        template: 'dictionary_portrait',
      });
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data.template).toBe('dictionary_portrait');
      }
    });

    it('InstallationConfigSchema validates with program field defaulting to "aphorism"', () => {
      const config = {
        id: '00000000-0000-0000-0000-000000000001',
        mode: 'text_term',
        active_term: null,
        active_text_id: null,
        updated_at: '2026-03-09T12:00:00Z',
      };

      // Without program — should default to 'aphorism'
      const result1 = InstallationConfigSchema.safeParse(config);
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.data.program).toBe('aphorism');
      }

      // With explicit program
      const result2 = InstallationConfigSchema.safeParse({
        ...config,
        program: 'free_association',
      });
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data.program).toBe('free_association');
      }
    });
  });
});
