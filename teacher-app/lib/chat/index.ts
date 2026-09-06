// Teacher-side chat data layer (U37) — direct PostgREST for 1:1 threads +
// the broadcast_chat edge function for group sends.
import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_URL } from '../constants';

export interface ChatThread {
  id: string;
  student_id: string;
  last_message_at: string | null;
  unread_for_teacher: number;
  students: { name: string; student_code: string; grade: string; batch: string } | null;
}

export interface ChatMessage {
  id: string;
  sender_role: 'teacher' | 'student';
  sender_id: string;
  body: string;
  created_at: string;
}

export type BroadcastKind =
  | 'all' | 'paid' | 'unpaid' | 'class' | 'grade' | 'batch' | 'subject' | 'language';

function headers(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
    ...extra,
  };
}

export async function fetchThreads(teacherId: string, token: string): Promise<ChatThread[]> {
  if (!teacherId || !token) return [];
  const url =
    `${SUPABASE_URL}/rest/v1/chat_threads?teacher_id=eq.${teacherId}&deleted_at=is.null` +
    `&select=id,student_id,last_message_at,unread_for_teacher,students(name,student_code,grade,batch)` +
    `&order=last_message_at.desc.nullslast`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

export async function fetchMessages(threadId: string, token: string): Promise<ChatMessage[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/chat_messages?thread_id=eq.${threadId}&deleted_at=is.null` +
    `&select=id,sender_role,sender_id,body,created_at&order=created_at.asc&limit=300`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

export async function sendMessage(
  threadId: string,
  teacherId: string,
  body: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
    method: 'POST',
    headers: headers(token, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({
      teacher_id: teacherId,
      thread_id: threadId,
      sender_role: 'teacher',
      sender_id: teacherId,
      body,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to send (${res.status}): ${t.slice(0, 160)}`);
  }
}

export async function markThreadRead(threadId: string, token: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/chat_threads?id=eq.${threadId}`, {
    method: 'PATCH',
    headers: headers(token, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ unread_for_teacher: 0 }),
  });
}

// Find an existing 1:1 thread or create one, returning its id.
export async function ensureThread(
  teacherId: string,
  studentId: string,
  token: string,
): Promise<string> {
  const findUrl =
    `${SUPABASE_URL}/rest/v1/chat_threads?teacher_id=eq.${teacherId}` +
    `&student_id=eq.${studentId}&select=id&limit=1`;
  const found = await fetch(findUrl, { headers: headers(token) });
  if (found.ok) {
    const rows = await found.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) return rows[0].id;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_threads`, {
    method: 'POST',
    headers: headers(token, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ teacher_id: teacherId, student_id: studentId }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to start chat (${res.status}): ${t.slice(0, 160)}`);
  }
  const created = await res.json();
  return Array.isArray(created) ? created[0].id : created.id;
}

export async function broadcastChat(
  kind: BroadcastKind,
  value: string | undefined,
  body: string,
  token: string,
  payment?: 'paid' | 'unpaid',
): Promise<{ recipients: number; threads_created: number }> {
  const res = await fetch(`${FUNCTIONS_URL}/broadcast_chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ target: { kind, value, payment }, body }),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = (data.error ?? {}) as { message?: string };
    if (res.status === 401) throw new Error('Your session has expired. Please log in again.');
    if (res.status === 404) throw new Error('The broadcast_chat function is not deployed.');
    throw new Error(err.message ?? `Broadcast failed (${res.status})`);
  }
  return data as unknown as { recipients: number; threads_created: number };
}
