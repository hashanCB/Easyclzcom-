// =============================================================================
// register_teacher_confirm — public teacher sign-up, step 2 (verify OTP + create)
// =============================================================================
// Auth:   None (public) — proven by phone + OTP from step 1.
// Input:  { name?, username, phone, password, otp, device_id, device_info? }
// Output: { session, teacher } — signed in, ready to use (same shape as login).
//
// Verifies the OTP issued by register_teacher_request, then creates the full
// teacher account and AUTO-ACTIVATES it on this device (binds the device, opens
// a session) so the teacher never sees an activation token. A 14-day trial
// subscription is started. All-or-nothing with compensating rollback.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, verifyClient } from '../_shared/supabase.ts';
import { RegisterTeacherConfirmInput } from '../_shared/schema.ts';
import { hashToken, usernameToAuthEmail } from '../_shared/hash.ts';
import { generateActivationToken } from '../_shared/random.ts';
import { toLocalLK, hashOtp } from '../_shared/student-otp.ts';

const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_TRIAL_PLAN = 'growth';

// The trial runs on a real package (the one the teacher picked on the plan
// screen). Validate against the active plans; unknown/missing → 'growth'.
async function resolveTrialPlan(
  admin: ReturnType<typeof adminClient>,
  requested: string | undefined,
): Promise<string> {
  if (!requested) return DEFAULT_TRIAL_PLAN;
  try {
    const { data } = await admin
      .from('subscription_plans')
      .select('code')
      .eq('code', requested)
      .eq('is_active', true)
      .maybeSingle();
    return data?.code ?? DEFAULT_TRIAL_PLAN;
  } catch {
    return DEFAULT_TRIAL_PLAN;
  }
}

