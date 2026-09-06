// =============================================================================
// get_plans — public list of subscription packages (prices come from the DB,
// so super-admin price changes reach the app without an app update).
// =============================================================================
// Auth:   None (public pricing info — shown on the registration plan picker
//         before the teacher has an account).
// Output: { plans: [{ code, name, blurb, max_students, price_cents, currency }] }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse({ code: 'invalid_input', message: 'GET or POST only' });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from('subscription_plans')
    .select('code, name, blurb, max_students, price_cents, currency')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return errorResponse({ code: 'internal', message: 'Failed to load plans', details: error.message });
  }

  return jsonResponse({ plans: data ?? [] });
});
