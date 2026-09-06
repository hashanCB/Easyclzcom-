// teacher_unlink_portal — teacher removes a student's portal link for their class.
// Auth:   Supabase JWT (teacher must be authenticated).
// Input:  { student_id }  — the local student UUID that belongs to this teacher
// Output: { ok: true }
//
// The teacher can only remove links for students that belong to them.
// This is useful when a student has left the class or the link is stale.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  student_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse({ code: 'invalid_input', message: 'POST only' });

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) return errorResponse({ code: 'invalid_input', message: 'Invalid input' });
  const { student_id } = parsed.data;

  // 1. Verify teacher JWT.
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Authentication required.' });
  }
  const teacher_id = user.id;

  const admin = adminClient();

  // 2. Verify this student belongs to this teacher (prevents cross-teacher removal).
  const { data: student } = await admin
    .from('students')
    .select('id')
    .eq('id', student_id)
    .eq('teacher_id', teacher_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!student) {
    return errorResponse({ code: 'not_found', message: 'Student not found or does not belong to you.' });
  }

  // 3. Delete the portal link (idempotent — ok if already gone).
  const { error: delErr } = await admin
    .from('student_account_links')
    .delete()
    .eq('student_id', student_id)
    .eq('teacher_id', teacher_id);

  if (delErr) {
    return errorResponse({ code: 'server_error', message: delErr.message });
  }

  return jsonResponse({ ok: true });
});
