// =============================================================================
// reset_teacher_password — super-admin resets a forgotten teacher password
// =============================================================================
// Auth:   Super-admin JWT (Authorization: Bearer <access_token>)
// Input:  { teacher_id }
// Output: { username, password }  ← new password, shown ONCE
//
// Guards:
//   - Caller must be super_admin.
//   - Teacher must exist and not be deleted.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { getCaller } from '../_shared/role.ts';
import { adminClient } from '../_shared/supabase.ts';
import { generateTeacherPassword } from '../_shared/random.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  // --- Auth: super_admin only ---
  const caller = await getCaller(req);
  if (!caller) {
    return errorResponse({ code: 'unauthorized', message: 'Sign-in required' });
  }
  if (caller.role !== 'super_admin') {
    return errorResponse({ code: 'forbidden', message: 'Super admin only' });
  }

  let body: { teacher_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const teacherId = body.teacher_id;
  if (!teacherId) {
    return errorResponse({ code: 'invalid_input', message: 'teacher_id is required' });
  }

  const admin = adminClient();

  // --- Verify teacher exists and is not deleted ---
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, username')
    .eq('id', teacherId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!teacher) {
    return errorResponse({ code: 'not_found', message: 'Teacher not found' });
  }

  // --- Generate and apply new password ---
  const password = generateTeacherPassword();
  const { error: updateErr } = await admin.auth.admin.updateUserById(teacherId, { password });
  if (updateErr) {
    console.error('reset teacher password failed', updateErr);
    return errorResponse({ code: 'internal', message: 'Failed to reset password' });
  }

  // --- Audit log (best-effort) ---
  await admin.from('audit_logs').insert({
    teacher_id: teacherId,
    user_id: caller.user_id,
    user_role: 'super_admin',
    action: 'teacher.password_reset',
    entity_type: 'teacher',
    entity_id: teacherId,
    new_value: { event: 'password_reset_by_admin' },
    occurred_at: new Date().toISOString(),
  }).then(undefined, (e: unknown) => console.error('audit insert failed', e));

  return jsonResponse({
    username: teacher.username,
    password,
    note: 'Password shown once. Share it securely with the teacher — they should change it after logging in.',
  });
});
