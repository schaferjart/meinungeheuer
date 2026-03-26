import { useEffect, useRef, useCallback, useState } from 'react';
import { DEFAULT_MODE, DEFAULT_TERM, getProgram, PORTRAIT } from '@meinungeheuer/shared';
import type { Definition, ConversationProgram } from '@meinungeheuer/shared';

/** Build a partial Definition object from conversation results (client-side only). */
function makeClientDefinition(
  d: {
    term: string;
    definition_text: string;
    citations: string[];
    language: string;
  },
  sessionId: string | null = null,
): Definition {
  return {
    id: crypto.randomUUID(),
    session_id: sessionId,
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
import { usePortraitCapture } from './hooks/usePortraitCapture';
import { useAudioCapture } from './hooks/useAudioCapture';
import { fetchConfig, startSession, submitVoiceChainData } from './lib/api';
import type { ConfigResponse } from './lib/api';
import { RuntimeConfigContext, DEFAULT_RUNTIME_CONFIG } from './lib/configContext';
import type { RuntimeConfig } from './lib/configContext';
import { persistDefinition, persistPrintJob, persistTranscript, uploadBlurredPortrait, advanceChain } from './lib/persist';
import { captureBlurredPortrait } from './lib/portraitBlur';
import { ScreenTransition } from './components/ScreenTransition';
import { CameraDetector } from './components/CameraDetector';
import { Admin } from './pages/Admin';

import { SleepScreen } from './components/screens/SleepScreen';
import { WelcomeScreen } from './components/screens/WelcomeScreen';
import { ConsentScreen } from './components/screens/ConsentScreen';
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

  // Active conversation program — resolved from config, drives prompt building,
  // stage routing, and print layout selection.
  const programRef = useRef<ConversationProgram>(getProgram('aphorism'));

  // Shared video element ref — used by both CameraDetector (face detection)
  // and usePortraitCapture (frame capture). NEVER call getUserMedia a second time
  // or iOS Safari will mute the first stream (WebKit bug #179363).
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Portrait capture hook — reads frames from the shared video element
  const printRendererUrl = import.meta.env['VITE_PRINT_RENDERER'] ?? import.meta.env['VITE_PRINT_RENDERER_URL'] ?? '';
  const { captureFrame, uploadPortrait } = usePortraitCapture({
    videoRef,
    printRendererUrl,
    sessionId: state.sessionId,
  });

  // Store captured portrait blob for deferred upload (capture during conversation,
  // upload after definition received — natural timing ensures definition prints first)
  const portraitBlobRef = useRef<Blob | null>(null);
  const portraitCapturedRef = useRef(false);

  // Voice chain: blurred portrait blob captured during conversation
  const blurredPortraitBlobRef = useRef<Blob | null>(null);

  // Voice chain state from config — holds voice clone ID, speech profile, icebreaker
  const voiceChainRef = useRef<ConfigResponse['voice_chain']>(null);

  // Audio capture hook — records visitor mic independently of the ElevenLabs WebSocket
  const { startRecording, stopRecording } = useAudioCapture();

  // Runtime config — populated from backend response, defaults from constants
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);

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

        // Voice chain: store state for session start and data submission
        if (config.voice_chain) {
          voiceChainRef.current = config.voice_chain;
          console.log('[App] Voice chain state loaded, position:', config.voice_chain.chain_position);
        }

        // Resolve the conversation program from config
        const program = getProgram(config.program ?? 'aphorism');
        // Merge DB stage overrides on top of program defaults (null = use default)
        const mergedStages = { ...program.stages };
        if (config.stages) {
          if (config.stages.textReading !== null && config.stages.textReading !== undefined) mergedStages.textReading = config.stages.textReading;
          if (config.stages.termPrompt !== null && config.stages.termPrompt !== undefined) mergedStages.termPrompt = config.stages.termPrompt;
          if (config.stages.portrait !== null && config.stages.portrait !== undefined) mergedStages.portrait = config.stages.portrait;
          if (config.stages.printing !== null && config.stages.printing !== undefined) mergedStages.printing = config.stages.printing;
        }
        program.stages = mergedStages;
        programRef.current = program;

        dispatch({
          type: 'SET_CONFIG',
          mode: config.mode,
          term: config.term ?? '',
          contextText,
          parentSessionId: config.parentSessionId ?? null,
          stages: mergedStages,
        });

        // Merge runtime config from backend response — fall back to defaults per field
        const merged: RuntimeConfig = {
          faceDetection: config.faceDetection ?? DEFAULT_RUNTIME_CONFIG.faceDetection,
          timers: config.timers ?? DEFAULT_RUNTIME_CONFIG.timers,
          voice: config.voice ?? DEFAULT_RUNTIME_CONFIG.voice,
          portrait: config.portrait ?? DEFAULT_RUNTIME_CONFIG.portrait,
          display: config.display
            ? {
                ...config.display,
                fontSize: config.display.fontSize ?? DEFAULT_RUNTIME_CONFIG.display.fontSize,
                letterSpacing: config.display.letterSpacing ?? DEFAULT_RUNTIME_CONFIG.display.letterSpacing,
                maxWidth: config.display.maxWidth ?? DEFAULT_RUNTIME_CONFIG.display.maxWidth,
              }
            : DEFAULT_RUNTIME_CONFIG.display,
        };
        setRuntimeConfig(merged);
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

  const { screen, mode, term, contextText, definition, language, parentSessionId } = state;

  // Re-fetch voice chain state each time we return to sleep (between visitors)
  const prevScreenRef = useRef(screen);
  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = screen;

    // Only refetch when transitioning TO sleep from another screen (not on initial mount)
    if (screen === 'sleep' && prev !== 'sleep' && programRef.current.id === 'voice_chain') {
      console.log('[App] Re-fetching voice chain state for next visitor...');
      fetchConfig(BACKEND_URL)
        .then((config) => {
          if (config.voice_chain) {
            voiceChainRef.current = config.voice_chain;
            console.log('[App] Voice chain state updated, position:', config.voice_chain.chain_position);
          } else {
            voiceChainRef.current = null;
            console.log('[App] No voice chain state available yet');
          }
        })
        .catch(() => {});
    }
  }, [screen]);

  // -----------------------------------------------------------------------
  // ElevenLabs conversation hook
  // -----------------------------------------------------------------------

  // Ref so that async callbacks always read the latest session ID even after
  // the session row is created asynchronously following conversation start.
  const sessionIdRef = useRef(state.sessionId);
  sessionIdRef.current = state.sessionId;

  const handleDefinitionReceived = useCallback(
    (result: { term: string; definition_text: string; citations: string[]; language: string }) => {
      const def = makeClientDefinition(result, sessionIdRef.current);
      dispatch({ type: 'DEFINITION_RECEIVED', definition: def });
      void persistDefinition(def);

      // Chain mode: advance the chain so the next visitor gets this definition
      if (mode === 'chain') {
        void advanceChain(BACKEND_URL, def.id);
      }

      // Fire-and-forget portrait upload to POS server (only if program uses portraits).
      // Definition card prints via Supabase print_queue (fast, ~2s).
      // Portrait prints via POS pipeline (slow, 30-180s style transfer).
      // Natural timing ensures definition card prints first.
      if (portraitBlobRef.current && programRef.current.stages.portrait) {
        console.log('[App] Uploading portrait to POS server:', portraitBlobRef.current.size, 'bytes');
        void uploadPortrait(portraitBlobRef.current);
        portraitBlobRef.current = null;
      } else {
        console.log('[App] No portrait to upload — blob:', !!portraitBlobRef.current, 'stages.portrait:', programRef.current.stages.portrait);
      }

      setTimeout(() => dispatch({ type: 'DEFINITION_READY' }), 2000);
    },
    [dispatch, uploadPortrait],
  );

  const handleConversationEnd = useCallback(
    (reason: string) => {
      console.log('[App] Conversation ended, reason:', reason);
      // Persist transcript to Supabase
      void persistTranscript(state.sessionId, transcriptRef.current);

      // Voice chain: stop recording and submit captured data to backend.
      // Only submit if the visitor explicitly consented to voice cloning.
      if (programRef.current.id === 'voice_chain') {
        void (async () => {
          const audioBlob = await stopRecording();

          if (state.voiceCloneConsent === false) {
            console.log('[App] Voice clone consent was declined — skipping audio submission');
            return;
          }

          // Only submit audio large enough to clone (>50KB = ~5s of speech)
          if (audioBlob && audioBlob.size > 50_000) {
            void submitVoiceChainData(BACKEND_URL, {
              audio: audioBlob,
              sessionId: sessionIdRef.current ?? 'unknown',
              transcript: transcriptRef.current.map((t) => ({ role: t.role, content: t.content })),
              portraitBlurredUrl: null,
            });
          } else {
            console.warn('[App] No audio blob captured for voice chain');
          }
        })();
      }

      // If the conversation ended without a definition (e.g. agent disconnected),
      // and we're still on the conversation screen, synthesize gracefully
      if (state.screen === 'conversation' && !state.definition) {
        dispatch({
          type: 'DEFINITION_RECEIVED',
          definition: makeClientDefinition(
            {
              term,
              definition_text: 'Die Unterhaltung wurde beendet.',
              citations: [],
              language,
            },
            sessionIdRef.current,
          ),
        });
        setTimeout(() => dispatch({ type: 'DEFINITION_READY' }), 2000);
      }
    },
    [dispatch, state.screen, state.definition, state.voiceCloneConsent, term, language, stopRecording],
  );

  const voiceChain = voiceChainRef.current;

  const {
    status: conversationStatus,
    isSpeaking,
    transcript,
    conversationId,
    startConversation,
    endConversation,
    sendUserActivity,
  } = useConversation({
    backendUrl: BACKEND_URL,
    agentId: ELEVENLABS_AGENT_ID,
    program: programRef.current,
    term,
    contextText,
    language,
    // Voice chain: override TTS voice and inject speech style from previous visitor
    voiceId: voiceChain?.voice_clone_id ?? undefined,
    speechProfile: voiceChain?.speech_profile ?? undefined,
    voiceChainIcebreaker: voiceChain?.icebreaker ?? undefined,
    onDefinitionReceived: handleDefinitionReceived,
    onConversationEnd: handleConversationEnd,
  });

  // Refs for persist callbacks (defined after useConversation, used in handleConversationEnd)
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  // Start the ElevenLabs session when we enter the conversation screen.
  // After ElevenLabs connects, persist a session row to Supabase with the
  // elevenlabs_conversation_id so that definitions and turns can be linked.
  const conversationStartedRef = useRef(false);
  useEffect(() => {
    if (screen === 'conversation' && !conversationStartedRef.current) {
      conversationStartedRef.current = true;
      console.log('[App] Starting ElevenLabs conversation...');
      startConversation()
        .then((elevenLabsConversationId) => {
          console.log('[App] ElevenLabs conversation started, id:', elevenLabsConversationId);
          // Persist the session row to Supabase. Fire-and-forget — failure is logged
          // but never blocks the conversation or UI transitions.
          startSession(BACKEND_URL, {
            mode,
            term,
            context_text: contextText ?? null,
            parent_session_id: parentSessionId,
            elevenlabs_conversation_id: elevenLabsConversationId,
          })
            .then((res) => {
              console.log('[App] Session persisted, id:', res.session_id);
              dispatch({ type: 'SET_SESSION_ID', id: res.session_id });
            })
            .catch((err: unknown) => {
              console.warn('[App] Session persist failed (non-fatal):', err);
            });
        })
        .catch((err: unknown) => {
          console.error('[App] Failed to start conversation:', err);
        });
    }
    // Reset the flag when we leave the conversation screen
    if (screen !== 'conversation') {
      conversationStartedRef.current = false;
    }
  }, [screen, startConversation]);

  // Voice chain: start recording visitor audio AFTER ElevenLabs connects.
  // Must not race with startConversation for the mic — wait for 'connected'.
  const audioRecordingStartedRef = useRef(false);
  useEffect(() => {
    if (
      screen === 'conversation' &&
      conversationStatus === 'connected' &&
      !audioRecordingStartedRef.current &&
      programRef.current.id === 'voice_chain'
    ) {
      audioRecordingStartedRef.current = true;
      startRecording().catch(() => {});
    }
    if (screen !== 'conversation') {
      audioRecordingStartedRef.current = false;
    }
  }, [screen, conversationStatus, startRecording]);

  // End the ElevenLabs session once we leave the conversation screen.
  // After save_definition fires, the screen transitions to synthesizing —
  // we no longer need the WebSocket open.
  useEffect(() => {
    if (screen !== 'conversation' && conversationStatus === 'connected') {
      endConversation().catch(() => {});
    }
  }, [screen, conversationStatus, endConversation]);

  // Keep WebSocket alive during active conversation.
  // ElevenLabs has a 20s inactivity timeout; sendUserActivity() resets it.
  // Fire every 15s to stay safely under the timeout.
  useEffect(() => {
    if (screen !== 'conversation' || conversationStatus !== 'connected') return;

    const interval = setInterval(() => {
      try {
        sendUserActivity();
      } catch {
        // Connection may be closing — ignore
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [screen, conversationStatus, sendUserActivity]);

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

  // Capture a portrait frame 5s into the conversation screen.
  // The visitor is facing the tablet and face detection confirms presence.
  // Portrait is uploaded to POS server for style transfer + thermal print.
  useEffect(() => {
    if (screen === 'conversation' && !portraitCapturedRef.current && programRef.current.stages.portrait) {
      const timer = setTimeout(() => {
        captureFrame()
          .then((blob) => {
            if (blob) {
              portraitBlobRef.current = blob;
              portraitCapturedRef.current = true;
              console.log('[App] Portrait frame captured:', blob.size, 'bytes');
            }
          })
          .catch(() => {});
      }, PORTRAIT.captureDelayMs);
      return () => clearTimeout(timer);
    }
    if (screen !== 'conversation') {
      portraitCapturedRef.current = false;
      portraitBlobRef.current = null;
      blurredPortraitBlobRef.current = null;
    }
  }, [screen, captureFrame]);

  // Trigger print job when entering the definition screen.
  // The definition object is guaranteed to be set when screen === 'definition'
  // (the reducer only transitions to definition after DEFINITION_READY which
  // requires definition to already be in state).
  const printJobFiredRef = useRef(false);
  useEffect(() => {
    if (screen === 'definition' && definition && !printJobFiredRef.current) {
      printJobFiredRef.current = true;
      void persistPrintJob(
        {
          term: definition.term,
          definition_text: definition.definition_text,
          citations: definition.citations ?? [],
          language: definition.language,
        },
        state.sessionId ?? null,
        programRef.current.printLayout,
        definition.id,
      );
    }
    if (screen !== 'definition') {
      printJobFiredRef.current = false;
    }
  }, [screen, definition, state.sessionId]);

  function renderScreen() {
    switch (screen) {
      case 'sleep':
        return <SleepScreen dispatch={dispatch} />;

      case 'welcome':
        return <WelcomeScreen dispatch={dispatch} language={language} />;

      case 'consent':
        return <ConsentScreen dispatch={dispatch} language={language} />;

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
        return <FarewellScreen dispatch={dispatch} language={language} definition={definition} />;

      default: {
        // Exhaustiveness guard
        const _: never = screen;
        void _;
        return <SleepScreen dispatch={dispatch} />;
      }
    }
  }

  return (
    <RuntimeConfigContext.Provider value={runtimeConfig}>
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
        <CameraDetector onWake={handleWake} onSleep={handleFaceLost} videoRef={videoRef} />

        <ScreenTransition screenKey={screen}>
          {renderScreen()}
        </ScreenTransition>
      </div>
    </RuntimeConfigContext.Provider>
  );
}
