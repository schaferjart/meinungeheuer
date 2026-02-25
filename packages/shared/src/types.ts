import { z } from 'zod';

// ============================================================
// Primitive union types
// ============================================================

export const ModeSchema = z.enum(['text_term', 'term_only', 'chain']);
export type Mode = z.infer<typeof ModeSchema>;

export const PrintStatusSchema = z.enum(['pending', 'printing', 'done', 'error']);
export type PrintStatus = z.infer<typeof PrintStatusSchema>;

export const RoleSchema = z.enum(['visitor', 'agent']);
export type Role = z.infer<typeof RoleSchema>;

export const StateNameSchema = z.enum([
  'sleep',
  'welcome',
  'text_display',
  'term_prompt',
  'conversation',
  'synthesizing',
  'definition',
  'printing',
  'farewell',
]);
export type StateName = z.infer<typeof StateNameSchema>;

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
export type Session = z.infer<typeof SessionSchema>;

export const TurnSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  turn_number: z.number().int(),
  role: RoleSchema,
  content: z.string(),
  language: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export type Turn = z.infer<typeof TurnSchema>;

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
export type Definition = z.infer<typeof DefinitionSchema>;

export const PrintQueueRowSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  payload: z.record(z.unknown()),
  printer_config: z.record(z.unknown()).nullable(),
  status: PrintStatusSchema,
  created_at: z.string().datetime({ offset: true }),
  printed_at: z.string().datetime({ offset: true }).nullable(),
});
export type PrintQueueRow = z.infer<typeof PrintQueueRowSchema>;

export const ChainStateSchema = z.object({
  id: z.string().uuid(),
  definition_id: z.string().uuid().nullable(),
  is_active: z.boolean().nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export type ChainState = z.infer<typeof ChainStateSchema>;

export const InstallationConfigSchema = z.object({
  id: z.string().uuid(),
  mode: ModeSchema,
  active_term: z.string().nullable(),
  active_text_id: z.string().nullable(),
  updated_at: z.string().datetime({ offset: true }),
});
export type InstallationConfig = z.infer<typeof InstallationConfigSchema>;

export const TextSchema = z.object({
  id: z.string(),
  title: z.string(),
  content_de: z.string().nullable(),
  content_en: z.string().nullable(),
  terms: z.array(z.string()),
  created_at: z.string().datetime({ offset: true }),
});
export type Text = z.infer<typeof TextSchema>;

// ============================================================
// Insert shapes (omit server-generated fields)
// ============================================================

export const InsertSessionSchema = SessionSchema.omit({ id: true, created_at: true });
export type InsertSession = z.infer<typeof InsertSessionSchema>;

export const InsertTurnSchema = TurnSchema.omit({ id: true, created_at: true });
export type InsertTurn = z.infer<typeof InsertTurnSchema>;

export const InsertDefinitionSchema = DefinitionSchema.omit({ id: true, created_at: true });
export type InsertDefinition = z.infer<typeof InsertDefinitionSchema>;

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
});
export type PrintPayload = z.infer<typeof PrintPayloadSchema>;

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
export type SaveDefinitionPayload = z.infer<typeof SaveDefinitionPayloadSchema>;
