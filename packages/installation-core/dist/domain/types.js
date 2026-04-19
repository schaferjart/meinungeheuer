import { z } from 'zod';
// ============================================================
// Primitive union types
// ============================================================
export const ModeSchema = z.enum(['text_term', 'term_only', 'chain']);
export const PrintStatusSchema = z.enum(['pending', 'printing', 'done', 'error']);
export const RoleSchema = z.enum(['visitor', 'agent']);
export const StateNameSchema = z.enum([
    'sleep',
    'welcome',
    'consent',
    'text_display',
    'term_prompt',
    'conversation',
    'synthesizing',
    'definition',
    'printing',
    'farewell',
]);
// ============================================================
// Table schemas — mirror the SQL schema exactly
// ============================================================
export const SessionSchema = z.object({
    id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
    ended_at: z.string().datetime({ offset: true }).nullable(),
    mode: ModeSchema,
    term: z.string(),
    context_text: z.string().nullable(),
    parent_session_id: z.string().uuid().nullable(),
    language_detected: z.string().nullable(),
    duration_seconds: z.number().int().nullable(),
    turn_count: z.number().int().nullable(),
    card_taken: z.boolean().nullable(),
    elevenlabs_conversation_id: z.string().nullable(),
    audio_url: z.string().nullable(),
});
export const TurnSchema = z.object({
    id: z.string().uuid(),
    session_id: z.string().uuid().nullable(),
    turn_number: z.number().int(),
    role: RoleSchema,
    content: z.string(),
    language: z.string().nullable(),
    created_at: z.string().datetime({ offset: true }),
});
export const DefinitionSchema = z.object({
    id: z.string().uuid(),
    session_id: z.string().uuid().nullable(),
    term: z.string(),
    definition_text: z.string(),
    citations: z.array(z.string()).nullable(),
    language: z.string(),
    chain_depth: z.number().int().nullable(),
    created_at: z.string().datetime({ offset: true }),
    // pgvector returns embeddings as number[] when fetched via the JS client.
    // null when not yet computed.
    embedding: z.array(z.number()).nullable(),
});
export const PrintQueueRowSchema = z.object({
    id: z.string().uuid(),
    session_id: z.string().uuid().nullable(),
    payload: z.record(z.unknown()),
    printer_config: z.record(z.unknown()).nullable(),
    status: PrintStatusSchema,
    created_at: z.string().datetime({ offset: true }),
    printed_at: z.string().datetime({ offset: true }).nullable(),
});
export const ChainStateSchema = z.object({
    id: z.string().uuid(),
    definition_id: z.string().uuid().nullable(),
    is_active: z.boolean().nullable(),
    created_at: z.string().datetime({ offset: true }),
});
export const InstallationConfigSchema = z.object({
    id: z.string().uuid(),
    mode: ModeSchema,
    active_term: z.string().nullable(),
    active_text_id: z.string().nullable(),
    updated_at: z.string().datetime({ offset: true }),
    program: z.string().default('aphorism'),
});
export const TextSchema = z.object({
    id: z.string(),
    title: z.string(),
    content_de: z.string().nullable(),
    content_en: z.string().nullable(),
    terms: z.array(z.string()),
    created_at: z.string().datetime({ offset: true }),
});
// ============================================================
// Insert shapes (omit server-generated fields)
// ============================================================
export const InsertSessionSchema = SessionSchema.omit({ id: true, created_at: true });
export const InsertTurnSchema = TurnSchema.omit({ id: true, created_at: true });
export const InsertDefinitionSchema = DefinitionSchema.omit({ id: true, created_at: true });
// ============================================================
// Voice chain types — used by the voice chain program
// ============================================================
export const SpeechProfileSchema = z.object({
    characteristic_phrases: z.array(z.string()),
    vocabulary_level: z.enum(['casual', 'conversational', 'formal', 'mixed']),
    favorite_words: z.array(z.string()),
    tone: z.string(),
    humor_style: z.string(),
    cadence_description: z.string(),
    topics_of_interest: z.array(z.string()),
    personality_snapshot: z.string(),
});
export const VoiceChainStateSchema = z.object({
    id: z.string().uuid(),
    session_id: z.string().uuid().nullable(),
    voice_clone_id: z.string().nullable(),
    voice_clone_status: z.enum(['pending', 'ready', 'failed', 'deleted']),
    speech_profile: SpeechProfileSchema.nullable(),
    icebreaker: z.string().nullable(),
    portrait_blurred_url: z.string().nullable(),
    chain_position: z.number().int(),
    created_at: z.string().datetime({ offset: true }),
});
// ============================================================
// PrintPayload — the typed shape stored in print_queue.payload
// ============================================================
export const PrintPayloadSchema = z.object({
    term: z.string(),
    definition_text: z.string(),
    citations: z.array(z.string()),
    language: z.string(),
    // Sequential visitor number shown on the card (e.g. "Visitor 42")
    session_number: z.number().int(),
    // For Mode C: reference text of the parent definition that seeded this one
    chain_ref: z.string().nullable(),
    timestamp: z.string().datetime({ offset: true }),
    // Optional print template override (e.g. 'dictionary_portrait')
    template: z.string().optional(),
    // Definition UUID — used to generate QR code linking to the archive page
    definition_id: z.string().uuid().optional(),
});
// ============================================================
// PortraitPrintPayload — pre-rendered images ready for printing
// ============================================================
export const PortraitPrintPayloadSchema = z.object({
    type: z.literal('portrait'),
    image_urls: z.array(z.object({
        name: z.string(),
        url: z.string().url(),
    })),
    job_id: z.string(),
    timestamp: z.string().datetime({ offset: true }),
});
// ============================================================
// SaveDefinitionPayload — ElevenLabs webhook tool call body
// ============================================================
export const SaveDefinitionPayloadSchema = z.object({
    session_id: z.string().uuid(),
    term: z.string(),
    definition_text: z.string(),
    citations: z.array(z.string()).optional(),
    language: z.string(),
    chain_depth: z.number().int().optional(),
});
//# sourceMappingURL=types.js.map