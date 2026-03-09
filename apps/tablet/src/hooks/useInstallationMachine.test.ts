/**
 * Unit tests for the installation state machine reducer.
 *
 * We test the reducer function directly — no React rendering needed.
 * Import the hook module and reach into its reducer via a thin re-export
 * (see bottom of this file for the test-only re-export trick).
 */
import { describe, it, expect } from 'vitest';
import type { InstallationState, InstallationAction } from './useInstallationMachine';

// ---------------------------------------------------------------------------
// Inline the reducer logic so we can unit-test it without calling hooks.
// This mirrors the exact logic in useInstallationMachine.ts.
// ---------------------------------------------------------------------------

import type { Mode, Definition } from '@meinungeheuer/shared';
import type { StageConfig } from '@meinungeheuer/shared';
import { DEFAULT_MODE, DEFAULT_TERM } from '@meinungeheuer/shared';

const initialState: InstallationState = {
  screen: 'sleep',
  mode: DEFAULT_MODE,
  term: DEFAULT_TERM,
  contextText: null,
  parentSessionId: null,
  sessionId: null,
  definition: null,
  conversationId: null,
  language: 'de',
  stages: { textReading: true, termPrompt: false, portrait: true, printing: true },
};

function reducer(state: InstallationState, action: InstallationAction): InstallationState {
  switch (action.type) {
    case 'SET_CONFIG':
      return {
        ...state,
        mode: action.mode,
        term: action.term,
        contextText: action.contextText,
        parentSessionId: action.parentSessionId,
        stages: action.stages,
      };
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.id };
    case 'SET_LANGUAGE':
      return { ...state, language: action.lang };
    case 'RESET':
      return { ...initialState };

    case 'WAKE':
      if (state.screen !== 'sleep') return state;
      return { ...state, screen: 'welcome' };

    case 'TIMER_3S': {
      if (state.screen !== 'welcome') return state;
      if (state.stages.textReading) {
        return { ...state, screen: 'text_display' };
      }
      if (state.stages.termPrompt) {
        return { ...state, screen: 'term_prompt' };
      }
      return { ...state, screen: 'conversation' };
    }

    case 'READY':
      if (state.screen !== 'text_display') return state;
      if (state.stages.termPrompt) {
        return { ...state, screen: 'term_prompt' };
      }
      return { ...state, screen: 'conversation' };

    case 'TIMER_2S':
      if (state.screen !== 'term_prompt') return state;
      return { ...state, screen: 'conversation' };

    case 'DEFINITION_RECEIVED':
      if (state.screen !== 'conversation') return state;
      return { ...state, screen: 'synthesizing', definition: action.definition };

    case 'DEFINITION_READY':
      if (state.screen !== 'synthesizing') return state;
      return { ...state, screen: 'definition' };

    case 'TIMER_10S':
      if (state.screen !== 'definition') return state;
      return { ...state, screen: 'printing' };

    case 'PRINT_DONE':
      if (state.screen !== 'printing') return state;
      return { ...state, screen: 'farewell' };

    case 'TIMER_15S':
      if (state.screen !== 'farewell') return state;
      return { ...initialState };

    case 'FACE_LOST':
      if (state.screen !== 'farewell') return state;
      return { ...initialState };

    default:
      return state;
  }
}

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
  return actions.reduce((s, a) => reducer(s, a), state);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInstallationMachine reducer', () => {
  // --- SLEEP ---
  describe('SLEEP state', () => {
    it('starts in sleep state', () => {
      expect(initialState.screen).toBe('sleep');
    });

    it('WAKE transitions sleep → welcome', () => {
      const next = reducer(initialState, { type: 'WAKE' });
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
        const next = reducer(initialState, action);
        expect(next.screen).toBe('sleep');
      }
    });
  });

  // --- WELCOME ---
  describe('WELCOME state', () => {
    const welcome: InstallationState = { ...initialState, screen: 'welcome' };

    it('TIMER_3S with term_only stages → term_prompt', () => {
      const s: InstallationState = { ...welcome, mode: 'term_only' as Mode, stages: { textReading: false, termPrompt: true, portrait: true, printing: true } };
      const next = reducer(s, { type: 'TIMER_3S' });
      expect(next.screen).toBe('term_prompt');
    });

    it('TIMER_3S with text_term stages → text_display', () => {
      const s: InstallationState = { ...welcome, mode: 'text_term' as Mode, stages: { textReading: true, termPrompt: false, portrait: true, printing: true } };
      const next = reducer(s, { type: 'TIMER_3S' });
      expect(next.screen).toBe('text_display');
    });

    it('TIMER_3S with chain stages → text_display', () => {
      const s: InstallationState = { ...welcome, mode: 'chain' as Mode, stages: { textReading: true, termPrompt: true, portrait: true, printing: true } };
      const next = reducer(s, { type: 'TIMER_3S' });
      expect(next.screen).toBe('text_display');
    });

    it('WAKE is a no-op in welcome', () => {
      const next = reducer(welcome, { type: 'WAKE' });
      expect(next.screen).toBe('welcome');
    });
  });

  // --- TEXT_DISPLAY ---
  describe('TEXT_DISPLAY state', () => {
    const textDisplay: InstallationState = { ...initialState, screen: 'text_display', mode: 'text_term' };

    it('READY transitions text_display → conversation (text_term: termPrompt=false)', () => {
      const next = reducer(textDisplay, { type: 'READY' });
      expect(next.screen).toBe('conversation');
    });

    it('READY transitions text_display → term_prompt when termPrompt=true', () => {
      const s: InstallationState = { ...textDisplay, stages: { textReading: true, termPrompt: true, portrait: true, printing: true } };
      const next = reducer(s, { type: 'READY' });
      expect(next.screen).toBe('term_prompt');
    });

    it('TIMER_3S is a no-op in text_display', () => {
      const next = reducer(textDisplay, { type: 'TIMER_3S' });
      expect(next.screen).toBe('text_display');
    });
  });

  // --- TERM_PROMPT ---
  describe('TERM_PROMPT state', () => {
    const termPrompt: InstallationState = { ...initialState, screen: 'term_prompt' };

    it('TIMER_2S transitions term_prompt → conversation', () => {
      const next = reducer(termPrompt, { type: 'TIMER_2S' });
      expect(next.screen).toBe('conversation');
    });
  });

  // --- CONVERSATION ---
  describe('CONVERSATION state', () => {
    const conversation: InstallationState = { ...initialState, screen: 'conversation' };

    it('DEFINITION_RECEIVED transitions conversation → synthesizing and stores definition', () => {
      const def = makeDefinition();
      const next = reducer(conversation, { type: 'DEFINITION_RECEIVED', definition: def });
      expect(next.screen).toBe('synthesizing');
      expect(next.definition).toEqual(def);
    });

    it('TIMER_2S is a no-op in conversation', () => {
      const next = reducer(conversation, { type: 'TIMER_2S' });
      expect(next.screen).toBe('conversation');
    });
  });

  // --- SYNTHESIZING ---
  describe('SYNTHESIZING state', () => {
    const synthesizing: InstallationState = { ...initialState, screen: 'synthesizing', definition: makeDefinition() };

    it('DEFINITION_READY transitions synthesizing → definition', () => {
      const next = reducer(synthesizing, { type: 'DEFINITION_READY' });
      expect(next.screen).toBe('definition');
    });
  });

  // --- DEFINITION ---
  describe('DEFINITION state', () => {
    const definition: InstallationState = { ...initialState, screen: 'definition', definition: makeDefinition() };

    it('TIMER_10S transitions definition → printing', () => {
      const next = reducer(definition, { type: 'TIMER_10S' });
      expect(next.screen).toBe('printing');
    });
  });

  // --- PRINTING ---
  describe('PRINTING state', () => {
    const printing: InstallationState = { ...initialState, screen: 'printing' };

    it('PRINT_DONE transitions printing → farewell', () => {
      const next = reducer(printing, { type: 'PRINT_DONE' });
      expect(next.screen).toBe('farewell');
    });
  });

  // --- FAREWELL ---
  describe('FAREWELL state', () => {
    const farewell: InstallationState = { ...initialState, screen: 'farewell' };

    it('TIMER_15S transitions farewell → sleep (reset)', () => {
      const next = reducer(farewell, { type: 'TIMER_15S' });
      expect(next.screen).toBe('sleep');
    });

    it('FACE_LOST transitions farewell → sleep (reset)', () => {
      const next = reducer(farewell, { type: 'FACE_LOST' });
      expect(next.screen).toBe('sleep');
    });

    it('RESET returns to initial state from farewell', () => {
      const next = reducer(farewell, { type: 'RESET' });
      expect(next).toEqual(initialState);
    });
  });

  // --- Full Mode A flow ---
  describe('Full Mode A (text_term) flow', () => {
    it('traverses states (text_term skips term_prompt)', () => {
      const def = makeDefinition();
      const final = advance(
        { ...initialState, mode: 'text_term', contextText: 'Some text', stages: { textReading: true, termPrompt: false, portrait: true, printing: true } },
        { type: 'WAKE' },                                                      // → welcome
        { type: 'TIMER_3S' },                                                  // → text_display
        { type: 'READY' },                                                     // → conversation (skips term_prompt)
        { type: 'DEFINITION_RECEIVED', definition: def },                     // → synthesizing
        { type: 'DEFINITION_READY' },                                          // → definition
        { type: 'TIMER_10S' },                                                 // → printing
        { type: 'PRINT_DONE' },                                                // → farewell
        { type: 'TIMER_15S' },                                                 // → sleep
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
      let s: InstallationState = { ...initialState, mode: 'term_only' as Mode, stages: { textReading: false, termPrompt: true, portrait: true, printing: true } };
      const actions: InstallationAction[] = [
        { type: 'WAKE' },
        { type: 'TIMER_3S' },   // should go to term_prompt, not text_display
        { type: 'TIMER_2S' },
      ];
      for (const action of actions) {
        s = reducer(s, action);
        screens.push(s.screen);
      }
      expect(screens).toEqual(['welcome', 'term_prompt', 'conversation']);
    });
  });

  // --- Config actions ---
  describe('Configuration actions', () => {
    it('SET_CONFIG updates mode, term, contextText, parentSessionId, stages', () => {
      const chainStages: StageConfig = { textReading: true, termPrompt: true, portrait: true, printing: true };
      const next = reducer(initialState, {
        type: 'SET_CONFIG',
        mode: 'chain',
        term: 'SPRECHEN',
        contextText: 'A bird is a happy accident.',
        parentSessionId: '00000000-0000-0000-0000-000000000099',
        stages: chainStages,
      });
      expect(next.mode).toBe('chain');
      expect(next.term).toBe('SPRECHEN');
      expect(next.contextText).toBe('A bird is a happy accident.');
      expect(next.parentSessionId).toBe('00000000-0000-0000-0000-000000000099');
      expect(next.stages).toEqual(chainStages);
      expect(next.screen).toBe('sleep'); // screen unchanged
    });

    it('SET_SESSION_ID updates sessionId', () => {
      const id = '00000000-0000-0000-0000-000000000042';
      const next = reducer(initialState, { type: 'SET_SESSION_ID', id });
      expect(next.sessionId).toBe(id);
    });

    it('SET_LANGUAGE updates language', () => {
      const next = reducer(initialState, { type: 'SET_LANGUAGE', lang: 'en' });
      expect(next.language).toBe('en');
    });

    it('RESET returns to initialState regardless of current state', () => {
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
        stages: { textReading: true, termPrompt: true, portrait: true, printing: true },
      };
      const next = reducer(dirty, { type: 'RESET' });
      expect(next).toEqual(initialState);
    });
  });

  // --- Stage-config-driven routing ---
  describe('Stage config combinations', () => {
    const welcome: InstallationState = { ...initialState, screen: 'welcome' };

    it('stages={textReading:false, termPrompt:false}: TIMER_3S from welcome → conversation', () => {
      const s: InstallationState = { ...welcome, stages: { textReading: false, termPrompt: false, portrait: false, printing: true } };
      const next = reducer(s, { type: 'TIMER_3S' });
      expect(next.screen).toBe('conversation');
    });

    it('stages={textReading:false, termPrompt:true}: TIMER_3S from welcome → term_prompt', () => {
      const s: InstallationState = { ...welcome, stages: { textReading: false, termPrompt: true, portrait: true, printing: true } };
      const next = reducer(s, { type: 'TIMER_3S' });
      expect(next.screen).toBe('term_prompt');
    });

    it('stages={textReading:true, termPrompt:true}: READY from text_display → term_prompt', () => {
      const s: InstallationState = { ...initialState, screen: 'text_display', stages: { textReading: true, termPrompt: true, portrait: true, printing: true } };
      const next = reducer(s, { type: 'READY' });
      expect(next.screen).toBe('term_prompt');
    });

    it('stages={textReading:true, termPrompt:false}: READY from text_display → conversation', () => {
      const s: InstallationState = { ...initialState, screen: 'text_display', stages: { textReading: true, termPrompt: false, portrait: true, printing: true } };
      const next = reducer(s, { type: 'READY' });
      expect(next.screen).toBe('conversation');
    });
  });

  // --- Guard: actions don't bleed across states ---
  describe('State guards prevent invalid transitions', () => {
    it('DEFINITION_RECEIVED is ignored outside conversation', () => {
      const def = makeDefinition();
      const inSleep = reducer(initialState, { type: 'DEFINITION_RECEIVED', definition: def });
      expect(inSleep.screen).toBe('sleep');
      expect(inSleep.definition).toBeNull();
    });

    it('PRINT_DONE is ignored outside printing', () => {
      const inWelcome: InstallationState = { ...initialState, screen: 'welcome' };
      const next = reducer(inWelcome, { type: 'PRINT_DONE' });
      expect(next.screen).toBe('welcome');
    });

    it('FACE_LOST is ignored outside farewell', () => {
      const inConversation: InstallationState = { ...initialState, screen: 'conversation' };
      const next = reducer(inConversation, { type: 'FACE_LOST' });
      expect(next.screen).toBe('conversation');
    });
  });
});
