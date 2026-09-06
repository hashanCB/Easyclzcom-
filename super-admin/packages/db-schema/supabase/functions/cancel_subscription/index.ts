// cancel_subscription — sets cancel_at_period_end = true on the teacher's Stripe subscription.
// The subscription stays active (is_pro = true) until current_period_end.
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const { stripe } = await getStripe();
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }

  const admin = adminClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, status, cancel_at_period_end')
    .eq('teacher_id', user.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return errorResponse({ code: 'not_found', message: 'No active subscription found' });
  }

  if (sub.cancel_at_period_end) {
    return errorResponse({ code: 'conflict', message: 'Subscription is already set to cancel' });
  }

  if (sub.status !== 'active' && sub.status !== 'trialing') {
    return errorResponse({ code: 'conflict', message: 'Subscription is not active' });
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  await admin
    .from('subscriptions')
    .update({ cancel_at_period_end: true })
    .eq('teacher_id', user.id);

  return jsonResponse({ ok: true });
});
