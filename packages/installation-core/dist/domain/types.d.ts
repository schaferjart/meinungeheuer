import { z } from 'zod';
export declare const ModeSchema: z.ZodEnum<["text_term", "term_only", "chain"]>;
export type Mode = z.infer<typeof ModeSchema>;
export declare const PrintStatusSchema: z.ZodEnum<["pending", "printing", "done", "error"]>;
export type PrintStatus = z.infer<typeof PrintStatusSchema>;
export declare const RoleSchema: z.ZodEnum<["visitor", "agent"]>;
export type Role = z.infer<typeof RoleSchema>;
export declare const StateNameSchema: z.ZodEnum<["sleep", "welcome", "consent", "text_display", "term_prompt", "conversation", "synthesizing", "definition", "printing", "farewell"]>;
export type StateName = z.infer<typeof StateNameSchema>;
export declare const SessionSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodString;
    ended_at: z.ZodNullable<z.ZodString>;
    mode: z.ZodEnum<["text_term", "term_only", "chain"]>;
    term: z.ZodString;
    context_text: z.ZodNullable<z.ZodString>;
    parent_session_id: z.ZodNullable<z.ZodString>;
    language_detected: z.ZodNullable<z.ZodString>;
    duration_seconds: z.ZodNullable<z.ZodNumber>;
    turn_count: z.ZodNullable<z.ZodNumber>;
    card_taken: z.ZodNullable<z.ZodBoolean>;
    elevenlabs_conversation_id: z.ZodNullable<z.ZodString>;
    audio_url: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    ended_at: string | null;
    mode: "text_term" | "term_only" | "chain";
    term: string;
    context_text: string | null;
    parent_session_id: string | null;
    language_detected: string | null;
    duration_seconds: number | null;
    turn_count: number | null;
    card_taken: boolean | null;
    elevenlabs_conversation_id: string | null;
    audio_url: string | null;
}, {
    id: string;
    created_at: string;
    ended_at: string | null;
    mode: "text_term" | "term_only" | "chain";
    term: string;
    context_text: string | null;
    parent_session_id: string | null;
    language_detected: string | null;
    duration_seconds: number | null;
    turn_count: number | null;
    card_taken: boolean | null;
    elevenlabs_conversation_id: string | null;
    audio_url: string | null;
}>;
export type Session = z.infer<typeof SessionSchema>;
export declare const TurnSchema: z.ZodObject<{
    id: z.ZodString;
    session_id: z.ZodNullable<z.ZodString>;
    turn_number: z.ZodNumber;
    role: z.ZodEnum<["visitor", "agent"]>;
    content: z.ZodString;
    language: z.ZodNullable<z.ZodString>;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    session_id: string | null;
    turn_number: number;
    role: "visitor" | "agent";
    content: string;
    language: string | null;
}, {
    id: string;
    created_at: string;
    session_id: string | null;
    turn_number: number;
    role: "visitor" | "agent";
    content: string;
    language: string | null;
}>;
export type Turn = z.infer<typeof TurnSchema>;
export declare const DefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    session_id: z.ZodNullable<z.ZodString>;
    term: z.ZodString;
    definition_text: z.ZodString;
    citations: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    language: z.ZodString;
    chain_depth: z.ZodNullable<z.ZodNumber>;
    created_at: z.ZodString;
    embedding: z.ZodNullable<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    term: string;
    session_id: string | null;
    language: string;
    definition_text: string;
    citations: string[] | null;
    chain_depth: number | null;
    embedding: number[] | null;
}, {
    id: string;
    created_at: string;
    term: string;
    session_id: string | null;
    language: string;
    definition_text: string;
    citations: string[] | null;
    chain_depth: number | null;
    embedding: number[] | null;
}>;
export type Definition = z.infer<typeof DefinitionSchema>;
export declare const PrintQueueRowSchema: z.ZodObject<{
    id: z.ZodString;
    session_id: z.ZodNullable<z.ZodString>;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    printer_config: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    status: z.ZodEnum<["pending", "printing", "done", "error"]>;
    created_at: z.ZodString;
    printed_at: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "printing" | "done" | "error";
    id: string;
    created_at: string;
    session_id: string | null;
    payload: Record<string, unknown>;
    printer_config: Record<string, unknown> | null;
    printed_at: string | null;
}, {
    status: "pending" | "printing" | "done" | "error";
    id: string;
    created_at: string;
    session_id: string | null;
    payload: Record<string, unknown>;
    printer_config: Record<string, unknown> | null;
    printed_at: string | null;
}>;
export type PrintQueueRow = z.infer<typeof PrintQueueRowSchema>;
export declare const ChainStateSchema: z.ZodObject<{
    id: z.ZodString;
    definition_id: z.ZodNullable<z.ZodString>;
    is_active: z.ZodNullable<z.ZodBoolean>;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    definition_id: string | null;
    is_active: boolean | null;
}, {
    id: string;
    created_at: string;
    definition_id: string | null;
    is_active: boolean | null;
}>;
export type ChainState = z.infer<typeof ChainStateSchema>;
export declare const InstallationConfigSchema: z.ZodObject<{
    id: z.ZodString;
    mode: z.ZodEnum<["text_term", "term_only", "chain"]>;
    active_term: z.ZodNullable<z.ZodString>;
    active_text_id: z.ZodNullable<z.ZodString>;
    updated_at: z.ZodString;
    program: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    mode: "text_term" | "term_only" | "chain";
    active_term: string | null;
    active_text_id: string | null;
    updated_at: string;
    program: string;
}, {
    id: string;
    mode: "text_term" | "term_only" | "chain";
    active_term: string | null;
    active_text_id: string | null;
    updated_at: string;
    program?: string | undefined;
}>;
export type InstallationConfig = z.infer<typeof InstallationConfigSchema>;
export declare const TextSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    content_de: z.ZodNullable<z.ZodString>;
    content_en: z.ZodNullable<z.ZodString>;
    terms: z.ZodArray<z.ZodString, "many">;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    title: string;
    content_de: string | null;
    content_en: string | null;
    terms: string[];
}, {
    id: string;
    created_at: string;
    title: string;
    content_de: string | null;
    content_en: string | null;
    terms: string[];
}>;
export type Text = z.infer<typeof TextSchema>;
export declare const InsertSessionSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    created_at: z.ZodString;
    ended_at: z.ZodNullable<z.ZodString>;
    mode: z.ZodEnum<["text_term", "term_only", "chain"]>;
    term: z.ZodString;
    context_text: z.ZodNullable<z.ZodString>;
    parent_session_id: z.ZodNullable<z.ZodString>;
    language_detected: z.ZodNullable<z.ZodString>;
    duration_seconds: z.ZodNullable<z.ZodNumber>;
    turn_count: z.ZodNullable<z.ZodNumber>;
    card_taken: z.ZodNullable<z.ZodBoolean>;
    elevenlabs_conversation_id: z.ZodNullable<z.ZodString>;
    audio_url: z.ZodNullable<z.ZodString>;
}, "id" | "created_at">, "strip", z.ZodTypeAny, {
    ended_at: string | null;
    mode: "text_term" | "term_only" | "chain";
    term: string;
    context_text: string | null;
    parent_session_id: string | null;
    language_detected: string | null;
    duration_seconds: number | null;
    turn_count: number | null;
    card_taken: boolean | null;
    elevenlabs_conversation_id: string | null;
    audio_url: string | null;
}, {
    ended_at: string | null;
    mode: "text_term" | "term_only" | "chain";
    term: string;
    context_text: string | null;
    parent_session_id: string | null;
    language_detected: string | null;
    duration_seconds: number | null;
    turn_count: number | null;
    card_taken: boolean | null;
    elevenlabs_conversation_id: string | null;
    audio_url: string | null;
}>;
export type InsertSession = z.infer<typeof InsertSessionSchema>;
export declare const InsertTurnSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    session_id: z.ZodNullable<z.ZodString>;
    turn_number: z.ZodNumber;
    role: z.ZodEnum<["visitor", "agent"]>;
    content: z.ZodString;
    language: z.ZodNullable<z.ZodString>;
    created_at: z.ZodString;
}, "id" | "created_at">, "strip", z.ZodTypeAny, {
    session_id: string | null;
    turn_number: number;
    role: "visitor" | "agent";
    content: string;
    language: string | null;
}, {
    session_id: string | null;
    turn_number: number;
    role: "visitor" | "agent";
    content: string;
    language: string | null;
}>;
export type InsertTurn = z.infer<typeof InsertTurnSchema>;
export declare const InsertDefinitionSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    session_id: z.ZodNullable<z.ZodString>;
    term: z.ZodString;
    definition_text: z.ZodString;
    citations: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    language: z.ZodString;
    chain_depth: z.ZodNullable<z.ZodNumber>;
    created_at: z.ZodString;
    embedding: z.ZodNullable<z.ZodArray<z.ZodNumber, "many">>;
}, "id" | "created_at">, "strip", z.ZodTypeAny, {
    term: string;
    session_id: string | null;
    language: string;
    definition_text: string;
    citations: string[] | null;
    chain_depth: number | null;
    embedding: number[] | null;
}, {
    term: string;
    session_id: string | null;
    language: string;
    definition_text: string;
    citations: string[] | null;
    chain_depth: number | null;
    embedding: number[] | null;
}>;
export type InsertDefinition = z.infer<typeof InsertDefinitionSchema>;
export declare const SpeechProfileSchema: z.ZodObject<{
    characteristic_phrases: z.ZodArray<z.ZodString, "many">;
    vocabulary_level: z.ZodEnum<["casual", "conversational", "formal", "mixed"]>;
    favorite_words: z.ZodArray<z.ZodString, "many">;
    tone: z.ZodString;
    humor_style: z.ZodString;
    cadence_description: z.ZodString;
    topics_of_interest: z.ZodArray<z.ZodString, "many">;
    personality_snapshot: z.ZodString;
}, "strip", z.ZodTypeAny, {
    characteristic_phrases: string[];
    vocabulary_level: "casual" | "conversational" | "formal" | "mixed";
    favorite_words: string[];
    tone: string;
    humor_style: string;
    cadence_description: string;
    topics_of_interest: string[];
    personality_snapshot: string;
}, {
    characteristic_phrases: string[];
    vocabulary_level: "casual" | "conversational" | "formal" | "mixed";
    favorite_words: string[];
    tone: string;
    humor_style: string;
    cadence_description: string;
    topics_of_interest: string[];
    personality_snapshot: string;
}>;
export type SpeechProfile = z.infer<typeof SpeechProfileSchema>;
export declare const VoiceChainStateSchema: z.ZodObject<{
    id: z.ZodString;
    session_id: z.ZodNullable<z.ZodString>;
    voice_clone_id: z.ZodNullable<z.ZodString>;
    voice_clone_status: z.ZodEnum<["pending", "ready", "failed", "deleted"]>;
    speech_profile: z.ZodNullable<z.ZodObject<{
        characteristic_phrases: z.ZodArray<z.ZodString, "many">;
        vocabulary_level: z.ZodEnum<["casual", "conversational", "formal", "mixed"]>;
        favorite_words: z.ZodArray<z.ZodString, "many">;
        tone: z.ZodString;
        humor_style: z.ZodString;
        cadence_description: z.ZodString;
        topics_of_interest: z.ZodArray<z.ZodString, "many">;
        personality_snapshot: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        characteristic_phrases: string[];
        vocabulary_level: "casual" | "conversational" | "formal" | "mixed";
        favorite_words: string[];
        tone: string;
        humor_style: string;
        cadence_description: string;
        topics_of_interest: string[];
        personality_snapshot: string;
    }, {
        characteristic_phrases: string[];
        vocabulary_level: "casual" | "conversational" | "formal" | "mixed";
        favorite_words: string[];
        tone: string;
        humor_style: string;
        cadence_description: string;
        topics_of_interest: string[];
        personality_snapshot: string;
    }>>;
    icebreaker: z.ZodNullable<z.ZodString>;
    portrait_blurred_url: z.ZodNullable<z.ZodString>;
    chain_position: z.ZodNumber;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    session_id: string | null;
    voice_clone_id: string | null;
    voice_clone_status: "pending" | "ready" | "failed" | "deleted";
    speech_profile: {
        characteristic_phrases: string[];
        vocabulary_level: "casual" | "conversational" | "formal" | "mixed";
        favorite_words: string[];
        tone: string;
        humor_style: string;
        cadence_description: string;
        topics_of_interest: string[];
        personality_snapshot: string;
    } | null;
    icebreaker: string | null;
    portrait_blurred_url: string | null;
    chain_position: number;
}, {
    id: string;
    created_at: string;
    session_id: string | null;
    voice_clone_id: string | null;
    voice_clone_status: "pending" | "ready" | "failed" | "deleted";
    speech_profile: {
        characteristic_phrases: string[];
        vocabulary_level: "casual" | "conversational" | "formal" | "mixed";
        favorite_words: string[];
        tone: string;
        humor_style: string;
        cadence_description: string;
        topics_of_interest: string[];
        personality_snapshot: string;
    } | null;
    icebreaker: string | null;
    portrait_blurred_url: string | null;
    chain_position: number;
}>;
export type VoiceChainState = z.infer<typeof VoiceChainStateSchema>;
export declare const PrintPayloadSchema: z.ZodObject<{
    term: z.ZodString;
    definition_text: z.ZodString;
    citations: z.ZodArray<z.ZodString, "many">;
    language: z.ZodString;
    session_number: z.ZodNumber;
    chain_ref: z.ZodNullable<z.ZodString>;
    timestamp: z.ZodString;
    template: z.ZodOptional<z.ZodString>;
    definition_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    term: string;
    language: string;
    definition_text: string;
    citations: string[];
    session_number: number;
    chain_ref: string | null;
    timestamp: string;
    definition_id?: string | undefined;
    template?: string | undefined;
}, {
    term: string;
    language: string;
    definition_text: string;
    citations: string[];
    session_number: number;
    chain_ref: string | null;
    timestamp: string;
    definition_id?: string | undefined;
    template?: string | undefined;
}>;
export type PrintPayload = z.infer<typeof PrintPayloadSchema>;
export declare const PortraitPrintPayloadSchema: z.ZodObject<{
    type: z.ZodLiteral<"portrait">;
    image_urls: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        url: string;
    }, {
        name: string;
        url: string;
    }>, "many">;
    job_id: z.ZodString;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "portrait";
    timestamp: string;
    image_urls: {
        name: string;
        url: string;
    }[];
    job_id: string;
}, {
    type: "portrait";
    timestamp: string;
    image_urls: {
        name: string;
        url: string;
    }[];
    job_id: string;
}>;
export type PortraitPrintPayload = z.infer<typeof PortraitPrintPayloadSchema>;
export declare const SaveDefinitionPayloadSchema: z.ZodObject<{
    session_id: z.ZodString;
    term: z.ZodString;
    definition_text: z.ZodString;
    citations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    language: z.ZodString;
    chain_depth: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    term: string;
    session_id: string;
    language: string;
    definition_text: string;
    citations?: string[] | undefined;
    chain_depth?: number | undefined;
}, {
    term: string;
    session_id: string;
    language: string;
    definition_text: string;
    citations?: string[] | undefined;
    chain_depth?: number | undefined;
}>;
export type SaveDefinitionPayload = z.infer<typeof SaveDefinitionPayloadSchema>;
//# sourceMappingURL=types.d.ts.map