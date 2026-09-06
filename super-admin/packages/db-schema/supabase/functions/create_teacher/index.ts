// =============================================================================
// create_teacher — super-admin-only
// =============================================================================
// Input:  { username, phone, name?, email? }
// Output: { teacher_id, username, password (plaintext, shown once), token (plaintext, shown once) }
//
// Side effects (all-or-nothing — see compensating cleanup):
//   1. auth.users row (Supabase Auth admin API)
//   2. user_roles row (role = 'teacher')
//   3. teachers row (id = auth.users.id)
//   4. teacher_tokens row (sha256 hashed plaintext)
//   5. subscriptions row (status = 'inactive')
//
// The plaintext password + token are returned exactly once. The super-admin UI
// must show them to the user immediately and never store them.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { getCaller } from '../_shared/role.ts';
import { adminClient } from '../_shared/supabase.ts';
import { CreateTeacherInput } from '../_shared/schema.ts';
import { hashToken, usernameToAuthEmail } from '../_shared/hash.ts';
import { generateActivationToken, generateTeacherPassword } from '../_shared/random.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  const caller = await getCaller(req);
  if (!caller) {
    return errorResponse({ code: 'unauthorized', message: 'Sign-in required' });
  }
  if (caller.role !== 'super_admin') {
    return errorResponse({ code: 'forbidden', message: 'Super admin only' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = CreateTeacherInput.safeParse(body);
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

  // Reject duplicate username early — clearer error than the unique-violation
  // we'd otherwise hit on insert.
  const { data: existing } = await admin
    .from('teachers')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (existing) {
    return errorResponse({ code: 'conflict', message: 'Username already in use' });
  }

  const password = generateTeacherPassword();
  const token = generateActivationToken();
  const tokenHash = await hashToken(token);

  // 1. auth.users
  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToAuthEmail(username),
    password,
    email_confirm: true,
    user_metadata: { display_name: input.name ?? username },
  });
  if (createErr || !createdUser?.user) {
    return errorResponse({
      code: 'internal',
      message: 'Failed to create auth user',
      details: createErr?.message,
    });
  }
  const teacherId = createdUser.user.id;

  // Compensating cleanup if any subsequent step fails. Edge functions don't
  // run inside a Postgres transaction with auth.admin calls, so we roll back
  // by hand.
  const rollback = async (where: string, original: string | undefined) => {
    await admin.auth.admin.deleteUser(teacherId).catch(() => {});
    await admin.from('teachers').delete().eq('id', teacherId).catch(() => {});
    await admin.from('user_roles').delete().eq('user_id', teacherId).catch(() => {});
    return errorResponse({
      code: 'internal',
      message: `Failed at ${where}; rolled back`,
      details: original,
    });
  };

  // 2. user_roles
  const { error: roleErr } = await admin
    .from('user_roles')
    .insert({ user_id: teacherId, role: 'teacher' });
  if (roleErr) return rollback('user_roles', roleErr.message);

  // 3. teachers
  const { error: teacherErr } = await admin.from('teachers').insert({
    id: teacherId,
    username,
    name: input.name ?? null,
    phone: input.phone,
    email: input.email ?? null,
    is_active: true,
    is_profile_complete: false,
  });
  if (teacherErr) return rollback('teachers', teacherErr.message);

  // 4. teacher_tokens
  const { error: tokenErr } = await admin
    .from('teacher_tokens')
    .insert({ teacher_id: teacherId, token_hash: tokenHash });
  if (tokenErr) return rollback('teacher_tokens', tokenErr.message);

  // 5. subscriptions (default to inactive — Pro is opt-in)
  const { error: subErr } = await admin
    .from('subscriptions')
    .insert({ teacher_id: teacherId, status: 'inactive', plan_code: 'pro_monthly' });
  if (subErr) return rollback('subscriptions', subErr.message);

  // Audit
  await admin.from('audit_logs').insert({
    teacher_id: teacherId,
    user_id: caller.user_id,
    user_role: 'super_admin',
    action: 'teacher.create',
    entity_type: 'teacher',
    entity_id: teacherId,
    new_value: { username, phone: input.phone },
  });

  return jsonResponse({
    teacher_id: teacherId,
    username,
    password,
    token,
    note: 'Password and token are shown once. Save them now — they cannot be retrieved later.',
  }, 201);
});
