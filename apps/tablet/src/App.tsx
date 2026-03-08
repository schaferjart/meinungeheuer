import { useEffect, useRef, useCallback } from 'react';
import { DEFAULT_MODE, DEFAULT_TERM } from '@meinungeheuer/shared';
import type { Definition } from '@meinungeheuer/shared';

/** Build a partial Definition object from conversation results (client-side only). */
function makeClientDefinition(d: {
  term: string;
  definition_text: string;
  citations: string[];
  language: string;
}): Definition {
  return {
    id: crypto.randomUUID(),
    session_id: null,
    term: d.term,
    definition_text: d.definition_text,
    citations: d.citations,
    language: d.language,
    chain_depth: null,
    created_at: new Date().toISOString(),
    embedding: null,
  };
}

import { useInstallationMachine } from './hooks/useInstallationMachine';
import { useConversation } from './hooks/useConversation';
import { fetchConfig } from './lib/api';
import { persistDefinition, persistTranscript } from './lib/persist';
import { ScreenTransition } from './components/ScreenTransition';
import { CameraDetector } from './components/CameraDetector';
import { Admin } from './pages/Admin';

import { SleepScreen } from './components/screens/SleepScreen';
import { WelcomeScreen } from './components/screens/WelcomeScreen';
import { TextDisplayScreen } from './components/screens/TextDisplayScreen';
import { TermPromptScreen } from './components/screens/TermPromptScreen';
import { ConversationScreen } from './components/screens/ConversationScreen';
import { SynthesizingScreen } from './components/screens/SynthesizingScreen';
import { DefinitionScreen } from './components/screens/DefinitionScreen';
import { PrintingScreen } from './components/screens/PrintingScreen';
import { FarewellScreen } from './components/screens/FarewellScreen';

const BACKEND_URL = import.meta.env['VITE_BACKEND_URL'] ?? 'http://localhost:3001';
const ELEVENLABS_AGENT_ID = import.meta.env['VITE_ELEVENLABS_AGENT_ID'] ?? '';

// ---------------------------------------------------------------------------
// Admin routing — check URL param once at module level (stable across renders)
// ---------------------------------------------------------------------------
const IS_ADMIN = new URLSearchParams(window.location.search).get('admin') === 'true';

export function App() {
  // Render the admin dashboard if ?admin=true is in the URL
  if (IS_ADMIN) {
    return <Admin />;
  }

  return <InstallationApp />;
}

// ---------------------------------------------------------------------------
// The actual installation UI — extracted so admin check is clean
// ---------------------------------------------------------------------------

