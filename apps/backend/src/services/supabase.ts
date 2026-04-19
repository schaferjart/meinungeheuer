import { createSupabaseClient } from '@denkfink/installation-core';

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseServiceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

/**
 * Supabase client using the service role key.
 * Bypasses RLS — use only in backend/server contexts.
 */
export const supabase = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey);
