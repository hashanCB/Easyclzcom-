import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_URL, getServiceRoleKey } from './env';

export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
