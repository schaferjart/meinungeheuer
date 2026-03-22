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
          // Language
          language: string | null;
          // Stage overrides
          stage_text_reading: boolean | null;
          stage_term_prompt: boolean | null;
          stage_portrait: boolean | null;
          stage_printing: boolean | null;
          // Face detection
          face_detection_enabled: boolean | null;
          face_wake_ms: number | null;
          face_sleep_ms: number | null;
          face_detection_interval_ms: number | null;
          face_min_confidence: number | null;
          // Timers
          welcome_duration_ms: number | null;
          term_prompt_duration_ms: number | null;
          definition_display_ms: number | null;
          farewell_duration_ms: number | null;
          print_timeout_ms: number | null;
          // ElevenLabs
          elevenlabs_agent_id: string | null;
          elevenlabs_voice_id: string | null;
          // Voice settings
          voice_stability: number | null;
          voice_similarity_boost: number | null;
          voice_style: number | null;
          voice_speaker_boost: boolean | null;
          // Voice chain config
          vc_remove_bg_noise: boolean | null;
          vc_retention_window: number | null;
          vc_profile_model: string | null;
          vc_profile_temperature: number | null;
          vc_icebreaker_model: string | null;
          vc_icebreaker_temperature: number | null;
          vc_cold_start_de: string | null;
          vc_cold_start_en: string | null;
          vc_max_phrases: number | null;
          vc_max_favorite_words: number | null;
          // Portrait capture
          portrait_capture_delay_ms: number | null;
          portrait_jpeg_quality: number | null;
          portrait_min_blob_size: number | null;
          portrait_blur_radius_css: number | null;
          // Display styling
          display_highlight_color: string | null;
          display_spoken_opacity: number | null;
          display_upcoming_opacity: number | null;
          display_font_size: string | null;
          display_line_height: number | null;
          display_letter_spacing: string | null;
          display_max_width: string | null;
        };
        Insert: {
          id?: string;
          mode?: 'text_term' | 'term_only' | 'chain';
          active_term?: string | null;
          active_text_id?: string | null;
          program?: string;
          updated_at?: string;
          language?: string | null;
          stage_text_reading?: boolean | null;
          stage_term_prompt?: boolean | null;
          stage_portrait?: boolean | null;
          stage_printing?: boolean | null;
          face_detection_enabled?: boolean | null;
          face_wake_ms?: number | null;
          face_sleep_ms?: number | null;
          face_detection_interval_ms?: number | null;
          face_min_confidence?: number | null;
          welcome_duration_ms?: number | null;
          term_prompt_duration_ms?: number | null;
          definition_display_ms?: number | null;
          farewell_duration_ms?: number | null;
          print_timeout_ms?: number | null;
          elevenlabs_agent_id?: string | null;
          elevenlabs_voice_id?: string | null;
          voice_stability?: number | null;
          voice_similarity_boost?: number | null;
          voice_style?: number | null;
          voice_speaker_boost?: boolean | null;
          vc_remove_bg_noise?: boolean | null;
          vc_retention_window?: number | null;
          vc_profile_model?: string | null;
          vc_profile_temperature?: number | null;
          vc_icebreaker_model?: string | null;
          vc_icebreaker_temperature?: number | null;
          vc_cold_start_de?: string | null;
          vc_cold_start_en?: string | null;
          vc_max_phrases?: number | null;
          vc_max_favorite_words?: number | null;
          portrait_capture_delay_ms?: number | null;
          portrait_jpeg_quality?: number | null;
          portrait_min_blob_size?: number | null;
          portrait_blur_radius_css?: number | null;
          display_highlight_color?: string | null;
          display_spoken_opacity?: number | null;
          display_upcoming_opacity?: number | null;
          display_font_size?: string | null;
          display_line_height?: number | null;
          display_letter_spacing?: string | null;
          display_max_width?: string | null;
        };
        Update: {
          id?: string;
          mode?: 'text_term' | 'term_only' | 'chain';
          active_term?: string | null;
          active_text_id?: string | null;
          program?: string;
          updated_at?: string;
          language?: string | null;
          stage_text_reading?: boolean | null;
          stage_term_prompt?: boolean | null;
          stage_portrait?: boolean | null;
          stage_printing?: boolean | null;
          face_detection_enabled?: boolean | null;
          face_wake_ms?: number | null;
          face_sleep_ms?: number | null;
          face_detection_interval_ms?: number | null;
          face_min_confidence?: number | null;
          welcome_duration_ms?: number | null;
          term_prompt_duration_ms?: number | null;
          definition_display_ms?: number | null;
          farewell_duration_ms?: number | null;
          print_timeout_ms?: number | null;
          elevenlabs_agent_id?: string | null;
          elevenlabs_voice_id?: string | null;
          voice_stability?: number | null;
          voice_similarity_boost?: number | null;
          voice_style?: number | null;
          voice_speaker_boost?: boolean | null;
          vc_remove_bg_noise?: boolean | null;
          vc_retention_window?: number | null;
          vc_profile_model?: string | null;
          vc_profile_temperature?: number | null;
          vc_icebreaker_model?: string | null;
          vc_icebreaker_temperature?: number | null;
          vc_cold_start_de?: string | null;
          vc_cold_start_en?: string | null;
          vc_max_phrases?: number | null;
          vc_max_favorite_words?: number | null;
          portrait_capture_delay_ms?: number | null;
          portrait_jpeg_quality?: number | null;
          portrait_min_blob_size?: number | null;
          portrait_blur_radius_css?: number | null;
          display_highlight_color?: string | null;
          display_spoken_opacity?: number | null;
          display_upcoming_opacity?: number | null;
          display_font_size?: string | null;
          display_line_height?: number | null;
          display_letter_spacing?: string | null;
          display_max_width?: string | null;
        };
        Relationships: [];
      };

      prompts: {
        Row: {
          id: string;
          program_id: string;
          system_prompt: string | null;
          first_message_de: string | null;
          first_message_en: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          system_prompt?: string | null;
          first_message_de?: string | null;
          first_message_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          system_prompt?: string | null;
          first_message_de?: string | null;
          first_message_en?: string | null;
          created_at?: string;
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

      voice_chain_state: {
        Row: {
          id: string;
          session_id: string | null;
          voice_clone_id: string | null;
          voice_clone_status: 'pending' | 'ready' | 'failed' | 'deleted';
          speech_profile: Record<string, unknown> | null;
          icebreaker: string | null;
          portrait_blurred_url: string | null;
          chain_position: number;
          is_active: boolean;
          visitor_audio_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          voice_clone_id?: string | null;
          voice_clone_status?: 'pending' | 'ready' | 'failed' | 'deleted';
          speech_profile?: Record<string, unknown> | null;
          icebreaker?: string | null;
          portrait_blurred_url?: string | null;
          chain_position?: number;
          is_active?: boolean;
          visitor_audio_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          voice_clone_id?: string | null;
          voice_clone_status?: 'pending' | 'ready' | 'failed' | 'deleted';
          speech_profile?: Record<string, unknown> | null;
          icebreaker?: string | null;
          portrait_blurred_url?: string | null;
          chain_position?: number;
          is_active?: boolean;
          visitor_audio_path?: string | null;
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
