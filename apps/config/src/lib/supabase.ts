import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  document.body.innerHTML = `
    <div style="
      display:flex;align-items:center;justify-content:center;
      height:100vh;background:#000000;color:#e05b5b;
      font-family:Helvetica,"Helvetica Neue",Arial,sans-serif;font-size:15px;text-align:center;
      flex-direction:column;gap:12px;
    ">
      <strong>Configuration error</strong>
      <span style="color:#777777;font-size:13px;">
        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env
      </span>
    </div>
  `;
  throw new Error('Missing Supabase environment variables');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/** Returns the current session, or null if not authenticated. */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[supabase] getSession error:', error.message);
    return null;
  }
  return data.session;
}

/** Sign in with email + password. Returns error string or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.message;
  return null;
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
