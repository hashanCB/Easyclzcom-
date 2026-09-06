// request_phone_change — verify identity and send OTP to new phone number.
// Auth:   None (public) — identity verified by account_id + phone + password.
// Input:  { account_id, phone, password, new_phone }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { verifyStudentPassword } from '../_shared/hash.ts';
import { sendSingle, type TextLkConfig } from '../_shared/textlk.ts';
import { toLocalLK, generateOtp, hashOtp, checkRateLimit } from '../_shared/student-otp.ts';
import { getSmsSender } from '../_shared/sms-config.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
  password:   z.string().min(1),
  new_phone:  z.string().min(7).max(20),
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
  const { account_id, phone: rawPhone, password, new_phone: rawNewPhone } = parsed.data;
  const phone    = toLocalLK(rawPhone);     // normalise current phone for DB lookup
  const new_phone = toLocalLK(rawNewPhone); // normalise new phone before storing

  if (phone === new_phone) {
    return errorResponse({ code: 'invalid_input', message: 'New phone number is the same as your current one.' });
  }

  const admin = adminClient();

  // 1. Verify identity — query only by id + phone (no new-column filters to avoid schema cache issues).
  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id, password_hash, phone_change_month, phone_change_count')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  const ok = await verifyStudentPassword(password, account.password_hash);
  if (!ok) return errorResponse({ code: 'wrong_credentials', message: 'Incorrect password.' });

  // 2. Monthly rate limit — max 2 phone changes per calendar month.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { allowed } = checkRateLimit(account.phone_change_month, account.phone_change_count, currentMonth, 2);
  if (!allowed) {
    const { data: supSetting } = await admin.from('app_settings').select('value').eq('key', 'support_contact_phone').maybeSingle();
    const supportPhone = supSetting?.value ?? '';
    return errorResponse({
      code: 'rate_limited',
      message: `You have already changed your phone number 2 times this month. You can change it again next month, or contact us for help.`,
      details: { support_phone: supportPhone },
    });
  }

  // 3. Check new phone not already taken.
  const { data: conflict } = await admin
    .from('student_accounts')
    .select('id')
    .eq('phone', new_phone)
    .maybeSingle();
  if (conflict) {
    return errorResponse({ code: 'conflict', message: 'This phone number is already registered to another account.' });
  }

  // 4. Rate-limit OTP requests — 1 per 60 seconds.
  const { data: recent } = await admin
    .from('phone_change_otps')
    .select('created_at')
    .eq('account_id', account_id)
    .maybeSingle();
  if (recent) {
    const age = Date.now() - new Date(recent.created_at).getTime();
    if (age < 60_000) {
      const waitSec = Math.ceil((60_000 - age) / 1000);
      return errorResponse({ code: 'rate_limited', message: `Please wait ${waitSec} seconds before requesting another code.` });
    }
  }

  // 5. Generate and store OTP.
  const otp      = generateOtp();
  const otp_hash = await hashOtp(otp);
  const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  await admin.from('phone_change_otps').upsert(
    { account_id, new_phone, otp_hash, expires_at, created_at: new Date().toISOString() },
    { onConflict: 'account_id' },
  );

  // 6. Send OTP via text.lk.
  const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS service is not configured.' });
  }

  const SMS_SENDER = await getSmsSender(admin);

  const e164Phone = toLocalLK(new_phone);

  const cfg: TextLkConfig = { apiToken: TEXTLK_API_TOKEN, senderId: SMS_SENDER };
  const sms = await sendSingle(cfg, e164Phone, `Your verification code is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share it.`);

  if (!sms.ok) {
    const detail = sms.error ?? `HTTP ${sms.status}: ${sms.raw.slice(0, 300)}`;
    console.error('SMS send failed:', detail);
    return errorResponse({ code: 'server_error', message: 'Could not send the SMS code right now. Please try again in a few minutes.' });
  }

  return jsonResponse({ ok: true });
});
