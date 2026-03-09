import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// Database type — matches the SQL schema exactly.
// Used to produce a fully-typed Supabase client via
// SupabaseClient<Database>.
//
// Each table must include `Relationships: []` to satisfy
// the GenericTable constraint in @supabase/postgrest-js v2.
// ============================================================

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          created_at: string;
          ended_at: string | null;
          mode: 'text_term' | 'term_only' | 'chain';
          term: string;
          context_text: string | null;
          parent_session_id: string | null;
          language_detected: string | null;
          duration_seconds: number | null;
          turn_count: number | null;
          card_taken: boolean | null;
          elevenlabs_conversation_id: string | null;
          audio_url: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          ended_at?: string | null;
          mode: 'text_term' | 'term_only' | 'chain';
          term: string;
          context_text?: string | null;
          parent_session_id?: string | null;
          language_detected?: string | null;
          duration_seconds?: number | null;
          turn_count?: number | null;
          card_taken?: boolean | null;
          elevenlabs_conversation_id?: string | null;
          audio_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          ended_at?: string | null;
          mode?: 'text_term' | 'term_only' | 'chain';
          term?: string;
          context_text?: string | null;
          parent_session_id?: string | null;
          language_detected?: string | null;
          duration_seconds?: number | null;
          turn_count?: number | null;
          card_taken?: boolean | null;
          elevenlabs_conversation_id?: string | null;
          audio_url?: string | null;
        };
        Relationships: [];
      };

      turns: {
        Row: {
          id: string;
          session_id: string | null;
          turn_number: number;
          role: 'visitor' | 'agent';
          content: string;
          language: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          turn_number: number;
          role: 'visitor' | 'agent';
          content: string;
          language?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          turn_number?: number;
          role?: 'visitor' | 'agent';
          content?: string;
          language?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      definitions: {
        Row: {
          id: string;
          session_id: string | null;
          term: string;
          definition_text: string;
          citations: string[] | null;
          language: string;
          chain_depth: number | null;
          created_at: string;
          // pgvector returns number[] via the JS client
          embedding: number[] | null;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          term: string;
          definition_text: string;
          citations?: string[] | null;
          language: string;
          chain_depth?: number | null;
          created_at?: string;
          embedding?: number[] | null;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          term?: string;
          definition_text?: string;
          citations?: string[] | null;
          language?: string;
          chain_depth?: number | null;
          created_at?: string;
          embedding?: number[] | null;
        };
        Relationships: [];
      };

      print_queue: {
        Row: {
          id: string;
          session_id: string | null;
          payload: Record<string, unknown>;
          printer_config: Record<string, unknown> | null;
          status: 'pending' | 'printing' | 'done' | 'error';
          created_at: string;
          printed_at: string | null;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          payload: Record<string, unknown>;
          printer_config?: Record<string, unknown> | null;
          status?: 'pending' | 'printing' | 'done' | 'error';
          created_at?: string;
          printed_at?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          payload?: Record<string, unknown>;
          printer_config?: Record<string, unknown> | null;
          status?: 'pending' | 'printing' | 'done' | 'error';
          created_at?: string;
          printed_at?: string | null;
        };
        Relationships: [];
      };

      chain_state: {
        Row: {
          id: string;
          definition_id: string | null;
          is_active: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          definition_id?: string | null;
          is_active?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          definition_id?: string | null;
          is_active?: boolean | null;
          created_at?: string;
        };
        Relationships: [];
      };

      installation_config: {
        Row: {
          id: string;
          mode: 'text_term' | 'term_only' | 'chain';
          active_term: string | null;
          active_text_id: string | null;
          program: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mode?: 'text_term' | 'term_only' | 'chain';
          active_term?: string | null;
          active_text_id?: string | null;
          program?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mode?: 'text_term' | 'term_only' | 'chain';
          active_term?: string | null;
          active_text_id?: string | null;
          program?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      texts: {
        Row: {
          id: string;
          title: string;
          content_de: string | null;
          content_en: string | null;
          terms: string[];
          created_at: string;
        };
        Insert: {
          id: string;
          title: string;
          content_de?: string | null;
          content_en?: string | null;
          terms: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content_de?: string | null;
          content_en?: string | null;
          terms?: string[];
          created_at?: string;
        };
        Relationships: [];
      };

      tts_cache: {
        Row: {
          id: string;
          cache_key: string;
          audio_base64_parts: string[];
          word_timestamps: unknown[];
          text_length: number;
          voice_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cache_key: string;
          audio_base64_parts: string[];
          word_timestamps: unknown[];
          text_length: number;
          voice_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          cache_key?: string;
          audio_base64_parts?: string[];
          word_timestamps?: unknown[];
          text_length?: number;
          voice_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ============================================================
// Typed client factory
// ============================================================

/**
 * Returns a fully-typed Supabase client.
 *
 * - In the tablet (browser): pass the anon/public key.
 * - In the backend / printer bridge: pass the service-role key for
 *   full access that bypasses RLS.
 */
export function createSupabaseClient(
  url: string,
  key: string,
): SupabaseClient<Database> {
  return createClient<Database>(url, key);
}
