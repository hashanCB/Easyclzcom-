// Teacher-side handling of student join requests (student entered the class
// code in the portal and asked to join). Pending requests live in the cloud
// `class_join_requests` table, read over REST like assistant submissions.
// Accepting goes through the respond_join_request edge function, which creates
// the student row server-side (or links an existing one) and links the
// student's portal account; the next sync pulls the new student down.
import { useCallback, useEffect, useState } from 'react';

import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_URL } from '../constants';
import { scheduleSync } from '../sync/engine';

export interface JoinRequest {
  id: string;
  teacher_id: string;
  class_id: string;
  student_account_id: string;
  student_name: string;
  student_phone: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function fetchPendingJoinRequests(
  teacherId: string,
  token: string,
): Promise<JoinRequest[]> {
  if (!teacherId || !token) return [];
  const url =
    `${SUPABASE_URL}/rest/v1/class_join_requests` +
    `?teacher_id=eq.${teacherId}&status=eq.pending` +
    `&select=id,teacher_id,class_id,student_account_id,student_name,student_phone,status,created_at` +
    `&order=created_at.asc`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

/**
 * Accept (optionally linking an existing manually-added student) or reject.
 * On accept the server creates/links the student; we schedule a sync so the
 * new row appears in the local roster.
 */
export async function respondJoinRequest(
  requestId: string,
  action: 'accept' | 'reject',
  token: string,
  existingStudentId?: string,
): Promise<void> {
  const res = await fetch(`${FUNCTIONS_URL}/respond_join_request`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      request_id: requestId,
      action,
      ...(existingStudentId ? { existing_student_id: existingStudentId } : {}),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as { error?: { message?: string } }));
    throw new Error(data?.error?.message ?? `Could not ${action} the request.`);
  }
  if (action === 'accept') scheduleSync();
}

/** The class's permanent share code (assigned server-side after first sync). */
export async function fetchClassJoinCode(
  classId: string,
  token: string,
): Promise<string | null> {
  const url = `${SUPABASE_URL}/rest/v1/classes?id=eq.${classId}&select=join_code`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as { join_code: string | null }[];
  return rows[0]?.join_code ?? null;
}

/** Rotate the class's join code (old one stops working). Returns the new code. */
export async function regenerateClassJoinCode(
  classId: string,
  token: string,
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/regenerate_class_join_code`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ p_class_id: classId }),
  });
  if (!res.ok) throw new Error('Could not generate a new code. Check your connection.');
  return res.json();
}

/** 'X4K2M9' → 'X4K-2M9' for readability. */
export function formatJoinCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

// Hook for the requests screen + the "N waiting" banner on the roster.
export function usePendingJoinRequests(teacherId: string, token: string) {
  const [items, setItems] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchPendingJoinRequests(teacherId, token));
    } finally {
      setLoading(false);
    }
  }, [teacherId, token]);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, refresh, setItems };
}
