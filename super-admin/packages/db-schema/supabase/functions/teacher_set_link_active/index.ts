// teacher_set_link_active — teacher suspends or restores a student's portal access.
// Auth:   Supabase JWT (teacher must be authenticated).
// Input:  { student_id, is_active }
// Output: { ok: true }
//
// is_active = false  → portal access suspended (chat blocked, shows "suspended" in portal)
// is_active = true   → portal access restored
//
// The teacher can only manage links for students that belong to them.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  student_id: z.string().uuid(),
  is_active:  z.boolean(),
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
  const { student_id, is_active } = parsed.data;

  // 1. Verify teacher JWT.
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Authentication required.' });
  }
  const teacher_id = user.id;

  const admin = adminClient();

  // 2. Verify the student belongs to this teacher.
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

  // 3. Update the link's is_active flag.
  const { error: updateErr } = await admin
    .from('student_account_links')
    .update({ is_active })
    .eq('student_id', student_id)
    .eq('teacher_id', teacher_id);

  if (updateErr) {
    return errorResponse({ code: 'server_error', message: updateErr.message });
  }

  return jsonResponse({ ok: true });
});
