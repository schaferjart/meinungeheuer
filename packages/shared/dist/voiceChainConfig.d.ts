/**
 * voiceChainConfig
 *
 * All tunable parameters for the voice chain program.
 * Adjust these to tweak the pipeline without touching business logic.
 *
 * This is a convenience config — not the single source of truth.
 * Consuming code uses these as defaults; they can always be overridden
 * at the call site or via environment variables where applicable.
 */
export declare const VOICE_CLONE: {
    /** Strip background noise from visitor recording before cloning. */
    readonly removeBackgroundNoise: true;
    /** How many chain positions to retain before deleting old clones. */
    readonly retentionWindow: 10;
};
export declare const SPEECH_PROFILE_EXTRACTION: {
    /** OpenRouter model ID for speech profile analysis. */
    readonly model: "google/gemini-2.0-flash-001";
    /** Lower = more deterministic. 0.3 works well for structured JSON output. */
    readonly temperature: 0.3;
    /** System prompt — tell the LLM how to analyze visitor speech. */
    readonly systemPrompt: "You are a linguist analyzing a conversation transcript from an art installation.\nAnalyze only the visitor's turns and return a JSON object describing their speech profile.\nReturn ONLY a valid JSON object — no markdown, no explanation.\n\nThe JSON must have exactly these fields:\n{\n  \"characteristic_phrases\": [\"array of 3-7 distinctive expressions or sentence patterns the visitor used\"],\n  \"vocabulary_level\": \"casual|conversational|formal|mixed\",\n  \"favorite_words\": [\"array of words the visitor used frequently or notably\"],\n  \"tone\": \"short description of overall emotional tone\",\n  \"humor_style\": \"description of how/whether they used humor\",\n  \"cadence_description\": \"description of their speech rhythm and pacing\",\n  \"topics_of_interest\": [\"genuine interests or passions they showed\"],\n  \"personality_snapshot\": \"2-3 sentence character description\"\n}";
};
export declare const ICEBREAKER_GENERATION: {
    /** OpenRouter model ID for icebreaker generation. */
    readonly model: "google/gemini-2.0-flash-001";
    /** Higher = more creative. 0.9 for varied, surprising openers. */
    readonly temperature: 0.9;
    /** System prompt — tell the LLM how to create an icebreaker. */
    readonly systemPrompt: "Given this transcript from an art installation conversation, generate one compelling icebreaker (1-2 sentences) that:\n- references something specific from the conversation\n- is open-ended enough to start a new conversation with a different person\n- feels intriguing and slightly mysterious\n- does NOT reveal private information\n\nReturn ONLY the icebreaker text, nothing else.";
};
export declare const PORTRAIT: {
    /** CSS blur radius in pixels for the blurred portrait. */
    readonly blurRadius: 25;
    /** JPEG export quality (0–1). */
    readonly jpegQuality: 0.85;
    /** Delay (ms) after conversation starts before capturing portrait. */
    readonly captureDelayMs: 5000;
    /** Minimum blob size in bytes — below this, the frame is likely black. */
    readonly minBlobSize: 1024;
};
export declare const COLD_START: {
    /** German opener when there's no icebreaker from a previous visitor. */
    readonly firstMessageDe: "Jemand war gerade hier vor dir. Sie haben etwas hinterlassen. Ich bin neugierig — was bringst du mit?";
    /** English opener when there's no icebreaker from a previous visitor. */
    readonly firstMessageEn: "Someone was just here before you. They left something behind. I am curious — what do you bring?";
};
export declare const STYLE_INFLUENCE: {
    /** Max characteristic phrases to include in the style block. */
    readonly maxPhrases: 5;
    /** Max favorite words to include in the style block. */
    readonly maxFavoriteWords: 5;
};
//# sourceMappingURL=voiceChainConfig.d.ts.map