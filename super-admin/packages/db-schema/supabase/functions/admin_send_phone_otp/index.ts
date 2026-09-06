// admin_send_phone_otp — admin sends OTP to verify new phone for a student.
// Auth:   Supabase JWT (admin must be authenticated).
// Input:  { account_id, new_phone }
// Output: { ok: true }
//
// The admin finds the student's account, enters a new phone, and triggers an OTP
// sent to that phone. The admin then verbally confirms the code with the student
// and submits it via admin_confirm_phone_otp. No monthly rate limit — admin override.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendSingle, type TextLkConfig } from '../_shared/textlk.ts';
import { toLocalLK, generateOtp, hashOtp } from '../_shared/student-otp.ts';
import { getSmsSender } from '../_shared/sms-config.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  new_phone:  z.string().min(7).max(20),
});

const OTP_TTL_MINUTES = 10;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse({ code: 'invalid_input', message: 'POST only' });

  // JWT is validated by Supabase gateway (verify_jwt = true by default).

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) return errorResponse({ code: 'invalid_input', message: 'Invalid input' });
  const { account_id, new_phone } = parsed.data;

  const admin = adminClient();

  // 1. Verify student account exists.
  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id, name')
    .eq('id', account_id)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'not_found', message: 'Student account not found.' });
  }

  // 2. Check new phone not already taken.
  const { data: conflict } = await admin
    .from('student_accounts')
    .select('id')
    .eq('phone', toLocalLK(new_phone))
    .maybeSingle();
  if (conflict && conflict.id !== account_id) {
    return errorResponse({ code: 'conflict', message: 'This phone number is already registered to another account.' });
  }

  // 3. Rate-limit OTP requests — 1 per 60 seconds (anti-spam).
  const { data: recent } = await admin
    .from('phone_change_otps')
    .select('created_at')
    .eq('account_id', account_id)
    .maybeSingle();
  if (recent) {
    const age = Date.now() - new Date(recent.created_at).getTime();
    if (age < 60_000) {
      const waitSec = Math.ceil((60_000 - age) / 1000);
      return errorResponse({ code: 'rate_limited', message: `Please wait ${waitSec} seconds before sending another code.` });
    }
  }

  // 4. Generate and store OTP (reuse phone_change_otps table).
  const otp      = generateOtp();
  const otp_hash = await hashOtp(otp);
  const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
  const localNewPhone = toLocalLK(new_phone);

  await admin.from('phone_change_otps').upsert(
    { account_id, new_phone: localNewPhone, otp_hash, expires_at, created_at: new Date().toISOString() },
    { onConflict: 'account_id' },
  );

  // 5. Send OTP via text.lk.
  const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS service is not configured.' });
  }

  const SMS_SENDER = await getSmsSender(admin);

  const cfg: TextLkConfig = { apiToken: TEXTLK_API_TOKEN, senderId: SMS_SENDER };
  const sms = await sendSingle(cfg, localNewPhone, `Your phone verification code is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes.`);

  if (!sms.ok) {
    const detail = sms.error ?? `HTTP ${sms.status}: ${sms.raw.slice(0, 300)}`;
    console.error('SMS send failed:', detail);
    return errorResponse({ code: 'server_error', message: 'Could not send the SMS code right now. Please try again in a few minutes.' });
  }

  return jsonResponse({ ok: true });
});
