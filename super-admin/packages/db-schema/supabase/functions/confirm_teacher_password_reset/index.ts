// confirm_teacher_password_reset — verify the OTP and set a new password for a
// teacher (no current password needed). Identity proven by username + OTP.
// Auth:   None (public) — JWT disabled.
// Input:  { username, otp, new_password }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { hashOtp } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  username:     z.string().min(3).max(50),
  otp:          z.string().length(6),
  new_password: z.string().min(8).max(100),
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
  const { otp, new_password } = parsed.data;
  const username = parsed.data.username.toLowerCase().trim();

  const admin = adminClient();

  // 1. Look up the teacher by username.
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, is_active')
    .eq('username', username)
    .is('deleted_at', null)
    .maybeSingle();

  if (!teacher || !teacher.is_active) {
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid verification code.' });
  }

  // 2. Fetch pending OTP.
  const { data: pending } = await admin
    .from('teacher_password_reset_otps')
    .select('otp_hash, expires_at')
    .eq('teacher_id', teacher.id)
    .maybeSingle();

  if (!pending) {
    return errorResponse({ code: 'not_found', message: 'No reset request found. Please request a new code.' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    await admin.from('teacher_password_reset_otps').delete().eq('teacher_id', teacher.id);
    return errorResponse({ code: 'not_found', message: 'Code expired. Please request a new one.' });
  }

  // 3. Verify OTP hash.
  const otp_hash = await hashOtp(otp);
  if (otp_hash !== pending.otp_hash) {
    return errorResponse({ code: 'wrong_credentials', message: 'Incorrect verification code.' });
  }

  // 4. Set the new password (teachers are Supabase Auth users).
  const { error: updateErr } = await admin.auth.admin.updateUserById(teacher.id, { password: new_password });
  if (updateErr) {
    console.error('teacher self password reset failed', updateErr);
    return errorResponse({ code: 'server_error', message: 'Failed to reset password' });
  }

  // 5. Clean up OTP.
  await admin.from('teacher_password_reset_otps').delete().eq('teacher_id', teacher.id);

  return jsonResponse({ ok: true });
});
