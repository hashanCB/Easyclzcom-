// request_teacher_password_reset_otp — send an OTP to a teacher's registered
// phone so they can reset a forgotten password.
// Auth:   None (public) — identity proven later by the OTP. JWT disabled.
// Input:  { username }
// Output: { ok: true }  (always, to avoid username enumeration)

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendSingle, type TextLkConfig } from '../_shared/textlk.ts';
import { toLocalLK, generateOtp, hashOtp } from '../_shared/student-otp.ts';
import { getSmsSender } from '../_shared/sms-config.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  username: z.string().min(3).max(50),
});

const OTP_TTL_MINUTES = 10;

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
  const username = parsed.data.username.toLowerCase().trim();

  const admin = adminClient();

  // 1. Look up an active teacher by username — no error if not found / inactive
  //    (avoid username enumeration; we always return ok below).
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, phone, is_active')
    .eq('username', username)
    .is('deleted_at', null)
    .maybeSingle();

  // Always respond ok — prevents username enumeration.
  if (!teacher || !teacher.is_active || !teacher.phone) return jsonResponse({ ok: true });

  // 2. Rate-limit OTP requests — 1 per 60 seconds.
  const { data: recent } = await admin
    .from('teacher_password_reset_otps')
    .select('created_at')
    .eq('teacher_id', teacher.id)
    .maybeSingle();

  if (recent && Deno.env.get('APP_ENV') !== 'dev') {
    const age = Date.now() - new Date(recent.created_at).getTime();
    if (age < 60_000) {
      const waitSec = Math.ceil((60_000 - age) / 1000);
      return errorResponse({ code: 'rate_limited', message: `Please wait ${waitSec} seconds before requesting another code.` });
    }
  }

  // 3. Generate and store OTP.
  const otp        = generateOtp();
  const otp_hash   = await hashOtp(otp);
  const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  await admin.from('teacher_password_reset_otps').upsert(
    { teacher_id: teacher.id, otp_hash, expires_at, created_at: new Date().toISOString() },
    { onConflict: 'teacher_id' },
  );

  // 4. Send OTP via text.lk to the registered phone.
  const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS service is not configured.' });
  }

  const SMS_SENDER = await getSmsSender(admin);
  const cfg: TextLkConfig = { apiToken: TEXTLK_API_TOKEN, senderId: SMS_SENDER };
  const sms = await sendSingle(cfg, toLocalLK(teacher.phone), `Your password reset code is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share it.`);

  if (!sms.ok) {
    const detail = sms.error ?? `HTTP ${sms.status}: ${sms.raw.slice(0, 300)}`;
    console.error('SMS send failed:', detail);
    return errorResponse({ code: 'server_error', message: 'Could not send the SMS code right now. Please try again in a few minutes.' });
  }

  return jsonResponse({ ok: true });
});
