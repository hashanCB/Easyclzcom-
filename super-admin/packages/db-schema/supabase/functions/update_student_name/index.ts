// update_student_name — student changes their display name.
// Auth:   None (public) — identity verified by account_id + phone + password.
// Input:  { account_id, phone, password, name }
// Output: { ok: true, name }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { verifyStudentPassword } from '../_shared/hash.ts';
import { toLocalLK } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
  password:   z.string().min(1),
  name:       z.string().min(1).max(120).trim(),
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
  const { account_id, phone: rawPhone, password, name } = parsed.data;
  const phone = toLocalLK(rawPhone);

  const admin = adminClient();

  const { data: account } = await admin
    .from('student_accounts')
    .select('id, password_hash')
    .eq('id', account_id)
    .eq('phone', phone)
    .is('deleted_at', null)
    .maybeSingle();

  if (!account) return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });

  const ok = await verifyStudentPassword(password, account.password_hash);
  if (!ok) return errorResponse({ code: 'wrong_credentials', message: 'Incorrect password.' });

  await admin.from('student_accounts').update({ name }).eq('id', account_id);

  return jsonResponse({ ok: true, name });
});
