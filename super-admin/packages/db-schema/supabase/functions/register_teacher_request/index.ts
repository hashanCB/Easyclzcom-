// =============================================================================
// register_teacher_request — public teacher sign-up, step 1 (send phone OTP)
// =============================================================================
// Auth:   None (public) — the phone OTP is the proof of identity.
// Input:  { name?, username, phone }
// Output: { ok: true }
//
// Checks username + phone are free, rate-limits, stores a PENDING registration
// (no password — that is supplied in step 2), and SMSes a 6-digit OTP. The
// account is only created in register_teacher_confirm once the OTP is verified.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { RegisterTeacherRequestInput } from '../_shared/schema.ts';
import { sendSingle, type TextLkConfig } from '../_shared/textlk.ts';
import { toLocalLK, generateOtp, hashOtp } from '../_shared/student-otp.ts';
import { getSmsSender } from '../_shared/sms-config.ts';

const OTP_TTL_MINUTES = 10;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse({ code: 'invalid_input', message: 'POST only' });

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = RegisterTeacherRequestInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const username = input.username.toLowerCase();
  const phone = toLocalLK(input.phone);
  const email = input.email?.trim().toLowerCase() ?? null;

  const admin = adminClient();

  // 1. Username must be free. (Sign-up UX intentionally reveals this — unlike
  //    password reset, there is no enumeration concern for a public sign-up.)
  const { data: takenName } = await admin
    .from('teachers')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (takenName) {
    return errorResponse({ code: 'username_taken', message: 'That username is already taken.' });
  }

  // 2. Phone must not already belong to a teacher (prevents duplicate accounts).
  //    A distinct code lets the app offer "reset your password" instead of just
  //    failing — the number already has an account.
  const { data: takenPhone } = await admin
    .from('teachers')
    .select('id')
    .eq('phone', phone)
    .is('deleted_at', null)
    .maybeSingle();
  if (takenPhone) {
    return errorResponse({ code: 'phone_taken', message: 'An account already exists for this phone number. You can reset your password instead.' });
  }

  // 3. Rate-limit: 1 OTP per 60 seconds per phone (skipped on DEV for testing).
  if (Deno.env.get('APP_ENV') !== 'dev') {
    const { data: recent } = await admin
      .from('teacher_registration_otps')
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
  }

  // 4. Generate + store the OTP (and the pending name/username for this phone).
  const otp = generateOtp();
  const otp_hash = await hashOtp(otp);
  const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  const { error: upsertErr } = await admin.from('teacher_registration_otps').upsert(
    { phone, username, name: input.name ?? null, email, otp_hash, expires_at, created_at: new Date().toISOString() },
    { onConflict: 'phone' },
  );
  if (upsertErr) {
    return errorResponse({ code: 'server_error', message: upsertErr.message });
  }

  // 5. Send the OTP via text.lk.
  const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";
  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS service is not configured.' });
  }
  const isDev = Deno.env.get('APP_ENV') === 'dev';
  const senderId = await getSmsSender(admin);
  const cfg: TextLkConfig = { apiToken: TEXTLK_API_TOKEN, senderId };
  const sms = await sendSingle(cfg, phone, `Your registration code is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share it.`);
  if (!sms.ok) {
    const detail = sms.error ?? `HTTP ${sms.status}: ${sms.raw.slice(0, 300)}`;
    console.error('SMS send failed:', detail);
    // In dev, return the OTP so testing continues even if SMS is down.
    if (!isDev) {
      return errorResponse({ code: 'server_error', message: 'Could not send the SMS code right now. Please try again in a few minutes.' });
    }
  }

  return jsonResponse({ ok: true, ...(isDev ? { dev_otp: otp } : {}) });
});
