// Student-side chat (U37). The student token is a custom JWT, so all chat
// access goes through the student_chat edge function (service-role backed) —
// direct PostgREST is not usable. One call both sends (optional) and fetches.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\s/g, '');

export interface ChatMessage {
  id: string;
  sender_role: 'teacher' | 'student';
  body: string;
  created_at: string;
}

export interface ChatState {
  thread_id: string;
  messages: ChatMessage[];
}

// Calls student_chat. With `body`, sends that message first; always returns the
// full conversation. Passing no body makes this a poll.
export async function syncChat(token: string, body?: string): Promise<ChatState> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/student_chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ? { body } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message ?? `Chat unavailable (${res.status})`);
    (e as Error & { code?: string }).code = data?.error?.code;
    throw e;
  }
  return data as ChatState;
}
