/**
 * Unit tests for the installation state machine reducer.
 *
 * We test the reducer function directly — no React rendering needed.
 */
import { describe, it, expect } from 'vitest';
import {
  installationReducer,
  INITIAL_STATE,
  type InstallationState,
  type InstallationAction,
} from './installationReducer';
import type { Mode, Definition } from '@meinungeheuer/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefinition(overrides: Partial<Definition> = {}): Definition {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    session_id: '00000000-0000-0000-0000-000000000002',
    term: 'BIRD',
    definition_text: 'A bird is a happy accident.',
    citations: ['everything that flies is basically refusing to stay'],
    language: 'en',
    chain_depth: 0,
    created_at: '2026-02-24T14:00:00+00:00',
    embedding: null,
    ...overrides,
  };
}

function advance(state: InstallationState, ...actions: InstallationAction[]): InstallationState {
  return actions.reduce((s, a) => installationReducer(s, a), state);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('installationReducer', () => {
  // --- SLEEP ---
  describe('SLEEP state', () => {
    it('starts in sleep state', () => {
      expect(INITIAL_STATE.screen).toBe('sleep');
    });

    it('WAKE transitions sleep → welcome', () => {
      const next = installationReducer(INITIAL_STATE, { type: 'WAKE' });
      expect(next.screen).toBe('welcome');
    });

    it('other actions are no-ops in sleep', () => {
      const actions: InstallationAction[] = [
        { type: 'TIMER_3S' },
        { type: 'READY' },
        { type: 'TIMER_2S' },
        { type: 'PRINT_DONE' },
        { type: 'TIMER_15S' },
        { type: 'FACE_LOST' },
      ];
      for (const action of actions) {
        const next = installationReducer(INITIAL_STATE, action);
        expect(next.screen).toBe('sleep');
      }
    });
  });

  // --- WELCOME ---
  describe('WELCOME state', () => {
    const welcome: InstallationState = { ...INITIAL_STATE, screen: 'welcome' };

    it('TIMER_3S with term_only → term_prompt', () => {
      const next = installationReducer(welcome, { type: 'TIMER_3S' });
      expect(next.screen).toBe('term_prompt');
    });

    it('TIMER_3S with text_term → text_display', () => {
      const s: InstallationState = { ...welcome, mode: 'text_term' as Mode };
      const next = installationReducer(s, { type: 'TIMER_3S' });
      expect(next.screen).toBe('text_display');
    });

    it('TIMER_3S with chain → text_display', () => {
      const s: InstallationState = { ...welcome, mode: 'chain' as Mode };
      const next = installationReducer(s, { type: 'TIMER_3S' });
      expect(next.screen).toBe('text_display');
    });

    it('WAKE is a no-op in welcome', () => {
      const next = installationReducer(welcome, { type: 'WAKE' });
      expect(next.screen).toBe('welcome');
    });
  });

  // --- TEXT_DISPLAY ---
  describe('TEXT_DISPLAY state', () => {
    const textDisplay: InstallationState = { ...INITIAL_STATE, screen: 'text_display', mode: 'text_term' };

    it('READY transitions text_display → term_prompt', () => {
      const next = installationReducer(textDisplay, { type: 'READY' });
      expect(next.screen).toBe('term_prompt');
    });

    it('TIMER_3S is a no-op in text_display', () => {
      const next = installationReducer(textDisplay, { type: 'TIMER_3S' });
      expect(next.screen).toBe('text_display');
    });
  });

  // --- TERM_PROMPT ---
  describe('TERM_PROMPT state', () => {
    const termPrompt: InstallationState = { ...INITIAL_STATE, screen: 'term_prompt' };

    it('TIMER_2S transitions term_prompt → conversation', () => {
      const next = installationReducer(termPrompt, { type: 'TIMER_2S' });
      expect(next.screen).toBe('conversation');
    });
  });

  // --- CONVERSATION ---
  describe('CONVERSATION state', () => {
    const conversation: InstallationState = { ...INITIAL_STATE, screen: 'conversation' };

    it('DEFINITION_RECEIVED transitions conversation → synthesizing and stores definition', () => {
      const def = makeDefinition();
      const next = installationReducer(conversation, { type: 'DEFINITION_RECEIVED', definition: def });
      expect(next.screen).toBe('synthesizing');
      expect(next.definition).toEqual(def);
    });

    it('TIMER_2S is a no-op in conversation', () => {
      const next = installationReducer(conversation, { type: 'TIMER_2S' });
      expect(next.screen).toBe('conversation');
    });
  });

  // --- SYNTHESIZING ---
  describe('SYNTHESIZING state', () => {
    const synthesizing: InstallationState = { ...INITIAL_STATE, screen: 'synthesizing', definition: makeDefinition() };

    it('DEFINITION_READY transitions synthesizing → definition', () => {
      const next = installationReducer(synthesizing, { type: 'DEFINITION_READY' });
      expect(next.screen).toBe('definition');
    });
  });

  // --- DEFINITION ---
  describe('DEFINITION state', () => {
    const definition: InstallationState = { ...INITIAL_STATE, screen: 'definition', definition: makeDefinition() };

    it('TIMER_10S transitions definition → printing', () => {
      const next = installationReducer(definition, { type: 'TIMER_10S' });
      expect(next.screen).toBe('printing');
    });
  });

  // --- PRINTING ---
  describe('PRINTING state', () => {
    const printing: InstallationState = { ...INITIAL_STATE, screen: 'printing' };

    it('PRINT_DONE transitions printing → farewell', () => {
      const next = installationReducer(printing, { type: 'PRINT_DONE' });
      expect(next.screen).toBe('farewell');
    });
  });

  // --- FAREWELL ---
  describe('FAREWELL state', () => {
    const farewell: InstallationState = { ...INITIAL_STATE, screen: 'farewell' };

    it('TIMER_15S transitions farewell → sleep (reset)', () => {
      const next = installationReducer(farewell, { type: 'TIMER_15S' });
      expect(next.screen).toBe('sleep');
    });

    it('FACE_LOST transitions farewell → sleep (reset)', () => {
      const next = installationReducer(farewell, { type: 'FACE_LOST' });
      expect(next.screen).toBe('sleep');
    });

    it('RESET returns to initial state from farewell', () => {
      const next = installationReducer(farewell, { type: 'RESET' });
      expect(next).toEqual(INITIAL_STATE);
    });
  });

  // --- Full Mode A flow ---
  describe('Full Mode A (text_term) flow', () => {
    it('traverses all 9 states', () => {
      const def = makeDefinition();
      const final = advance(
        { ...INITIAL_STATE, mode: 'text_term', contextText: 'Some text' },
        { type: 'WAKE' },
        { type: 'TIMER_3S' },
        { type: 'READY' },
        { type: 'TIMER_2S' },
        { type: 'DEFINITION_RECEIVED', definition: def },
        { type: 'DEFINITION_READY' },
        { type: 'TIMER_10S' },
        { type: 'PRINT_DONE' },
        { type: 'TIMER_15S' },
      );
      expect(final.screen).toBe('sleep');
      // After TIMER_15S full reset, definition is cleared
      expect(final.definition).toBeNull();
    });
  });

  // --- Full Mode B flow ---
  describe('Full Mode B (term_only) flow', () => {
    it('skips text_display', () => {
      const screens: string[] = [];
      let s: InstallationState = INITIAL_STATE;
      const actions: InstallationAction[] = [
        { type: 'WAKE' },
        { type: 'TIMER_3S' },   // should go to term_prompt, not text_display
        { type: 'TIMER_2S' },
      ];
      for (const action of actions) {
        s = installationReducer(s, action);
        screens.push(s.screen);
      }
      expect(screens).toEqual(['welcome', 'term_prompt', 'conversation']);
    });
  });

  // --- Config actions ---
  describe('Configuration actions', () => {
    it('SET_CONFIG updates mode, term, contextText, parentSessionId', () => {
      const next = installationReducer(INITIAL_STATE, {
        type: 'SET_CONFIG',
        mode: 'chain',
        term: 'SPRECHEN',
        contextText: 'A bird is a happy accident.',
        parentSessionId: '00000000-0000-0000-0000-000000000099',
      });
      expect(next.mode).toBe('chain');
      expect(next.term).toBe('SPRECHEN');
      expect(next.contextText).toBe('A bird is a happy accident.');
      expect(next.parentSessionId).toBe('00000000-0000-0000-0000-000000000099');
      expect(next.screen).toBe('sleep'); // screen unchanged
    });

    it('SET_SESSION_ID updates sessionId', () => {
      const id = '00000000-0000-0000-0000-000000000042';
      const next = installationReducer(INITIAL_STATE, { type: 'SET_SESSION_ID', id });
      expect(next.sessionId).toBe(id);
    });

    it('SET_LANGUAGE updates language', () => {
      const next = installationReducer(INITIAL_STATE, { type: 'SET_LANGUAGE', lang: 'en' });
      expect(next.language).toBe('en');
    });

    it('RESET returns to INITIAL_STATE regardless of current state', () => {
      const dirty: InstallationState = {
        screen: 'printing',
        mode: 'chain',
        term: 'SPRECHEN',
        contextText: 'Some text',
        parentSessionId: '00000000-0000-0000-0000-000000000099',
        sessionId: '00000000-0000-0000-0000-000000000001',
        definition: makeDefinition(),
        conversationId: 'conv-123',
        language: 'en',
      };
      const next = installationReducer(dirty, { type: 'RESET' });
      expect(next).toEqual(INITIAL_STATE);
    });
  });

  // --- Guard: actions don't bleed across states ---
  describe('State guards prevent invalid transitions', () => {
    it('DEFINITION_RECEIVED is ignored outside conversation', () => {
      const def = makeDefinition();
      const inSleep = installationReducer(INITIAL_STATE, { type: 'DEFINITION_RECEIVED', definition: def });
      expect(inSleep.screen).toBe('sleep');
      expect(inSleep.definition).toBeNull();
    });

    it('PRINT_DONE is ignored outside printing', () => {
      const inWelcome: InstallationState = { ...INITIAL_STATE, screen: 'welcome' };
      const next = installationReducer(inWelcome, { type: 'PRINT_DONE' });
      expect(next.screen).toBe('welcome');
    });

    it('FACE_LOST is ignored outside farewell', () => {
      const inConversation: InstallationState = { ...INITIAL_STATE, screen: 'conversation' };
      const next = installationReducer(inConversation, { type: 'FACE_LOST' });
      expect(next.screen).toBe('conversation');
    });
  });
});
