// ============================================================
// Conversation types
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
