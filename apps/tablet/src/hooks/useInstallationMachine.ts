import { useReducer, useCallback } from 'react';
import type { Mode, StateName, Definition } from '@meinungeheuer/shared';
import type { StageConfig } from '@meinungeheuer/shared';
import { DEFAULT_MODE, DEFAULT_TERM } from '@meinungeheuer/shared';

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
  stages: StageConfig;
  /** GDPR voice-clone consent given by the visitor. null = not yet asked. */
  voiceCloneConsent: boolean | null;
}

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
  voiceCloneConsent: null,
};

// ============================================================
// Actions
// ============================================================

export type InstallationAction =
  | { type: 'WAKE' }
  | { type: 'TIMER_3S' }
  | { type: 'CONSENT_ACCEPTED' }
  | { type: 'CONSENT_DECLINED' }
  | { type: 'READY' }
  | { type: 'TIMER_2S' }
  | { type: 'DEFINITION_RECEIVED'; definition: Definition }
  | { type: 'DEFINITION_READY' }
  | { type: 'TIMER_10S' }
  | { type: 'PRINT_DONE' }
  | { type: 'TIMER_15S' }
  | { type: 'FACE_LOST' }
  | { type: 'SET_CONFIG'; mode: Mode; term: string; contextText: string | null; parentSessionId: string | null; stages: StageConfig }
  | { type: 'SET_SESSION_ID'; id: string }
  | { type: 'SET_LANGUAGE'; lang: 'de' | 'en' }
  | { type: 'RESET' };

// ============================================================
// Reducer
// ============================================================

function installationReducer(
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
        stages: action.stages,
      };

    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.id };

    case 'SET_LANGUAGE':
      return { ...state, language: action.lang };

    case 'RESET':
      return {
        ...initialState,
        // Preserve config across resets — config is fetched once on mount
        mode: state.mode,
        term: state.term,
        contextText: state.contextText,
        parentSessionId: state.parentSessionId,
        stages: state.stages,
        language: state.language,
        // Consent is per-visitor — always reset to null
        voiceCloneConsent: null,
      };

    // --- State transitions ---
    case 'WAKE': {
      if (state.screen !== 'sleep') return state;
      return { ...state, screen: 'welcome' };
    }

    case 'TIMER_3S': {
      if (state.screen !== 'welcome') return state;
      // Consent gate: voice clone programs require explicit GDPR consent first
      if (state.stages.consentRequired) {
        return { ...state, screen: 'consent' };
      }
      // Stage-driven routing: textReading → text_display, termPrompt → term_prompt, else → conversation
      if (state.stages.textReading) {
        return { ...state, screen: 'text_display' };
      }
      if (state.stages.termPrompt) {
        return { ...state, screen: 'term_prompt' };
      }
      return { ...state, screen: 'conversation' };
    }

    case 'CONSENT_ACCEPTED': {
      if (state.screen !== 'consent') return state;
      const next = { ...state, voiceCloneConsent: true };
      console.log('[Machine] Voice clone consent accepted');
      // After consent: follow normal stage routing
      if (next.stages.textReading) {
        return { ...next, screen: 'text_display' };
      }
      if (next.stages.termPrompt) {
        return { ...next, screen: 'term_prompt' };
      }
      return { ...next, screen: 'conversation' };
    }

    case 'CONSENT_DECLINED': {
      if (state.screen !== 'consent') return state;
      console.log('[Machine] Voice clone consent declined');
      // Declined: proceed to conversation but flag consent as false.
      // The voice chain program will still run but the audio should not be
      // submitted for voice cloning (handled in App.tsx submitVoiceChainData gate).
      return { ...state, voiceCloneConsent: false, screen: 'conversation' };
    }

    case 'READY': {
      if (state.screen !== 'text_display') return state;
      // After text reading: show term prompt if enabled, otherwise go straight to conversation
      if (state.stages.termPrompt) {
        return { ...state, screen: 'term_prompt' };
      }
      return { ...state, screen: 'conversation' };
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
      if (!state.stages.printing) {
        return { ...state, screen: 'farewell' };
      }
      return { ...state, screen: 'printing' };
    }

    case 'PRINT_DONE': {
      if (state.screen !== 'printing') return state;
      return { ...state, screen: 'farewell' };
    }

    case 'TIMER_15S': {
      if (state.screen !== 'farewell') return state;
      return installationReducer(state, { type: 'RESET' });
    }

    case 'FACE_LOST': {
      if (state.screen !== 'farewell') return state;
      return installationReducer(state, { type: 'RESET' });
    }

    default:
      return state;
  }
}

// ============================================================
// Hook
// ============================================================

export function useInstallationMachine(overrideInitial?: Partial<InstallationState>) {
  const [state, dispatch] = useReducer(
    installationReducer,
    overrideInitial ? { ...initialState, ...overrideInitial } : initialState,
  );

  const wake = useCallback(() => dispatch({ type: 'WAKE' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, dispatch, wake, reset };
}
