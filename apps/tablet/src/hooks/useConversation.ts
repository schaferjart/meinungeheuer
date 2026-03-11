import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useConversation as useElevenLabsConversation,
  type Status,
  type DisconnectionDetails,
  type Role as ElevenLabsRole,
} from '@elevenlabs/react';
import type { ConversationProgram } from '@meinungeheuer/shared';

// If the visitor hasn't spoken for this long (ms) while the agent keeps
// talking, end the conversation automatically. This prevents the AI from
// babbling to itself when the visitor has walked away or gone silent.
const VISITOR_SILENCE_TIMEOUT_MS = 30_000;

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
    agentId,
    program,
    term,
    contextText,
    language = 'de',
    onDefinitionReceived,
    onConversationEnd,
  } = params;

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Use refs for callbacks so the ElevenLabs hook doesn't re-initialize
  // when callback identity changes.
  const onDefinitionReceivedRef = useRef(onDefinitionReceived);
  onDefinitionReceivedRef.current = onDefinitionReceived;

  const onConversationEndRef = useRef(onConversationEnd);
  onConversationEndRef.current = onConversationEnd;

  // Track when the visitor last spoke, for silence-based auto-end.
  const lastVisitorMessageRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // ElevenLabs SDK hook
  // -----------------------------------------------------------------------
  const conversation = useElevenLabsConversation({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      console.log(
        '[MeinUngeheuer] Connected to ElevenLabs, conversationId:',
        conversationId,
      );
    },

    onMessage: ({ message, role }: { message: string; role: ElevenLabsRole }) => {
      const mappedRole = mapRole(role);
      // Only reset silence timer for real speech, not silence markers like "..."
      if (mappedRole === 'visitor' && message.replace(/\./g, '').trim().length > 0) {
        lastVisitorMessageRef.current = Date.now();
      }
      setTranscript((prev) => [
        ...prev,
        {
          role: mappedRole,
          content: message,
          timestamp: Date.now(),
        },
      ]);
    },

    onDisconnect: (details: DisconnectionDetails) => {
      if (details.reason === 'agent') {
        console.warn(
          '[MeinUngeheuer] Agent-initiated disconnect.',
          'closeCode:', details.closeCode,
          'closeReason:', details.closeReason,
        );
      } else if (details.reason === 'error') {
        console.error(
          '[MeinUngeheuer] Error disconnect:',
          details.message,
          'closeCode:', details.closeCode,
          'closeReason:', details.closeReason,
        );
      } else {
        console.log('[MeinUngeheuer] User-initiated disconnect');
      }
      onConversationEndRef.current?.(details.reason);
    },

    onError: (message: string, context?: unknown) => {
      console.error('[MeinUngeheuer] ElevenLabs error:', message, context);
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
          '[MeinUngeheuer] save_definition called:',
          result,
        );
        onDefinitionReceivedRef.current?.(result);

        // Return a confirmation — the agent receives this as the tool result
        return 'Definition saved successfully.';
      },
    },
  });

  // -----------------------------------------------------------------------
  // Silence timeout: if visitor hasn't spoken for 30s, auto-end.
  // This prevents the AI from babbling to itself when nobody is there.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (conversation.status !== 'connected') {
      // Clear timer when not connected
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }

    silenceTimerRef.current = setInterval(() => {
      const lastSpoke = lastVisitorMessageRef.current;
      if (lastSpoke === 0) return; // No visitor message yet — still in opening

      const silenceMs = Date.now() - lastSpoke;
      if (silenceMs >= VISITOR_SILENCE_TIMEOUT_MS) {
        console.log(
          `[MeinUngeheuer] Visitor silent for ${Math.round(silenceMs / 1000)}s — auto-ending conversation`,
        );
        conversation.endSession().catch(() => {});
      }
    }, 5_000); // Check every 5s

    return () => {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [conversation]);

  // -----------------------------------------------------------------------
  // Start conversation
  // -----------------------------------------------------------------------
  const startConversation = useCallback(async (): Promise<string> => {
    // Reset transcript and silence tracker for new session
    setTranscript([]);
    lastVisitorMessageRef.current = 0;

    const systemPrompt = program.buildSystemPrompt({ term, contextText: contextText ?? null, language });
    const firstMessage = program.buildFirstMessage({ term, contextText: contextText ?? null, language });

    const conversationId = await conversation.startSession({
      agentId,
      connectionType: 'websocket',
      overrides: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
          firstMessage,
          language: language === 'de' ? 'de' : 'en',
        },
      },
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
