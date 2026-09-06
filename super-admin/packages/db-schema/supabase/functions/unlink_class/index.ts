// unlink_class — student removes themselves from a class (deletes the portal link).
// Auth:   None (public) — identity proven by account_id + phone.
// Input:  { account_id, phone, student_id }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { toLocalLK } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
  student_id: z.string().uuid(),
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
  const { account_id, phone: rawPhone, student_id } = parsed.data;
  const phone = toLocalLK(rawPhone);

  const admin = adminClient();

  // 1. Verify the account exists (id + phone must match).
  const { data: account } = await admin
    .from('student_accounts')
    .select('id')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (!account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  // 2. Verify the link belongs to this account before deleting.
  const { data: link } = await admin
    .from('student_account_links')
    .select('id')
    .eq('student_account_id', account_id)
    .eq('student_id', student_id)
    .maybeSingle();

  if (!link) {
    // Already gone or never existed — treat as success (idempotent).
    return jsonResponse({ ok: true });
  }

  // 3. Delete the link.
  const { error: delErr } = await admin
    .from('student_account_links')
    .delete()
    .eq('id', link.id);

  if (delErr) {
    return errorResponse({ code: 'server_error', message: delErr.message });
  }

  return jsonResponse({ ok: true });
});
