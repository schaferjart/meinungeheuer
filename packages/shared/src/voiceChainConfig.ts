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

// ============================================================
// Backend: voice cloning (ElevenLabs IVC)
// ============================================================

export const VOICE_CLONE = {
  /** Strip background noise from visitor recording before cloning. */
  removeBackgroundNoise: true,
  /** How many chain positions to retain before deleting old clones. */
  retentionWindow: 2,
} as const;

// ============================================================
// Backend: speech profile extraction (LLM)
// ============================================================

export const SPEECH_PROFILE_EXTRACTION = {
  /** OpenRouter model ID for speech profile analysis. */
  model: 'google/gemini-2.0-flash-001',
  /** Lower = more deterministic. 0.3 works well for structured JSON output. */
  temperature: 0.3,
  /** System prompt — tell the LLM how to analyze visitor speech. */
  systemPrompt: `You are a linguist analyzing a conversation transcript from an art installation.
Analyze only the visitor's turns and return a JSON object describing their speech profile.
Return ONLY a valid JSON object — no markdown, no explanation.

The JSON must have exactly these fields:
{
  "characteristic_phrases": ["array of 3-7 distinctive expressions or sentence patterns the visitor used"],
  "vocabulary_level": "casual|conversational|formal|mixed",
  "favorite_words": ["array of words the visitor used frequently or notably"],
  "tone": "short description of overall emotional tone",
  "humor_style": "description of how/whether they used humor",
  "cadence_description": "description of their speech rhythm and pacing",
  "topics_of_interest": ["genuine interests or passions they showed"],
  "personality_snapshot": "2-3 sentence character description"
}`,
} as const;

// ============================================================
// Backend: icebreaker generation (LLM)
// ============================================================

export const ICEBREAKER_GENERATION = {
  /** OpenRouter model ID for icebreaker generation. */
  model: 'google/gemini-2.0-flash-001',
  /** Higher = more creative. 0.9 for varied, surprising openers. */
  temperature: 0.9,
  /** System prompt — tell the LLM how to create an icebreaker. */
  systemPrompt: `Given this transcript from an art installation conversation, generate one compelling icebreaker (1-2 sentences) that:
- references something specific from the conversation
- is open-ended enough to start a new conversation with a different person
- feels intriguing and slightly mysterious
- does NOT reveal private information

Return ONLY the icebreaker text, nothing else.`,
} as const;

// ============================================================
// Tablet: portrait capture
// ============================================================

export const PORTRAIT = {
  /** CSS blur radius in pixels for the blurred portrait. */
  blurRadius: 25,
  /** JPEG export quality (0–1). */
  jpegQuality: 0.85,
  /** Delay (ms) after conversation starts before capturing portrait. */
  captureDelayMs: 5000,
  /** Minimum blob size in bytes — below this, the frame is likely black. */
  minBlobSize: 1024,
} as const;

// ============================================================
// Tablet: cold-start first messages (no previous visitor)
// ============================================================

export const COLD_START = {
  /** German opener when there's no icebreaker from a previous visitor. */
  firstMessageDe:
    'Jemand war gerade hier vor dir. Sie haben etwas hinterlassen. Ich bin neugierig — was bringst du mit?',
  /** English opener when there's no icebreaker from a previous visitor. */
  firstMessageEn:
    'Someone was just here before you. They left something behind. I am curious — what do you bring?',
} as const;

// ============================================================
// Style influence block template
// ============================================================

export const STYLE_INFLUENCE = {
  /** Max characteristic phrases to include in the style block. */
  maxPhrases: 5,
  /** Max favorite words to include in the style block. */
  maxFavoriteWords: 5,
} as const;
