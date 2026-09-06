// Student portal notification feed (the bell). Account-level — aggregates across
// all of the student's classes. Auth via account_id + phone (same pattern as the
// other account-level portal calls).

import { getGlobalSession } from './auth';

const SUPABASE_URL      = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\s/g, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s/g, '');

export type StudentNotificationType = 'chat' | 'exam' | 'note';

export interface StudentNotification {
  id: string;
  type: StudentNotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

async function post(path: string, body: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Network blip / offline / blocked — never crash the UI over the bell.
    return null;
  }
}

function account(): { account_id: string; phone: string } | null {
  const s = getGlobalSession();
  if (!s) return null;
  return { account_id: s.account.id, phone: s.account.phone };
}

export async function fetchNotifications(): Promise<{ notifications: StudentNotification[]; unread: number }> {
  const a = account();
  if (!a) return { notifications: [], unread: 0 };
  const res = await post('get_student_notifications', a);
  if (!res || !res.ok) return { notifications: [], unread: 0 };
  const data = await res.json().catch(() => ({}));
  return {
    notifications: (data.notifications ?? []) as StudentNotification[],
    unread: (data.unread ?? 0) as number,
  };
}

export async function markNotificationRead(id?: string): Promise<void> {
  const a = account();
  if (!a) return;
  await post('mark_student_notifications_read', { ...a, ...(id ? { id } : {}) });
}
