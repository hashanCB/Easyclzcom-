// confirm_phone_change — verify OTP and apply phone number change.
// Auth:   None (public) — identity proven by account_id + phone + otp.
// Input:  { account_id, phone, new_phone, otp }
// Output: { ok: true, new_phone }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { toLocalLK, hashOtp, checkRateLimit } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
  new_phone:  z.string().min(7).max(20),
  otp:        z.string().length(6),
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
  const { account_id, phone: rawPhone, new_phone: rawNewPhone, otp } = parsed.data;
  const phone     = toLocalLK(rawPhone);     // normalise for DB lookup
  const new_phone = toLocalLK(rawNewPhone);  // normalise before storing

  const admin = adminClient();

  // 1. Verify the account exists (id + current phone match) — stable columns only.
  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  // 1b. Read rate-limit counters separately (newer columns — isolated so a cache miss doesn't block verify).
  const { data: counters } = await admin
    .from('student_accounts')
    .select('phone_change_month, phone_change_count')
    .eq('id', account.id)
    .maybeSingle();

  // 2. Fetch pending OTP.
  const { data: pending } = await admin
    .from('phone_change_otps')
    .select('otp_hash, new_phone, expires_at')
    .eq('account_id', account_id)
    .maybeSingle();

  if (!pending) {
    return errorResponse({ code: 'not_found', message: 'No verification request found. Please start over.' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    await admin.from('phone_change_otps').delete().eq('account_id', account_id);
    return errorResponse({ code: 'not_found', message: 'Verification code expired. Please request a new one.' });
  }
  if (pending.new_phone !== new_phone) {
    return errorResponse({ code: 'invalid_input', message: 'Phone number mismatch. Please start over.' });
  }

  // 3. Verify OTP hash.
  const otp_hash = await hashOtp(otp);
  if (otp_hash !== pending.otp_hash) {
    return errorResponse({ code: 'wrong_credentials', message: 'Incorrect verification code.' });
  }

  // 4. Apply phone change + increment monthly counter.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { newCount } = checkRateLimit(counters?.phone_change_month, counters?.phone_change_count, currentMonth, 99);

  const { error: updateErr } = await admin
    .from('student_accounts')
    .update({ phone: new_phone, phone_change_month: currentMonth, phone_change_count: newCount })
    .eq('id', account_id);

  if (updateErr) {
    if (updateErr.code === '23505') {
      return errorResponse({ code: 'conflict', message: 'This phone number was just registered by someone else.' });
    }
    return errorResponse({ code: 'server_error', message: updateErr.message });
  }

  // 5. Clean up OTP.
  await admin.from('phone_change_otps').delete().eq('account_id', account_id);

  return jsonResponse({ ok: true, new_phone });
});
