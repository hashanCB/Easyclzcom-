// =============================================================================
// login_teacher — subsequent login (SRS §5.3, §5.6 auto-evict)
// =============================================================================
// Input:  { username, password, device_id, device_info?, confirm_switch? }
// Output: { session, teacher } on success
//         { requires_device_switch: true, current_device } when the account is
//           bound to a DIFFERENT phone and confirm_switch was not set
//
// Device model: newest-device-wins (auto-evict). The first device is bound via
// the activation token (activate_teacher). On a later phone the teacher logs in
// with just username + password:
//   - Same device as bound        → normal login.
//   - Never activated (unbound)    → 403, must use the Activate flow.
//   - A DIFFERENT device is bound:
//       * without confirm_switch   → return { requires_device_switch } plus the
//         current device's info so the app can ask "log out your other phone?".
//       * with confirm_switch:true → re-bind this device, deactivate the old
//         session (the old phone is then logged out by the client session
//         fence), and complete the login. No admin / token needed.
//   reset_teacher_device (super admin) remains as a forced-unbind fallback.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, verifyClient } from '../_shared/supabase.ts';
import { LoginTeacherInput } from '../_shared/schema.ts';
import { usernameToAuthEmail } from '../_shared/hash.ts';

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

  const parsed = LoginTeacherInput.safeParse(body);
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

  // --- Brute-force lockout (per username) -----------------------------------
  // After MAX_FAILS wrong passwords the account is locked for LOCK_MINUTES.
  // All throttle DB calls fail OPEN: a throttle bug must never block a valid
  // login, it just temporarily loses brute-force protection.
  const MAX_FAILS = 5;
  const LOCK_MINUTES = 15;

  const recordFailure = async () => {
    try {
      const { data: row } = await admin
        .from('login_attempts')
        .select('fail_count')
        .eq('identifier', username)
        .maybeSingle();
      const nextCount = (row?.fail_count ?? 0) + 1;
      const lockedUntil = nextCount >= MAX_FAILS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null;
      await admin.from('login_attempts').upsert(
        {
          identifier: username,
          // Reset the counter once a lock trips so the next window starts clean.
          fail_count: lockedUntil ? 0 : nextCount,
          locked_until: lockedUntil,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'identifier' },
      );
    } catch (_e) { /* fail open */ }
  };

  const clearAttempts = async () => {
    try { await admin.from('login_attempts').delete().eq('identifier', username); }
    catch (_e) { /* fail open */ }
  };

  try {
    const { data: lock } = await admin
      .from('login_attempts')
      .select('locked_until')
      .eq('identifier', username)
      .maybeSingle();
    if (lock?.locked_until) {
      const waitMs = new Date(lock.locked_until).getTime() - Date.now();
      if (waitMs > 0) {
        return errorResponse({
          code: 'rate_limited',
          message: `Too many failed attempts. Try again in ${Math.ceil(waitMs / 60_000)} minute(s).`,
        });
      }
    }
  } catch (_e) { /* fail open */ }

  const { data: teacher } = await admin
    .from('teachers')
    .select('id, is_active, deleted_at')
    .eq('username', username)
    .maybeSingle();
  if (!teacher || teacher.deleted_at) {
    await recordFailure();
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid username or password' });
  }
  if (!teacher.is_active) {
    return errorResponse({ code: 'inactive_teacher', message: 'This teacher account is deactivated' });
  }

  const { data: signIn, error: signInErr } = await verifyClient().auth.signInWithPassword({
    email: usernameToAuthEmail(username),
    password: input.password,
  });
  if (signInErr || !signIn.session) {
    await recordFailure();
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid username or password' });
  }

  // Correct password — clear the failed-attempt counter for this username.
  await clearAttempts();

  // Device-bind check (token is implicit on subsequent logins).
  const { data: tokenRow } = await admin
    .from('teacher_tokens')
    .select('id, bound_device_id, revoked_at')
    .eq('teacher_id', teacher.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tokenRow) {
    return errorResponse({
      code: 'forbidden',
      message: 'No active activation token found. Contact your admin.',
    });
  }

  if (!tokenRow.bound_device_id) {
    return errorResponse({
      code: 'forbidden',
      message: 'This account has not been activated yet. Use the Activate flow.',
    });
  }

  // Auto-evict: a DIFFERENT phone holds the binding.
  if (tokenRow.bound_device_id !== input.device_id) {
    // Step 1 — no confirmation yet: tell the app which phone currently holds the
    // account so it can show "this will log out your other phone" and ask.
    if (!input.confirm_switch) {
      // Audit trail: record the attempted device change (one row per switch
      // prompt; super-admin monitoring reads duplicate_token_attempts).
      await admin.from('duplicate_token_attempts').insert({
        teacher_id: teacher.id,
        attempted_device_id: input.device_id,
        attempted_device_info: input.device_info ?? null,
      });

      const { data: currentSession } = await admin
        .from('teacher_sessions')
        .select('device_id, device_info, last_seen_at')
        .eq('teacher_id', teacher.id)
        .eq('device_id', tokenRow.bound_device_id)
        .maybeSingle();
      return jsonResponse({
        requires_device_switch: true,
        current_device: currentSession ?? { device_id: tokenRow.bound_device_id },
      });
    }

    // Step 2 — confirmed: re-bind the token to THIS device and deactivate the
    // old phone's session. The old phone's next fence check sees is_active=false
    // and logs itself out ("used on another device").
    const { error: rebindErr } = await admin
      .from('teacher_tokens')
      .update({ bound_device_id: input.device_id, bound_at: new Date().toISOString() })
      .eq('id', tokenRow.id);
    if (rebindErr) {
      return errorResponse({ code: 'internal', message: 'Failed to switch device', details: rebindErr.message });
    }
    await admin
      .from('teacher_sessions')
      .update({ is_active: false })
      .eq('teacher_id', teacher.id)
      .neq('device_id', input.device_id);
  }

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

  await admin
    .from('teachers')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', teacher.id);

  return jsonResponse({
    session: signIn.session,
    teacher: { id: teacher.id, username },
  });
});
