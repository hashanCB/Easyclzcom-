// confirm_password_reset — verify OTP and set new password (no current password needed).
// Auth:   None (public) — identity proven by phone + otp.
// Input:  { phone, otp, new_password }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { hashStudentPassword } from '../_shared/hash.ts';
import { toLocalLK, hashOtp } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  phone:        z.string().min(7).max(20),
  otp:          z.string().length(6),
  new_password: z.string().min(6).max(100),
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
  const { phone: rawPhone, otp, new_password } = parsed.data;
  const phone = toLocalLK(rawPhone); // normalise to 07... format for DB lookup

  const admin = adminClient();

  // 1. Look up account by phone.
  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid verification code.' });
  }

  // 2. Fetch pending OTP.
  const { data: pending } = await admin
    .from('password_reset_otps')
    .select('otp_hash, expires_at')
    .eq('account_id', account.id)
    .maybeSingle();

  if (!pending) {
    return errorResponse({ code: 'not_found', message: 'No reset request found. Please request a new code.' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    await admin.from('password_reset_otps').delete().eq('account_id', account.id);
    return errorResponse({ code: 'not_found', message: 'Code expired. Please request a new one.' });
  }

  // 3. Verify OTP hash.
  const otp_hash = await hashOtp(otp);
  if (otp_hash !== pending.otp_hash) {
    return errorResponse({ code: 'wrong_credentials', message: 'Incorrect verification code.' });
  }

  // 4. Set new password.
  const password_hash = await hashStudentPassword(new_password);
  const { error: updateErr } = await admin
    .from('student_accounts')
    .update({ password_hash })
    .eq('id', account.id);

  if (updateErr) {
    return errorResponse({ code: 'server_error', message: updateErr.message });
  }

  // 5. Clean up OTP.
  await admin.from('password_reset_otps').delete().eq('account_id', account.id);

  return jsonResponse({ ok: true });
});
