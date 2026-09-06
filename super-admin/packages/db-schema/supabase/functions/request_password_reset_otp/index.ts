// request_password_reset_otp — send OTP to registered phone so student can reset forgotten password.
// Auth:   None (public) — identity verified by phone number (account must exist).
// Input:  { phone }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendSingle, type TextLkConfig } from '../_shared/textlk.ts';
import { toLocalLK, generateOtp, hashOtp } from '../_shared/student-otp.ts';
import { getSmsSender } from '../_shared/sms-config.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  phone: z.string().min(7).max(20),
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
  const { phone } = parsed.data;

  const admin = adminClient();

  // 1. Normalise phone to local format (DB stores 07XXXXXXXXX, user may type +94...).
  const localPhone = toLocalLK(phone);

  // Look up account by phone — no error if not found (avoid account enumeration).
  const { data: account } = await admin
    .from('student_accounts')
    .select('id')
    .eq('phone', localPhone)
    .maybeSingle();

  // Always respond ok — prevents phone enumeration attacks.
  if (!account) return jsonResponse({ ok: true });

  // 2. Rate-limit OTP requests — 1 per 60 seconds.
  const { data: recent } = await admin
    .from('password_reset_otps')
    .select('created_at')
    .eq('account_id', account.id)
    .maybeSingle();

  if (recent && Deno.env.get('APP_ENV') !== 'dev') {
    const age = Date.now() - new Date(recent.created_at).getTime();
    if (age < 60_000) {
      const waitSec = Math.ceil((60_000 - age) / 1000);
      return errorResponse({ code: 'rate_limited', message: `Please wait ${waitSec} seconds before requesting another code.` });
    }
  }

  // 3. Generate and store OTP.
  const otp      = generateOtp();
  const otp_hash = await hashOtp(otp);
  const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  await admin.from('password_reset_otps').upsert(
    { account_id: account.id, otp_hash, expires_at, created_at: new Date().toISOString() },
    { onConflict: 'account_id' },
  );

  // 4. Send OTP via text.lk.
  const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS service is not configured.' });
  }

  const isDev = Deno.env.get('APP_ENV') === 'dev';
  const SMS_SENDER = await getSmsSender(admin);
  const e164Phone = toLocalLK(phone);
  const cfg: TextLkConfig = { apiToken: TEXTLK_API_TOKEN, senderId: SMS_SENDER };
  const sms = await sendSingle(cfg, e164Phone, `Your password reset code is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share it.`);

  if (!sms.ok) {
    const detail = sms.error ?? `HTTP ${sms.status}: ${sms.raw.slice(0, 300)}`;
    console.error('SMS send failed:', detail);
    // In dev, SMS failure is non-fatal: return the OTP so testing continues
    // even when the SMS provider is down. Never happens in production.
    if (!isDev) {
      return errorResponse({ code: 'server_error', message: 'Could not send the SMS code right now. Please try again in a few minutes.' });
    }
  }

  return jsonResponse({ ok: true, ...(isDev ? { dev_otp: otp } : {}) });
});
