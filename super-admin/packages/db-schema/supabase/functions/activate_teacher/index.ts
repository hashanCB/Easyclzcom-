// =============================================================================
// activate_teacher — first-time login + token bind (SRS §5.1)
// =============================================================================
// Input:  { username, password, token, device_id, device_info? }
// Output: { session, teacher } on success
//         { error: 'duplicate_token' } if the token is already bound elsewhere
//
// Flow:
//   1. Look up teacher by username; reject if missing/inactive.
//   2. Sign in with username+password (Supabase Auth verifies hash).
//   3. Compare hashed token against teacher_tokens.token_hash.
//   4. If teacher_tokens.bound_device_id is null  → bind it to this device.
//      If it equals device_id                     → re-activation, fine.
//      Otherwise                                  → write
//      duplicate_token_attempts row + return 409.
//   5. Upsert teacher_sessions row.
//   6. Update teachers.last_login_at.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, verifyClient } from '../_shared/supabase.ts';
import { ActivateTeacherInput } from '../_shared/schema.ts';
import { hashToken, usernameToAuthEmail } from '../_shared/hash.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = ActivateTeacherInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({
      code: 'invalid_input',
      message: 'Invalid input',
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;
  const username = input.username.toLowerCase();

  const admin = adminClient();

  // 1. Teacher lookup
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, is_active, deleted_at')
    .eq('username', username)
    .maybeSingle();
  if (!teacher || teacher.deleted_at) {
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid username or password' });
  }
  if (!teacher.is_active) {
    return errorResponse({ code: 'inactive_teacher', message: 'This teacher account is deactivated' });
  }

  // 2. Sign in (Supabase Auth verifies the password hash for us).
  // Uses a separate throwaway client so the admin client below keeps using
  // the service-role key (signInWithPassword would otherwise replace its
  // session with the user's JWT — see _shared/supabase.ts).
  const { data: signIn, error: signInErr } = await verifyClient().auth.signInWithPassword({
    email: usernameToAuthEmail(username),
    password: input.password,
  });
  if (signInErr || !signIn.session) {
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid username or password' });
  }

  // 3. Token check
  const tokenHash = await hashToken(input.token);
  const { data: tokenRow } = await admin
    .from('teacher_tokens')
    .select('id, bound_device_id, revoked_at')
    .eq('teacher_id', teacher.id)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!tokenRow || tokenRow.revoked_at) {
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid token' });
  }

  // 4. Device-bind logic
  if (tokenRow.bound_device_id && tokenRow.bound_device_id !== input.device_id) {
    await admin.from('duplicate_token_attempts').insert({
      teacher_id: teacher.id,
      attempted_device_id: input.device_id,
      attempted_device_info: input.device_info ?? null,
    });
    return errorResponse({
      code: 'duplicate_token',
      message: 'This activation token is already bound to another device. Contact your admin if you switched phones.',
    });
  }

  if (!tokenRow.bound_device_id) {
    const { error: bindErr } = await admin
      .from('teacher_tokens')
      .update({ bound_device_id: input.device_id, bound_at: new Date().toISOString() })
      .eq('id', tokenRow.id);
    if (bindErr) {
      return errorResponse({ code: 'internal', message: 'Failed to bind token', details: bindErr.message });
    }
  }

  // 5. Session row (upsert by (teacher_id, device_id))
  await admin
    .from('teacher_sessions')
    .upsert(
      {
        teacher_id: teacher.id,
        device_id: input.device_id,
        device_info: input.device_info ?? null,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'teacher_id,device_id' },
    );

  // 6. last_login_at
  await admin
    .from('teachers')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', teacher.id);

  return jsonResponse({
    session: signIn.session,
    teacher: { id: teacher.id, username },
  });
});
