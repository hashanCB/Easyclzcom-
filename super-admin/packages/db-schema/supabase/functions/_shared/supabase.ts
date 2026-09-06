// Supabase client factories for edge functions.
//
// IMPORTANT: never call `signInWithPassword` on a client you also use for
// privileged DB work. supabase-js stores the resulting session on that client
// instance; subsequent .from(...) calls then carry the user's JWT instead of
// the service-role key, and RLS suddenly applies. Always use:
//   - `verifyClient()` to verify a password (a throwaway anon client)
//   - `adminClient()` for DB/admin work that must bypass RLS
//
// `userClient(req)` forwards the caller's Authorization header so RLS *does*
// apply — use it for actions authorized as the calling user.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing Supabase env vars (SUPABASE_URL / SERVICE_ROLE / ANON).');
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Throwaway anon client used only for password verification via
// signInWithPassword. Never reuse it for privileged DB work.
export function verifyClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}
