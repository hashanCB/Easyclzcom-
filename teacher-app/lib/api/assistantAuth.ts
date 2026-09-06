import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import type { SupabaseSession } from './auth';

export interface AssistantProfile {
  id: string;
  teacher_id: string;
  name: string;
  username: string;
  is_active: boolean;
}

export interface AssistantClassPerm {
  class_id: string;
  permission: 'attendance' | 'payment' | 'both' | null;
  can_add_student?: boolean;
}

export interface AssistantLoginResult {
  session: SupabaseSession;
  profile: AssistantProfile;
  permissions: AssistantClassPerm[];
}

// Supabase Auth: sign in with email + password
async function supabaseSignIn(email: string, password: string): Promise<SupabaseSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg: string = data?.error_description ?? data?.msg ?? 'Login failed';
    throw new Error(msg);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    token_type: data.token_type,
    user: { id: data.user.id, email: data.user.email },
  };
}

function restHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
  };
}

async function fetchProfile(userId: string, token: string): Promise<AssistantProfile | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/assistants?id=eq.${userId}&select=id,teacher_id,name,username,is_active&limit=1`,
    { headers: restHeaders(token) },
  );
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function fetchPermissions(assistantId: string, token: string): Promise<AssistantClassPerm[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/assistant_class_permissions?assistant_id=eq.${assistantId}&deleted_at=is.null&select=class_id,permission,can_add_student`,
    { headers: restHeaders(token) },
  );
  return res.json().catch(() => []);
}

export async function loginAssistant(
  username: string,
  password: string,
): Promise<AssistantLoginResult> {
  // Username format: asst_<teacherUsername>_<1|2>
  // Email format: asst_<teacherUsername>_<1|2>@assistants.local
  const email = `${username.toLowerCase().trim()}@assistants.local`;
  const session = await supabaseSignIn(email, password);

  const profile = await fetchProfile(session.user.id, session.access_token);
  if (!profile) throw new Error('Assistant account not found. Contact your teacher.');
  if (!profile.is_active) throw new Error('Your assistant account has been deactivated.');

  const permissions = await fetchPermissions(profile.id, session.access_token);

  return { session, profile, permissions };
}
