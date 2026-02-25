import { useEffect, useRef, useCallback } from 'react';
import { DEFAULT_MODE, DEFAULT_TERM } from '@meinungeheuer/shared';

import { useInstallationMachine } from './hooks/useInstallationMachine';
import { fetchConfig } from './lib/api';
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
        dispatch({
          type: 'SET_CONFIG',
          mode: config.mode,
          term: config.term,
          contextText: config.contextText,
          parentSessionId: config.parentSessionId,
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
            transcript={[]}
            micState="idle"
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

  // Suppress unused variable warning for 'mode' while it's not yet wired to a
  // runtime feature in this file (it drives state-machine transitions internally).
  void mode;

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
