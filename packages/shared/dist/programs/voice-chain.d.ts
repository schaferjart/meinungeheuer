import type { ConversationProgram } from './types.js';
/**
 * Voice chain program — the AI speaks in the previous visitor's cloned voice
 * and style, creating a chain of identity transfer between strangers.
 *
 * Each conversation:
 * 1. Opens with an icebreaker distilled from the previous conversation
 * 2. AI voice = clone of previous visitor's voice (via TTS override)
 * 3. AI style = influenced by previous visitor's speech patterns
 * 4. Produces an aphorism (printed on card)
 * 5. Captures visitor's voice + portrait for the next link in the chain
 */
export declare const voiceChainProgram: ConversationProgram;
//# sourceMappingURL=voice-chain.d.ts.map