// =============================================================================
// save_student_push_subscription — store a browser's Web Push subscription.
// =============================================================================
// Auth:   None (public) — identity proven by account_id + phone.
// Input:  { account_id, phone, subscription: { endpoint, keys: { p256dh, auth } }, user_agent? }
// Output: { ok: true }
//
// Upserts on endpoint so re-subscribing the same browser updates in place.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth:   z.string().min(1),
    }),
  }),
  user_agent: z.string().max(400).optional(),
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
  const { account_id, phone, subscription, user_agent } = parsed.data;

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

  const { error } = await admin
    .from('student_push_subscriptions')
    .upsert({
      student_account_id: account_id,
      endpoint:           subscription.endpoint,
      p256dh:             subscription.keys.p256dh,
      auth:               subscription.keys.auth,
      user_agent:         user_agent ?? null,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'endpoint' });

  if (error) {
    return errorResponse({ code: 'server_error', message: 'Could not save subscription.' });
  }

  return jsonResponse({ ok: true });
});