function InstallationApp() {
  const { state, dispatch } = useInstallationMachine({
    mode: DEFAULT_MODE,
    term: DEFAULT_TERM,
  });

  // Track whether config has been fetched to avoid double-fetching
  const configFetchedRef = useRef(false);

  // On mount: fetch config from backend and apply it
  useEffect(() => {
    if (configFetchedRef.current) return;
    configFetchedRef.current = true;

    fetchConfig(BACKEND_URL)
      .then((config) => {
        // Derive contextText from the backend's response shape:
        // - Mode A (text_term): use the text content (prefer German)
        // - Mode C (chain): use the previous visitor's definition
        // - Mode B (term_only): null
        let contextText: string | null = null;
        if (config.text) {
          contextText = config.text.content_de ?? config.text.content_en ?? null;
        } else if (config.chain_context) {
          contextText = config.chain_context.definition_text;
        }

        dispatch({
          type: 'SET_CONFIG',
          mode: config.mode,
          term: config.term,
          contextText,
          parentSessionId: config.parentSessionId ?? null,
        });
      })
      .catch((err: unknown) => {
        // Network failure — fall back to defaults already set in initial state
        console.warn('[App] Config fetch failed, using defaults:', err);
      });
  }, [dispatch]);

  // Camera detection callbacks — stable references via useCallback
  const handleWake = useCallback(() => {
    dispatch({ type: 'WAKE' });
  }, [dispatch]);

  const handleFaceLost = useCallback(() => {
    dispatch({ type: 'FACE_LOST' });
  }, [dispatch]);

  const { screen, mode, term, contextText, definition, language } = state;

  // -----------------------------------------------------------------------
  // ElevenLabs conversation hook
  // -----------------------------------------------------------------------
  const handleDefinitionReceived = useCallback(
    (result: { term: string; definition_text: string; citations: string[]; language: string }) => {
      const def = makeClientDefinition(result);
      dispatch({ type: 'DEFINITION_RECEIVED', definition: def });
      void persistDefinition(def);
      setTimeout(() => dispatch({ type: 'DEFINITION_READY' }), 2000);
    },
    [dispatch],
  );

  const handleConversationEnd = useCallback(
    (reason: string) => {
      console.log('[App] Conversation ended, reason:', reason);
      // Persist transcript to Supabase
      void persistTranscript(conversationIdRef.current, transcriptRef.current);
      // If the conversation ended without a definition (e.g. agent disconnected),
      // and we're still on the conversation screen, synthesize gracefully
      if (state.screen === 'conversation' && !state.definition) {
        dispatch({
          type: 'DEFINITION_RECEIVED',
          definition: makeClientDefinition({
            term,
            definition_text: 'Die Unterhaltung wurde beendet.',
            citations: [],
            language,
          }),
        });
        setTimeout(() => dispatch({ type: 'DEFINITION_READY' }), 2000);
      }
    },
    [dispatch, state.screen, state.definition, term, language],
  );

  const {
    status: conversationStatus,
    isSpeaking,
    transcript,
    conversationId,
    startConversation,
    endConversation,
  } = useConversation({
    agentId: ELEVENLABS_AGENT_ID,
    mode,
    term,
    contextText,
    language,
    onDefinitionReceived: handleDefinitionReceived,
    onConversationEnd: handleConversationEnd,
  });

  // Refs for persist callbacks (defined after useConversation, used in handleConversationEnd)
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  // Start the ElevenLabs session when we enter the conversation screen
  const conversationStartedRef = useRef(false);
  useEffect(() => {
    if (screen === 'conversation' && !conversationStartedRef.current) {
      conversationStartedRef.current = true;
      console.log('[App] Starting ElevenLabs conversation...');
      startConversation().catch((err) => {
        console.error('[App] Failed to start conversation:', err);
      });
    }
    // Reset the flag when we leave the conversation screen
    if (screen !== 'conversation') {
      conversationStartedRef.current = false;
    }
  }, [screen, startConversation]);

  // End the ElevenLabs session once we leave the conversation screen.
  // After save_definition fires, the screen transitions to synthesizing —
  // we no longer need the WebSocket open.
  useEffect(() => {
    if (screen !== 'conversation' && conversationStatus === 'connected') {
      endConversation().catch(() => {});
    }
  }, [screen, conversationStatus, endConversation]);

  // Derive mic state for the UI
  const micState: 'idle' | 'listening' | 'speaking' =
    conversationStatus !== 'connected'
      ? 'idle'
      : isSpeaking
        ? 'speaking'
        : 'listening';

  // Debug: log state changes to console during development
  useEffect(() => {
    console.log('[App] Screen:', screen, '| Mode:', mode, '| Term:', term, '| EL status:', conversationStatus);
  }, [screen, mode, term, conversationStatus]);

  function renderScreen() {
    switch (screen) {
      case 'sleep':
        return <SleepScreen dispatch={dispatch} />;

      case 'welcome':
        return <WelcomeScreen dispatch={dispatch} language={language} />;

      case 'text_display':
        return (
          <TextDisplayScreen
            dispatch={dispatch}
            contextText={contextText}
            language={language}
          />
        );

      case 'term_prompt':
        return (
          <TermPromptScreen dispatch={dispatch} term={term} language={language} />
        );

      case 'conversation':
        return (
          <ConversationScreen
            dispatch={dispatch}
            term={term}
            transcript={transcript}
            micState={micState}
          />
        );

      case 'synthesizing':
        return <SynthesizingScreen dispatch={dispatch} language={language} />;

      case 'definition':
        if (!definition) {
          // Defensive: should never happen; fall through to synthesizing
          return <SynthesizingScreen dispatch={dispatch} language={language} />;
        }
        return <DefinitionScreen dispatch={dispatch} definition={definition} />;

      case 'printing':
        return <PrintingScreen dispatch={dispatch} language={language} />;

      case 'farewell':
        return <FarewellScreen dispatch={dispatch} language={language} />;

      default: {
        // Exhaustiveness guard
        const _: never = screen;
        void _;
        return <SleepScreen dispatch={dispatch} />;
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000',
        overflow: 'hidden',
      }}
    >
      {/*
        CameraDetector is always mounted at the app root — it runs the face
        detection loop regardless of which screen is active. It renders only
        a zero-size hidden video element; nothing is shown to the visitor.
        Tap-to-start on SleepScreen remains the fallback if camera is denied.
      */}
      <CameraDetector onWake={handleWake} onSleep={handleFaceLost} />

      <ScreenTransition screenKey={screen}>
        {renderScreen()}
      </ScreenTransition>
    </div>
  );
}
