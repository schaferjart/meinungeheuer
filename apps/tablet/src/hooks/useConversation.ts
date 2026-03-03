import { useCallback, useRef, useState } from 'react';
import {
  useConversation as useElevenLabsConversation,
  type Status,
  type DisconnectionDetails,
  type Role as ElevenLabsRole,
} from '@11labs/react';
import type { Mode } from '@meinungeheuer/shared';
import { buildSystemPrompt, buildFirstMessage } from '@meinungeheuer/core';
import type { TranscriptEntry, SaveDefinitionResult } from '@meinungeheuer/core';
export type { TranscriptEntry, SaveDefinitionResult };




export interface UseConversationParams {
  /** ElevenLabs agent ID (from env) */
  agentId: string;
  /** Current installation mode */
  mode: Mode;
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
}

// Role mapping

function mapRole(elevenLabsRole: ElevenLabsRole): TranscriptEntry['role'] {
  return elevenLabsRole === 'user' ? 'visitor' : 'agent';
}

// Hook

export function useConversation(
  params: UseConversationParams,
): UseConversationReturn {
  const {
    agentId,
    mode,
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

    onMessage: ({ message, source }: { message: string; source: ElevenLabsRole }) => {
      setTranscript((prev) => [
        ...prev,
        {
          role: mapRole(source),
          content: message,
          timestamp: Date.now(),
        },
      ]);
    },

    onDisconnect: (details: DisconnectionDetails) => {
      console.log(
        '[MeinUngeheuer] Disconnected, reason:',
        details.reason,
      );
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
  // Start conversation
  // -----------------------------------------------------------------------
  const startConversation = useCallback(async (): Promise<string> => {
    // Reset transcript for new session
    setTranscript([]);

    const systemPrompt = buildSystemPrompt(mode, term, contextText);
    const firstMessage = buildFirstMessage(mode, term, contextText, language);

    const conversationId = await conversation.startSession({
      agentId,
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
  }, [agentId, mode, term, contextText, language, conversation]);

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
  };
}
