// verify_teacher_password_reset_otp — check a reset OTP is valid WITHOUT using
// it up, so the app can confirm the code before asking for a new password.
// Auth:   None (public) — JWT disabled.
// Input:  { username, otp }
// Output: { ok: true }   (the OTP stays valid; confirm_teacher_password_reset
//                          verifies it again and then sets the password)

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { hashOtp } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  username: z.string().min(3).max(50),
  otp:      z.string().length(6),
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
  const { otp } = parsed.data;
  const username = parsed.data.username.toLowerCase().trim();

  const admin = adminClient();

  const { data: teacher } = await admin
    .from('teachers')
    .select('id, is_active')
    .eq('username', username)
    .is('deleted_at', null)
    .maybeSingle();

  if (!teacher || !teacher.is_active) {
    return errorResponse({ code: 'wrong_credentials', message: 'Invalid verification code.' });
  }

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

  const otp_hash = await hashOtp(otp);
  if (otp_hash !== pending.otp_hash) {
    return errorResponse({ code: 'wrong_credentials', message: 'Incorrect verification code.' });
  }

  return jsonResponse({ ok: true });
});
