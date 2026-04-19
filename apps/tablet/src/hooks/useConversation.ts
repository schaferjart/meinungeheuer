import { useCallback, useRef, useState } from 'react';
import {
  useConversation as useElevenLabsConversation,
  type Status,
  type DisconnectionDetails,
  type Role as ElevenLabsRole,
} from '@elevenlabs/react';
import { APP_NAME, type ConversationProgram, type SpeechProfile } from '@meinungeheuer/shared';

const LOG_PREFIX = `[${APP_NAME}]`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptEntry {
  /** "visitor" matches our shared Role type; ElevenLabs uses "user" / "agent" */
  role: 'visitor' | 'agent';
  content: string;
  timestamp: number;
}

export interface SaveDefinitionResult {
  term: string;
  definition_text: string;
  citations: string[];
  language: string;
}

export interface UseConversationParams {
  /** Backend URL for API calls (voice chain apply-voice) */
  backendUrl: string;
  /** ElevenLabs agent ID (from env) */
  agentId: string;
  /** Active conversation program (replaces mode for prompt building) */
  program: ConversationProgram;
  /** The term to explore */
  term: string;
  /** Context text for text_term / chain modes */
  contextText?: string | null;
  /** Preferred language for the first message ("de" | "en") */
  language?: string;
  /** Voice chain: ElevenLabs voice clone ID for TTS override */
  voiceId?: string;
  /** Voice chain: previous visitor's extracted speech profile */
  speechProfile?: SpeechProfile;
  /** Voice chain: generated icebreaker from previous conversation */
  voiceChainIcebreaker?: string;
  /** Called when the agent calls save_definition */
  onDefinitionReceived?: (result: SaveDefinitionResult) => void;
  /** Called when the conversation ends for any reason */
  onConversationEnd?: (reason: DisconnectionDetails['reason']) => void;
}

export interface UseConversationReturn {
  /** ElevenLabs connection status */
  status: Status;
  /** Whether the agent is currently speaking */
  isSpeaking: boolean;
  /** Full transcript of the conversation */
  transcript: TranscriptEntry[];
  /** ElevenLabs conversation ID (available after connect) */
  conversationId: string | undefined;
  /** Start the ElevenLabs conversation session */
  startConversation: () => Promise<string>;
  /** End the conversation from the client side */
  endConversation: () => Promise<void>;
  /** Signal user presence to prevent WebSocket inactivity timeout */
  sendUserActivity: () => void;
}

// ---------------------------------------------------------------------------
// Role mapping
// ---------------------------------------------------------------------------

