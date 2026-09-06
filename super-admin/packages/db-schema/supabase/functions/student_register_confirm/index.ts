// student_register_confirm — step 2 of phone-verified student registration.
// Auth:   None (public endpoint, no-verify-jwt)
// Input:  { phone, otp }
// Output: { ok: true }
//
// Verifies the OTP stored by student_register_request, then creates the real
// student_accounts row from the pending data and deletes the pending row.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { toLocalLK, hashOtp } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  phone: z.string().min(7).max(20),
  otp:   z.string().length(6),
});

const MAX_ATTEMPTS = 5;

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
  const { otp } = parsed.data;
  const phone = toLocalLK(parsed.data.phone);

  const admin = adminClient();

  // 1. Fetch the pending registration.
  const { data: pending } = await admin
    .from('student_register_otps')
    .select('phone, name, password_hash, otp_hash, attempts, expires_at')
    .eq('phone', phone)
    .maybeSingle();

  if (!pending) {
    return errorResponse({ code: 'not_found', message: 'No registration in progress. Please start again.' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    await admin.from('student_register_otps').delete().eq('phone', phone);
    return errorResponse({ code: 'expired', message: 'Verification code expired. Please start again.' });
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await admin.from('student_register_otps').delete().eq('phone', phone);
    return errorResponse({ code: 'too_many_attempts', message: 'Too many wrong codes. Please start again.' });
  }

  // 2. Verify OTP.
  const otp_hash = await hashOtp(otp);
  if (otp_hash !== pending.otp_hash) {
    await admin
      .from('student_register_otps')
      .update({ attempts: pending.attempts + 1 })
      .eq('phone', phone);
    return errorResponse({ code: 'wrong_credentials', message: 'Incorrect verification code.' });
  }

  // 3. Last-moment race guard: phone taken since the request was made.
  const { data: existing } = await admin
    .from('student_accounts')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (existing) {
    await admin.from('student_register_otps').delete().eq('phone', phone);
    return errorResponse({ code: 'conflict', message: 'An account with this phone number already exists.' });
  }

  // 4. Create the real account from the pending data.
  const { error: insErr } = await admin
    .from('student_accounts')
    .insert({ phone: pending.phone, name: pending.name, password_hash: pending.password_hash });

  if (insErr) {
    if (insErr.code === '23505') {
      await admin.from('student_register_otps').delete().eq('phone', phone);
      return errorResponse({ code: 'conflict', message: 'An account with this phone number already exists.' });
    }
    console.error('register confirm insert error', insErr);
    return errorResponse({ code: 'server_error', message: 'Failed to create account.' });
  }

  // 5. Clean up the pending row.
  await admin.from('student_register_otps').delete().eq('phone', phone);

  return jsonResponse({ ok: true });
});
