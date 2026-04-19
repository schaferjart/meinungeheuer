import { createClient } from '@supabase/supabase-js';
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
export function createSupabaseClient(url, key) {
    return createClient(url, key);
}
//# sourceMappingURL=supabase.js.map