// reactivate_subscription — undoes a pending cancellation (cancel_at_period_end → false).
// Only works when the subscription is still active and cancel_at_period_end = true.
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
    return errorResponse({ code: 'not_found', message: 'No subscription found' });
  }

  if (!sub.cancel_at_period_end) {
    return errorResponse({ code: 'conflict', message: 'Subscription is not scheduled to cancel' });
  }

  if (sub.status !== 'active' && sub.status !== 'trialing') {
    return errorResponse({ code: 'conflict', message: 'Subscription is not active' });
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: false,
  });

  await admin
    .from('subscriptions')
    .update({ cancel_at_period_end: false })
    .eq('teacher_id', user.id);

  return jsonResponse({ ok: true });
});
