// =============================================================================
// my_join_requests — a student account's join requests (for the portal UI).
// =============================================================================
// Auth:   None (public) — identity proven by account_id + phone.
// Input:  { account_id, phone }
// Output: { requests: [{ id, status, created_at, decided_at, class: {...} }] }
//
// Returns recent requests (newest first) so the dashboard can show
// "waiting for teacher approval" / "rejected" states.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
});

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input' });
  }
  const { account_id, phone } = parsed.data;

  const admin = adminClient();

  const { data: account } = await admin
    .from('student_accounts')
    .select('id')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (!account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  const { data: rows } = await admin
    .from('class_join_requests')
    .select(`
      id, status, created_at, decided_at,
      classes ( subject, grade, batch ),
      teachers ( username, name )
    `)
    .eq('student_account_id', account_id)
    .order('created_at', { ascending: false })
    .limit(20);

  const requests = (rows ?? []).map((r) => {
    const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes;
    const teacher = Array.isArray(r.teachers) ? r.teachers[0] : r.teachers;
    return {
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      decided_at: r.decided_at,
      class: cls ? { subject: cls.subject, grade: cls.grade, batch: cls.batch } : null,
      teacher: teacher ? { username: teacher.username, name: teacher.name ?? null } : null,
    };
  });

  return jsonResponse({ requests });
});
