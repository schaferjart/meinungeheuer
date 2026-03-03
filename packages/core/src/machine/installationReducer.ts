import type { Mode, StateName, Definition } from '@meinungeheuer/shared';

// ============================================================
// State
// ============================================================

export interface InstallationState {
  screen: StateName;
  mode: Mode;
  term: string;
  contextText: string | null;
  parentSessionId: string | null;
  sessionId: string | null;
  definition: Definition | null;
  conversationId: string | null;
  language: 'de' | 'en';
}

export const INITIAL_STATE: InstallationState = {
  screen: 'sleep',
  mode: 'term_only',
  term: 'BIRD',
  contextText: null,
  parentSessionId: null,
  sessionId: null,
  definition: null,
  conversationId: null,
  language: 'de',
};

// ============================================================
// Actions
// ============================================================

export type InstallationAction =
  | { type: 'WAKE' }
  | { type: 'TIMER_3S' }
  | { type: 'READY' }
  | { type: 'TIMER_2S' }
  | { type: 'DEFINITION_RECEIVED'; definition: Definition }
  | { type: 'DEFINITION_READY' }
  | { type: 'TIMER_10S' }
  | { type: 'PRINT_DONE' }
  | { type: 'TIMER_15S' }
  | { type: 'FACE_LOST' }
  | { type: 'SET_CONFIG'; mode: Mode; term: string; contextText: string | null; parentSessionId: string | null }
  | { type: 'SET_SESSION_ID'; id: string }
  | { type: 'SET_LANGUAGE'; lang: 'de' | 'en' }
  | { type: 'RESET' };

// ============================================================
// Reducer
// ============================================================

export function installationReducer(
  state: InstallationState,
  action: InstallationAction,
): InstallationState {
  switch (action.type) {
    // --- Config actions (can happen in any state) ---
    case 'SET_CONFIG':
      return {
        ...state,
        mode: action.mode,
        term: action.term,
        contextText: action.contextText,
        parentSessionId: action.parentSessionId,
      };

    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.id };

    case 'SET_LANGUAGE':
      return { ...state, language: action.lang };

    case 'RESET':
      return { ...INITIAL_STATE };

    // --- State transitions ---
    case 'WAKE': {
      if (state.screen !== 'sleep') return state;
      return { ...state, screen: 'welcome' };
    }

    case 'TIMER_3S': {
      if (state.screen !== 'welcome') return state;
      // Mode A or C → show text display. Mode B → skip to term prompt.
      if (state.mode === 'text_term' || state.mode === 'chain') {
        return { ...state, screen: 'text_display' };
      }
      return { ...state, screen: 'term_prompt' };
    }

    case 'READY': {
      if (state.screen !== 'text_display') return state;
      return { ...state, screen: 'term_prompt' };
    }

    case 'TIMER_2S': {
      if (state.screen !== 'term_prompt') return state;
      return { ...state, screen: 'conversation' };
    }

    case 'DEFINITION_RECEIVED': {
      if (state.screen !== 'conversation') return state;
      return { ...state, screen: 'synthesizing', definition: action.definition };
    }

    case 'DEFINITION_READY': {
      if (state.screen !== 'synthesizing') return state;
      return { ...state, screen: 'definition' };
    }

    case 'TIMER_10S': {
      if (state.screen !== 'definition') return state;
      return { ...state, screen: 'printing' };
    }

    case 'PRINT_DONE': {
      if (state.screen !== 'printing') return state;
      return { ...state, screen: 'farewell' };
    }

    case 'TIMER_15S': {
      if (state.screen !== 'farewell') return state;
      return { ...INITIAL_STATE };
    }

    case 'FACE_LOST': {
      if (state.screen !== 'farewell') return state;
      return { ...INITIAL_STATE };
    }

    default:
      return state;
  }
}
