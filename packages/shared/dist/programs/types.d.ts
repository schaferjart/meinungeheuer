import type { Mode, SpeechProfile } from '../types.js';
/** Controls which stages of the installation pipeline are active for a program. */
export interface StageConfig {
    /** Whether the visitor reads a text on the tablet before conversation. */
    textReading: boolean;
    /** Whether a term prompt screen is shown before conversation. */
    termPrompt: boolean;
    /** Whether a portrait photo is captured during conversation. */
    portrait: boolean;
    /** Whether the result is printed on a thermal card. */
    printing: boolean;
    /**
     * Whether a GDPR consent screen is shown before the conversation.
     * Required for any program that records or clones the visitor's voice.
     */
    consentRequired?: boolean;
}
/** Which print template the POS server uses for the thermal card. */
export type PrintLayout = 'dictionary' | 'helvetica' | 'dictionary_portrait' | 'portrait_only' | 'message';
/** How the conversation result is displayed on the tablet screen. */
export type ResultDisplay = 'aphorism' | 'definition' | 'raw_transcript';
/** Generic parameters all programs receive for prompt building. */
export interface PromptParams {
    term: string;
    contextText: string | null;
    language: string;
    /** Voice chain: previous visitor's extracted speech profile. */
    speechProfile?: SpeechProfile;
    /** Voice chain: generated icebreaker from previous conversation. */
    voiceChainIcebreaker?: string;
}
/**
 * A ConversationProgram defines the full behavior of one installation mode:
 * which stages are active, how prompts are built, and how results are
 * displayed and printed.
 *
 * Programs are TypeScript code objects, not database records. They are
 * registered statically in the program registry.
 */
export interface ConversationProgram {
    /** Unique identifier stored in installation_config.program. */
    id: string;
    /** Human-readable name for admin UI. */
    name: string;
    /** Short description of the program's behavior. */
    description: string;
    /** Which pipeline stages are active. */
    stages: StageConfig;
    /** Builds the full system prompt for the ElevenLabs agent. */
    buildSystemPrompt: (params: PromptParams) => string;
    /** Builds the agent's opening line spoken to the visitor. */
    buildFirstMessage: (params: PromptParams) => string;
    /** Which print template to use for the thermal card. */
    printLayout: PrintLayout;
    /** How to show the result on the tablet screen. */
    resultDisplay: ResultDisplay;
    /** The Mode value stored in Supabase session records. */
    sessionMode: Mode;
}
//# sourceMappingURL=types.d.ts.map