// The default trial length is configurable from the super-admin Settings page
// (app_settings key 'trial_days'). Falls back to 14 if unset or invalid.
async function getTrialDays(admin: ReturnType<typeof adminClient>): Promise<number> {
  try {
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'trial_days')
      .maybeSingle();
    const n = parseInt(data?.value ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TRIAL_DAYS;
  } catch {
    return DEFAULT_TRIAL_DAYS;
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse({ code: 'invalid_input', message: 'POST only' });

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = RegisterTeacherConfirmInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const username = input.username.toLowerCase();
  const phone = toLocalLK(input.phone);

  const admin = adminClient();

  // 1. Fetch the pending registration for this phone.
  const { data: pending } = await admin
    .from('teacher_registration_otps')
    .select('username, name, email, otp_hash, expires_at')
    .eq('phone', phone)
    .maybeSingle();
  if (!pending) {
    return errorResponse({ code: 'not_found', message: 'No registration in progress. Please start again.' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    await admin.from('teacher_registration_otps').delete().eq('phone', phone);
    return errorResponse({ code: 'not_found', message: 'Code expired. Please request a new one.' });
  }
  // Username must match the one the OTP was issued for (can't swap after verify).
  if (String(pending.username).toLowerCase() !== username) {
    return errorResponse({ code: 'invalid_input', message: 'Username does not match this registration.' });
  }
  // 2. Verify the OTP.
  const otp_hash = await hashOtp(input.otp);
  if (otp_hash !== pending.otp_hash) {
    return errorResponse({ code: 'wrong_credentials', message: 'Incorrect verification code.' });
  }

  // 3. Re-check availability (guards against a race between request and confirm).
  const { data: takenName } = await admin.from('teachers').select('id').eq('username', username).maybeSingle();
  if (takenName) {
    await admin.from('teacher_registration_otps').delete().eq('phone', phone);
    return errorResponse({ code: 'conflict', message: 'That username was just taken. Please choose another.' });
  }
  const { data: takenPhone } = await admin
    .from('teachers').select('id').eq('phone', phone).is('deleted_at', null).maybeSingle();
  if (takenPhone) {
    await admin.from('teacher_registration_otps').delete().eq('phone', phone);
    return errorResponse({ code: 'conflict', message: 'An account already exists for this phone number.' });
  }

  const name = input.name ?? (pending.name as string | null) ?? null;
  // Email captured at sign-up — prefer the value stored with the OTP request,
  // fall back to anything sent on confirm. Normalised to lowercase, null if none.
  const email = ((pending.email as string | null) ?? input.email ?? null)?.trim().toLowerCase() || null;

  // 4. Create auth user with the password the teacher chose.
  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToAuthEmail(username),
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: name ?? username },
  });
  if (createErr || !createdUser?.user) {
    return errorResponse({ code: 'internal', message: 'Failed to create account', details: createErr?.message });
  }
  const teacherId = createdUser.user.id;

  // Compensating cleanup — auth.admin calls aren't in the DB transaction.
  const rollback = async (where: string, original: string | undefined) => {
    await admin.auth.admin.deleteUser(teacherId).catch(() => {});
    await admin.from('teachers').delete().eq('id', teacherId).catch(() => {});
    await admin.from('user_roles').delete().eq('user_id', teacherId).catch(() => {});
    return errorResponse({ code: 'internal', message: `Failed at ${where}; rolled back`, details: original });
  };

  // 5. user_roles
  const { error: roleErr } = await admin.from('user_roles').insert({ user_id: teacherId, role: 'teacher' });
  if (roleErr) return rollback('user_roles', roleErr.message);

  // 6. teachers
  const { error: teacherErr } = await admin.from('teachers').insert({
    id: teacherId,
    username,
    name,
    phone,
    email,
    is_active: true,
    is_profile_complete: false,
  });
  if (teacherErr) return rollback('teachers', teacherErr.message);

  // 7. teacher_tokens — AUTO-ACTIVATED: an internal token is generated and bound
  //    to THIS device immediately, so the teacher never enters a token. The token
  //    only exists so the admin reset_teacher_device fallback still works.
  const tokenHash = await hashToken(generateActivationToken());
  const { error: tokenErr } = await admin.from('teacher_tokens').insert({
    teacher_id: teacherId,
    token_hash: tokenHash,
    bound_device_id: input.device_id,
    bound_at: new Date().toISOString(),
  });
  if (tokenErr) return rollback('teacher_tokens', tokenErr.message);

  // 8. teacher_sessions — open the active session for this device.
  await admin.from('teacher_sessions').upsert(
    {
      teacher_id: teacherId,
      device_id: input.device_id,
      device_info: input.device_info ?? null,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'teacher_id,device_id' },
  );

  // 9. subscriptions — ONE FREE TRIAL PER PHONE. If this device has already been
  //    granted a sign-up trial (by any earlier account on the same phone), the
  //    new account starts 'inactive' (no trial) and must subscribe. Otherwise it
  //    gets a trial whose length is configurable from super-admin, on the
  //    package the teacher picked during sign-up.
  //    Note: switching phones with the SAME account is a login, which never
  //    creates a subscription, so an existing trial is always preserved.
  const now = new Date();
  const trialPlan = await resolveTrialPlan(admin, input.plan_code);

  // Has this phone consumed a trial before? Service role bypasses RLS. On a
  // lookup error we fail OPEN (grant the trial) so a transient DB hiccup never
  // blocks a genuine first-time sign-up.
  let deviceUsedTrial = false;
  try {
    const { data: priorTrial } = await admin
      .from('device_trials')
      .select('device_id')
      .eq('device_id', input.device_id)
      .maybeSingle();
    deviceUsedTrial = !!priorTrial;
  } catch {
    deviceUsedTrial = false;
  }

  const subRow: Record<string, unknown> = deviceUsedTrial
    ? {
        teacher_id: teacherId,
        status: 'inactive',
        plan_code: trialPlan,
        current_period_start: null,
        current_period_end: null,
      }
    : {
        teacher_id: teacherId,
        status: 'trialing',
        plan_code: trialPlan,
        current_period_start: now.toISOString(),
        current_period_end: new Date(
          now.getTime() + (await getTrialDays(admin)) * 86_400_000,
        ).toISOString(),
      };

  const { error: subErr } = await admin.from('subscriptions').insert(subRow);
  if (subErr) return rollback('subscriptions', subErr.message);

  // Record that this phone has now used its one trial (only when a trial was
  // actually granted). Best-effort + idempotent — never fail the sign-up here.
  if (!deviceUsedTrial) {
    await admin
      .from('device_trials')
      .upsert(
        { device_id: input.device_id, first_teacher_id: teacherId, first_used_at: now.toISOString() },
        { onConflict: 'device_id', ignoreDuplicates: true },
      )
      .then(() => {}, () => {});
  }

  // 10. last_login + clean up the pending OTP.
  await admin.from('teachers').update({ last_login_at: now.toISOString() }).eq('id', teacherId);
  await admin.from('teacher_registration_otps').delete().eq('phone', phone);

  // Audit
  await admin.from('audit_logs').insert({
    teacher_id: teacherId,
    user_id: teacherId,
    user_role: 'teacher',
    action: 'teacher.self_register',
    entity_type: 'teacher',
    entity_id: teacherId,
    new_value: { username, phone },
  });

  // 11. Sign in to return a ready-to-use session (separate client so the admin
  //     client keeps its service-role key).
  const { data: signIn, error: signInErr } = await verifyClient().auth.signInWithPassword({
    email: usernameToAuthEmail(username),
    password: input.password,
  });
  if (signInErr || !signIn.session) {
    // Account exists; the teacher can simply log in. Surface a soft error.
    return errorResponse({ code: 'internal', message: 'Account created — please log in.' });
  }

  return jsonResponse({ session: signIn.session, teacher: { id: teacherId, username } }, 201);
});
