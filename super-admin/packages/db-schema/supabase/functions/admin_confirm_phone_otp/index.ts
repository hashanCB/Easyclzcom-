// admin_confirm_phone_otp — admin verifies OTP and applies new phone for a student.
// Auth:   Supabase JWT (admin must be authenticated).
// Input:  { account_id, new_phone, otp }
// Output: { ok: true, new_phone }
//
// No monthly rate limit — this is an admin override action.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { toLocalLK, hashOtp } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
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
  const { account_id, new_phone, otp } = parsed.data;

  const admin = adminClient();
  const localNewPhone = toLocalLK(new_phone);

  // 1. Verify account exists.
  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id')
    .eq('id', account_id)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'not_found', message: 'Student account not found.' });
  }

  // 2. Fetch pending OTP.
  const { data: pending } = await admin
    .from('phone_change_otps')
    .select('otp_hash, new_phone, expires_at')
    .eq('account_id', account_id)
    .maybeSingle();

  if (!pending) {
    return errorResponse({ code: 'not_found', message: 'No verification request found. Please send a new code.' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    await admin.from('phone_change_otps').delete().eq('account_id', account_id);
    return errorResponse({ code: 'not_found', message: 'Verification code expired. Please send a new one.' });
  }
  if (pending.new_phone !== localNewPhone) {
    return errorResponse({ code: 'invalid_input', message: 'Phone number mismatch. Please start over.' });
  }

  // 3. Verify OTP.
  const otp_hash = await hashOtp(otp);
  if (otp_hash !== pending.otp_hash) {
    return errorResponse({ code: 'wrong_credentials', message: 'Incorrect verification code.' });
  }

  // 4. Apply phone change (no rate limit increment for admin overrides).
  const { error: updateErr } = await admin
    .from('student_accounts')
    .update({ phone: localNewPhone })
    .eq('id', account_id);

  if (updateErr) {
    if (updateErr.code === '23505') {
      return errorResponse({ code: 'conflict', message: 'This phone number was just registered by someone else.' });
    }
    return errorResponse({ code: 'server_error', message: updateErr.message });
  }

  // 5. Clean up OTP.
  await admin.from('phone_change_otps').delete().eq('account_id', account_id);

  return jsonResponse({ ok: true, new_phone: localNewPhone });
});
