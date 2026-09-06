// get_invoices — returns the teacher's Stripe invoice history (last 24).
// Output: { invoices: Invoice[] }
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
    .select('stripe_customer_id')
    .eq('teacher_id', user.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return jsonResponse({ invoices: [] });
  }

  const list = await stripe.invoices.list({
    customer: sub.stripe_customer_id,
    limit: 24,
  });

  const invoices = list.data.map((inv) => ({
    id: inv.id,
    amount_paid: inv.amount_paid,           // cents
    currency: inv.currency,
    status: inv.status,                     // 'paid' | 'open' | 'void' | 'uncollectible'
    period_start: inv.period_start,         // unix timestamp
    period_end: inv.period_end,
    created: inv.created,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
  }));

  return jsonResponse({ invoices });
});
