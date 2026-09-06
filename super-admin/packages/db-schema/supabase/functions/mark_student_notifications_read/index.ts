// =============================================================================
// mark_student_notifications_read — mark one (or all) bell items as read.
// =============================================================================
// Auth:   None (public) — identity proven by account_id + phone.
// Input:  { account_id, phone, id? }   // omit id to mark ALL as read
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
  id:         z.string().uuid().optional(),
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
  const { account_id, phone, id } = parsed.data;

  const admin = adminClient();

  const { data: account } = await admin
    .from('student_accounts')
    .select('id')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();
  if (!account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  let q = admin
    .from('student_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('student_account_id', account_id)
    .eq('is_read', false);
  if (id) q = q.eq('id', id);

  await q;

  return jsonResponse({ ok: true });
});