export function mapRole(elevenLabsRole: ElevenLabsRole): TranscriptEntry['role'] {
  return elevenLabsRole === 'user' ? 'visitor' : 'agent';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConversation(
  params: UseConversationParams,
): UseConversationReturn {
  const {
    backendUrl,
    agentId,
    program,
    term,
    contextText,
    language = 'de',
    voiceId,
    speechProfile,
    voiceChainIcebreaker,
    onDefinitionReceived,
    onConversationEnd,
  } = params;

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Use refs for callbacks and voice chain params so the ElevenLabs hook
  // doesn't re-initialize when these values change between renders.
  const onDefinitionReceivedRef = useRef(onDefinitionReceived);
  onDefinitionReceivedRef.current = onDefinitionReceived;

  const onConversationEndRef = useRef(onConversationEnd);
  onConversationEndRef.current = onConversationEnd;

  // Voice chain refs — accessed inside startConversation callback
  const backendUrlRef = useRef(backendUrl);
  backendUrlRef.current = backendUrl;

  const voiceIdRef = useRef(voiceId);
  voiceIdRef.current = voiceId;

  const speechProfileRef = useRef(speechProfile);
  speechProfileRef.current = speechProfile;

  const voiceChainIcebreakerRef = useRef(voiceChainIcebreaker);
  voiceChainIcebreakerRef.current = voiceChainIcebreaker;

  // -----------------------------------------------------------------------
  // ElevenLabs SDK hook
  // -----------------------------------------------------------------------
  const conversation = useElevenLabsConversation({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      console.log(
        `${LOG_PREFIX} Connected to ElevenLabs, conversationId:`,
        conversationId,
      );
    },

    onMessage: ({ message, role }: { message: string; role: ElevenLabsRole }) => {
      setTranscript((prev) => [
        ...prev,
        {
          role: mapRole(role),
          content: message,
          timestamp: Date.now(),
        },
      ]);
    },

    onDisconnect: (details: DisconnectionDetails) => {
      if (details.reason === 'agent') {
        console.warn(
          `${LOG_PREFIX} Agent-initiated disconnect.`,
          'closeCode:', details.closeCode,
          'closeReason:', details.closeReason,
        );
      } else if (details.reason === 'error') {
        console.error(
          `${LOG_PREFIX} Error disconnect:`,
          details.message,
          'closeCode:', details.closeCode,
          'closeReason:', details.closeReason,
        );
      } else {
        console.log(`${LOG_PREFIX} User-initiated disconnect`);
      }
      // Restore default agent voice if we applied a clone (prevents stale PATCH)
      if (voiceIdRef.current) {
        const defaultVoiceId = 'DLsHlh26Ugcm6ELvS0qi';
        console.log(`${LOG_PREFIX} Restoring default agent voice`);
        void fetch(`${backendUrlRef.current}/api/voice-chain/apply-voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice_id: defaultVoiceId, agent_id: agentId }),
        }).catch(() => {});
      }
      onConversationEndRef.current?.(details.reason);
    },

    onError: (message: string, context?: unknown) => {
      console.error(`${LOG_PREFIX} ElevenLabs error:`, message, context);
    },

    // ------------------------------------------------------------------
    // Client-side tool handling for save_definition.
    //
    // The save_definition tool is configured as a webhook tool in the
    // ElevenLabs dashboard, so it is also sent to the backend webhook.
    // However, we register it as a client tool too so the frontend can
    // react to it immediately (show the definition, transition state).
    //
    // If save_definition is configured as server-only (webhook), it will
    // NOT arrive here. In that case, the frontend detects conversation
    // end via onDisconnect with reason "agent". We handle both paths.
    // ------------------------------------------------------------------
    clientTools: {
      save_definition: (parameters: Record<string, unknown>) => {
        const result: SaveDefinitionResult = {
          term: String(parameters['term'] ?? term),
          definition_text: String(parameters['definition_text'] ?? ''),
          citations: Array.isArray(parameters['citations'])
            ? (parameters['citations'] as unknown[]).map(String)
            : [],
          language: String(parameters['language'] ?? language),
        };

        console.log(
          `${LOG_PREFIX} save_definition called:`,
          result,
        );
        onDefinitionReceivedRef.current?.(result);

        // Return a confirmation — the agent receives this as the tool result
        return 'Definition saved successfully.';
      },
    },
  });

  // -----------------------------------------------------------------------
  // Start conversation
  // -----------------------------------------------------------------------
  const startConversation = useCallback(async (): Promise<string> => {
    // Reset transcript for new session
    setTranscript([]);

    const systemPrompt = program.buildSystemPrompt({
      term,
      contextText: contextText ?? null,
      language,
      speechProfile: speechProfileRef.current,
      voiceChainIcebreaker: voiceChainIcebreakerRef.current,
    });
    const firstMessage = program.buildFirstMessage({
      term,
      contextText: contextText ?? null,
      language,
      speechProfile: speechProfileRef.current,
      voiceChainIcebreaker: voiceChainIcebreakerRef.current,
    });

    const overrides: Record<string, unknown> = {
      agent: {
        prompt: {
          prompt: systemPrompt,
        },
        firstMessage,
        language: language === 'de' ? 'de' : 'en',
      },
    };

    // Voice chain: PATCH the agent's voice on the server before connecting.
    // ElevenLabs Conversational AI does NOT support tts.voiceId session overrides
    // for instant voice clones — we must update the agent config instead.
    if (voiceIdRef.current) {
      console.log(`${LOG_PREFIX} Applying voice clone to agent:`, voiceIdRef.current);
      try {
        const resp = await fetch(`${backendUrlRef.current}/api/voice-chain/apply-voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice_id: voiceIdRef.current, agent_id: agentId }),
        });
        if (resp.ok) {
          console.log(`${LOG_PREFIX} Agent voice updated successfully`);
        } else {
          console.warn(`${LOG_PREFIX} Failed to apply voice clone, using default`);
        }
      } catch {
        console.warn(`${LOG_PREFIX} Failed to reach backend for voice apply`);
      }
    } else {
      console.log(`${LOG_PREFIX} No voice override — using agent default voice`);
    }

    const conversationId = await conversation.startSession({
      agentId,
      connectionType: 'websocket',
      overrides,
    });

    return conversationId;
  }, [agentId, program, term, contextText, language, conversation]);

  // -----------------------------------------------------------------------
  // End conversation
  // -----------------------------------------------------------------------
  const endConversation = useCallback(async (): Promise<void> => {
    await conversation.endSession();
  }, [conversation]);

  return {
    status: conversation.status,
    isSpeaking: conversation.isSpeaking,
    transcript,
    conversationId: conversation.getId(),
    startConversation,
    endConversation,
    sendUserActivity: conversation.sendUserActivity,
  };
}
