// ============================================================
// Conversation adapter interfaces
// ============================================================

export interface TranscriptEntry {
  /** "visitor" matches our shared Role type; ElevenLabs uses "user" / "ai" */
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

export type ConversationStatus = 'disconnected' | 'connecting' | 'connected';

export interface ConversationSessionParams {
  agentId: string;
  mode: string;
  term: string;
  contextText?: string | null;
  language?: string;
}

export interface ConversationAdapter {
  startSession(params: ConversationSessionParams): Promise<string>;
  endSession(): Promise<void>;
  onTranscript(callback: (entry: TranscriptEntry) => void): void;
  onDefinitionReceived(callback: (result: SaveDefinitionResult) => void): void;
  onDisconnect(callback: (reason: string) => void): void;
}
