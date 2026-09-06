import { FUNCTIONS_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

export interface AssistantClassPermission {
  id: string;
  class_id: string;
  permission: 'attendance' | 'payment' | 'both' | null;
  can_add_student: boolean;
}

export interface Assistant {
  id: string;
  teacher_id: string;
  name: string;
  phone: string;
  username: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface CreateAssistantResult {
  assistant_id: string;
  username: string;
  password: string;
}

async function callFn(name: string, body: Record<string, unknown>, token: string) {
  if (!token) throw new Error('Your session has expired. Please log out and log in again.');
  if (!FUNCTIONS_URL || FUNCTIONS_URL.startsWith('/')) {
    throw new Error('Server URL is not configured (EXPO_PUBLIC_SUPABASE_URL missing).');
  }

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.');
  }

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON body */ }

  if (!res.ok) {
    const errObj = (data.error ?? {}) as { code?: string; message?: string };
    const code = errObj.code ?? '';

    if (code === 'pro_required') throw new Error('Assistant accounts require an active Pro subscription.');
    if (code === 'cap_reached') throw new Error('You already have the maximum of 2 assistants.');

    if (res.status === 401) {
      throw new Error('Your session has expired. Please log out and log in again.');
    }
    if (res.status === 404) {
      throw new Error(`The "${name}" function is not deployed on the server.`);
    }

    // Surface whatever the server gave us, plus the status for diagnosis.
    const serverMsg =
      errObj.message ??
      (typeof data.message === 'string' ? data.message : undefined) ??
      (typeof data.msg === 'string' ? data.msg : undefined) ??
      (typeof data.error === 'string' ? data.error : undefined) ??
      (raw ? raw.slice(0, 200) : 'Unknown error');
    throw new Error(`Request failed (${res.status}): ${serverMsg}`);
  }
  return data;
}

function restHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
  };
}

export async function fetchAssistants(token: string): Promise<Assistant[]> {
  const url = `${SUPABASE_URL}/rest/v1/assistants?select=*&deleted_at=is.null&order=created_at.asc`;
  const res = await fetch(url, { headers: restHeaders(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

export async function fetchAssistantPermissions(
  assistantId: string,
  token: string,
): Promise<AssistantClassPermission[]> {
  const url = `${SUPABASE_URL}/rest/v1/assistant_class_permissions?assistant_id=eq.${assistantId}&deleted_at=is.null&select=id,class_id,permission,can_add_student`;
  const res = await fetch(url, { headers: restHeaders(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

export async function createAssistant(
  name: string,
  phone: string,
  classPermissions: { class_id: string; permission: string | null; can_add_student?: boolean }[],
  token: string,
): Promise<CreateAssistantResult> {
  const data = await callFn('create_assistant', { name, phone, class_permissions: classPermissions }, token);
  return data as unknown as CreateAssistantResult;
}

export async function updateAssistant(
  assistantId: string,
  updates: {
    name?: string;
    phone?: string;
    is_active?: boolean;
    class_permissions?: { class_id: string; permission: string | null; can_add_student?: boolean }[];
  },
  token: string,
): Promise<void> {
  await callFn('update_assistant', { assistant_id: assistantId, ...updates }, token);
}

export interface ResetPasswordResult {
  username: string;
  password: string;
}

export async function resetAssistantPassword(
  assistantId: string,
  token: string,
): Promise<ResetPasswordResult> {
  const data = await callFn('reset_assistant_password', { assistant_id: assistantId }, token);
  return data as unknown as ResetPasswordResult;
}
