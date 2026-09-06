// =============================================================================
// get_student_notifications — the student portal bell feed.
// =============================================================================
// Auth:   None (public) — identity proven by account_id + phone.
// Input:  { account_id, phone }
// Output: { notifications: [...], unread: number }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
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
  const { account_id, phone } = parsed.data;

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

  const { data: rows } = await admin
    .from('student_notifications')
    .select('id, type, title, body, data, is_read, created_at')
    .eq('student_account_id', account_id)
    .order('created_at', { ascending: false })
    .limit(50);

  const notifications = rows ?? [];
  const unread = notifications.reduce((n, r) => (r.is_read ? n : n + 1), 0);

  return jsonResponse({ notifications, unread });
});
