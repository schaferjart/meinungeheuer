import { z } from 'zod';
import { ModeSchema } from '@meinungeheuer/shared';
import type { Mode } from '@meinungeheuer/shared';

// ============================================================
// Response schemas
// ============================================================

export const ConfigResponseSchema = z.object({
  mode: ModeSchema,
  term: z.string(),
  contextText: z.string().nullable().optional(),
  parentSessionId: z.string().uuid().nullable().optional(),
  text: z.object({
    id: z.string(),
    title: z.string(),
    content_de: z.string().nullable(),
    content_en: z.string().nullable(),
    terms: z.array(z.string()),
  }).optional(),
  chain_context: z.object({
    term: z.string(),
    definition_text: z.string(),
    chain_depth: z.number(),
    language: z.string(),
  }).nullable().optional(),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

export const SessionStartResponseSchema = z.object({
  sessionId: z.string().uuid(),
});
export type SessionStartResponse = z.infer<typeof SessionStartResponseSchema>;

// ============================================================
// Helpers
// ============================================================

async function apiFetch<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json: unknown = await res.json();
  return schema.parse(json);
}

// ============================================================
// Endpoints
// ============================================================

export async function fetchConfig(backendUrl: string): Promise<ConfigResponse> {
  return apiFetch(
    `${backendUrl}/api/config`,
    { method: 'GET' },
    ConfigResponseSchema,
  );
}

export interface StartSessionParams {
  mode: Mode;
  term: string;
  contextText: string | null;
  parentSessionId: string | null;
  language: string;
}

export async function startSession(
  backendUrl: string,
  params: StartSessionParams,
): Promise<SessionStartResponse> {
  return apiFetch(
    `${backendUrl}/api/session/start`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    SessionStartResponseSchema,
  );
}
