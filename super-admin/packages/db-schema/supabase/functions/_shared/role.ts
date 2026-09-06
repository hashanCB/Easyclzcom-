// Pull the caller's user_id + role from the verified JWT.
// Returns null when no/invalid token is present.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { adminClient } from './supabase.ts';

export type CallerRole = 'super_admin' | 'teacher' | 'assistant' | 'student';

export interface Caller {
  user_id: string;
  role: CallerRole;
}

export async function getCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const admin: SupabaseClient = adminClient();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (!roleRow) return null;
  return { user_id: userData.user.id, role: roleRow.role as CallerRole };
}
