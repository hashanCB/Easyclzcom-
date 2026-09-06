// =============================================================================
// reset_teacher_device — super-admin FORCE SIGN-OUT of a teacher's devices
// =============================================================================
// Renamed in behaviour (2026-05-31): with newest-device-wins auto-evict (§5.8)
// and self-registration (§5.9), a teacher who gets a new phone just logs in with
// username + password — no admin, no token. So this no longer issues a token.
//
// It is now an emergency lever (e.g. a lost/stolen phone): it deactivates ALL of
// the teacher's sessions so the currently-signed-in device is logged out by its
// session fence within ~2 minutes. The device binding is LEFT INTACT on purpose:
//   - nulling/revoking it would send the teacher's next login to the (now hidden)
//     token Activate screen, which we explicitly removed;
//   - keeping it means the teacher's NEXT login on any phone is a normal
//     auto-evict device switch (username + password → "use this phone?" → done).
//
// For a stolen phone where the thief knows the password, pair this with
// reset_teacher_password so the old device can't simply sign back in.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { getCaller } from '../_shared/role.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const Input = z.object({
  teacher_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  // Auth — super admin only
  const caller = await getCaller(req);
  if (!caller || caller.role !== 'super_admin') {
    return errorResponse({ code: 'forbidden', message: 'Super admin access required' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'teacher_id (uuid) is required' });
  }
  const { teacher_id } = parsed.data;

  const admin = adminClient();

  // 1. Confirm teacher exists
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, username')
    .eq('id', teacher_id)
    .is('deleted_at', null)
    .single();

  if (!teacher) {
    return errorResponse({ code: 'not_found', message: 'Teacher not found' });
  }

  // 2. Deactivate ALL sessions — the signed-in device is logged out by its fence.
  //    The token binding is intentionally left untouched (see header).
  const { error: sessErr } = await admin
    .from('teacher_sessions')
    .update({ is_active: false })
    .eq('teacher_id', teacher_id);

  if (sessErr) {
    return errorResponse({ code: 'internal', message: 'Failed to sign out devices', details: sessErr.message });
  }

  // 3. Audit trail — record the forced sign-out (reuses duplicate_token_attempts
  //    monitoring; device_id null marks an admin-initiated reset).
  await admin.from('duplicate_token_attempts').insert({
    teacher_id,
    attempted_device_id: 'admin_force_signout',
    attempted_device_info: { by: caller.user_id },
  }).catch(() => {});

  return jsonResponse({
    ok: true,
    username: teacher.username,
    message: 'All devices signed out. The teacher can log back in with their username and password.',
  });
});
