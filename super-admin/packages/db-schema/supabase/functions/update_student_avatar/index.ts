// update_student_avatar — student sets their cosmetic emoji + color theme.
// Auth:   None (public) — identity verified by account_id + phone. No password (cosmetic only).
// Input:  { account_id, phone, emoji, color }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { toLocalLK } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// Allowed color theme keys — keep in sync with the frontend palette.
const COLORS = ['blue', 'violet', 'rose', 'emerald', 'amber', 'cyan', 'orange', 'pink'] as const;

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
  emoji:      z.string().min(1).max(8),
  color:      z.enum(COLORS),
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
  const { account_id, phone: rawPhone, emoji, color } = parsed.data;
  const phone = toLocalLK(rawPhone);

  const admin = adminClient();

  // Verify identity — stable columns only.
  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  const { error: updateErr } = await admin
    .from('student_accounts')
    .update({ avatar_emoji: emoji, avatar_color: color })
    .eq('id', account_id);

  if (updateErr) {
    return errorResponse({ code: 'server_error', message: updateErr.message });
  }

  return jsonResponse({ ok: true });
});
