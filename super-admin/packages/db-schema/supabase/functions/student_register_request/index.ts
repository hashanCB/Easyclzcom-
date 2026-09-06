// student_register_request — step 1 of phone-verified student registration.
// Auth:   None (public endpoint, no-verify-jwt)
// Input:  { phone, name, password }
// Output: { ok: true, debug_otp? }   (debug_otp only present in SMS demo mode)
//
// Validates the phone is free, hashes the password, generates a 6-digit OTP,
// stores a pending row in student_register_otps, and SMSes the code. The real
// student_accounts row is NOT created until student_register_confirm succeeds.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { hashStudentPassword } from '../_shared/hash.ts';
import { toLocalLK, generateOtp, hashOtp } from '../_shared/student-otp.ts';
import { sendSingle, type TextLkConfig } from '../_shared/textlk.ts';
import { getSmsSender, DEMO_SENDER_ID } from '../_shared/sms-config.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  phone:    z.string().min(7).max(20),
  name:     z.string().min(1).max(120),
  password: z.string().min(6).max(100),
});

const OTP_TTL_MINUTES = 10;

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
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { phone: rawPhone, name, password } = parsed.data;
  const phone = toLocalLK(rawPhone); // store/send in local 07... format

  const admin = adminClient();

  // 1. Phone must not already have a real account.
  const { data: existing } = await admin
    .from('student_accounts')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return errorResponse({ code: 'conflict', message: 'An account with this phone number already exists.' });
  }

  // 2. Anti-spam: 1 OTP request per 60 seconds for this phone.
  const { data: recent } = await admin
    .from('student_register_otps')
    .select('created_at')
    .eq('phone', phone)
    .maybeSingle();
  if (recent) {
    const age = Date.now() - new Date(recent.created_at).getTime();
    if (age < 60_000) {
      const waitSec = Math.ceil((60_000 - age) / 1000);
      return errorResponse({ code: 'rate_limited', message: `Please wait ${waitSec} seconds before requesting another code.` });
    }
  }

  // 3. Hash password + generate OTP, store the pending registration.
  const password_hash = await hashStudentPassword(password);
  const otp        = generateOtp();
  const otp_hash   = await hashOtp(otp);
  const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  const { error: upsertErr } = await admin.from('student_register_otps').upsert(
    { phone, name, password_hash, otp_hash, attempts: 0, expires_at, created_at: new Date().toISOString() },
    { onConflict: 'phone' },
  );
  if (upsertErr) {
    console.error('register otp upsert error', upsertErr);
    return errorResponse({ code: 'server_error', message: 'Could not start registration. Please try again.' });
  }

  // 4. Send OTP via text.lk.
  const TEXTLK_API_TOKEN = Deno.env.get('TEXTLK_API_TOKEN') ?? '';
  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS service is not configured.' });
  }

  const SMS_SENDER = await getSmsSender(admin);
  const cfg: TextLkConfig = { apiToken: TEXTLK_API_TOKEN, senderId: SMS_SENDER };
  const sms = await sendSingle(cfg, phone, `Your verification code is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes.`);

  if (!sms.ok) {
    const detail = sms.error ?? `HTTP ${sms.status}: ${sms.raw.slice(0, 300)}`;
    console.error('SMS send failed:', detail);
    return errorResponse({ code: 'server_error', message: 'Could not send the SMS code right now. Please try again in a few minutes.' });
  }

  // In demo SMS mode, return the OTP so testers don't need a real SMS.
  const isDemo = SMS_SENDER === DEMO_SENDER_ID;
  return jsonResponse({ ok: true, ...(isDemo ? { debug_otp: otp } : {}) });
});
