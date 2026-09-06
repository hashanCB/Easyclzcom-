// =============================================================================
// stripe_config_status — tells the super-admin Settings page where each Stripe
// key is coming from, WITHOUT ever exposing the values.
// =============================================================================
// Auth:   super admin JWT
// Output: { mode, keys: { test_secret, test_webhook, live_secret, live_webhook } }
//         each value is 'settings' | 'supabase_secret' | 'missing'

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { getCaller } from '../_shared/role.ts';

type Source = 'settings' | 'supabase_secret' | 'missing';

function sourceOf(settingValue: string | undefined, ...envNames: string[]): Source {
  if (settingValue) return 'settings';
  for (const name of envNames) {
    if (Deno.env.get(name)) return 'supabase_secret';
  }
  return 'missing';
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse({ code: 'invalid_input', message: 'GET or POST only' });
  }

  const caller = await getCaller(req);
  if (!caller || caller.role !== 'super_admin') {
    return errorResponse({ code: 'forbidden', message: 'Super admin only' });
  }

  const admin = adminClient();
  const { data } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'stripe_mode',
      'stripe_secret_key_test',
      'stripe_secret_key_live',
      'stripe_webhook_secret_test',
      'stripe_webhook_secret_live',
    ]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value as string]));

  return jsonResponse({
    mode: map.get('stripe_mode') === 'live' ? 'live' : 'test',
    keys: {
      test_secret: sourceOf(map.get('stripe_secret_key_test'), 'STRIPE_SECRET_KEY_TEST', 'STRIPE_SECRET_KEY'),
      test_webhook: sourceOf(map.get('stripe_webhook_secret_test'), 'STRIPE_WEBHOOK_SECRET_TEST', 'STRIPE_WEBHOOK_SECRET'),
      live_secret: sourceOf(map.get('stripe_secret_key_live'), 'STRIPE_SECRET_KEY_LIVE'),
      live_webhook: sourceOf(map.get('stripe_webhook_secret_live'), 'STRIPE_WEBHOOK_SECRET_LIVE'),
    },
  });
});
