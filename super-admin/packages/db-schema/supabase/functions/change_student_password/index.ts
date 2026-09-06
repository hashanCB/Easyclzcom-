// change_student_password — student changes their own password (max 2×/month).
// Auth:   None (public) — identity verified by account_id + phone + current password.
// Input:  { account_id, phone, current_password, new_password }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { verifyStudentPassword, hashStudentPassword } from '../_shared/hash.ts';
import { toLocalLK, checkRateLimit } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id:       z.string().uuid(),
  phone:            z.string().min(7).max(20),
  current_password: z.string().min(1),
  new_password:     z.string().min(6).max(100),
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
  const { account_id, phone: rawPhone, current_password, new_password } = parsed.data;
  const phone = toLocalLK(rawPhone);

  const admin = adminClient();

  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id, password_hash, pw_change_month, pw_change_count')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  // Monthly rate limit — max 2 password changes per calendar month.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { allowed, newCount: changeCount } = checkRateLimit(account.pw_change_month, account.pw_change_count, currentMonth, 2);

  if (!allowed) {
    const { data: supSetting } = await admin.from('app_settings').select('value').eq('key', 'support_contact_phone').maybeSingle();
    const supportPhone = supSetting?.value ?? '';
    return errorResponse({
      code: 'rate_limited',
      message: `You have already changed your password 2 times this month. You can change it again next month, or contact us for help.`,
      details: { support_phone: supportPhone },
    });
  }

  const ok = await verifyStudentPassword(current_password, account.password_hash);
  if (!ok) return errorResponse({ code: 'wrong_credentials', message: 'Current password is incorrect.' });

  if (current_password === new_password) {
    return errorResponse({ code: 'invalid_input', message: 'New password must be different from your current one.' });
  }

  const password_hash = await hashStudentPassword(new_password);
  await admin.from('student_accounts').update({
    password_hash,
    pw_change_month: currentMonth,
    pw_change_count: changeCount + 1,
  }).eq('id', account_id);

  return jsonResponse({ ok: true });
});
