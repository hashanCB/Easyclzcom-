// =============================================================================
// create_checkout_session — creates a Stripe Checkout session for the chosen
// subscription package (starter / basic / growth / unlimited).
// =============================================================================
// Input:  { plan_code?, return_url? } — teacher identified via JWT
// Output: { url: string }  — Stripe hosted checkout URL
//
// The amount charged comes from subscription_plans.price_cents (admin-editable)
// via Stripe price_data, so no Stripe dashboard price objects are needed.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

const PRICE_ID = Deno.env.get('STRIPE_PRICE_ID') ?? '';
// Stripe redirects the browser to checkout_result, which then bounces it back
// into the app. checkout_result needs an app deep link to return to — the app
// passes its own (return_url) so this works in Expo Go (exp://), standalone
// builds (teacher-app://), and prod alike.
const RESULT_URL = Deno.env.get('CHECKOUT_RESULT_URL') ?? 'https://kesssbvejyeefyaqjobk.supabase.co/functions/v1/checkout_result';

function resultUrl(result: 'success' | 'cancel', returnUrl: string | null): string {
  const u = new URL(RESULT_URL);
  u.searchParams.set('result', result);
  if (returnUrl) u.searchParams.set('return', returnUrl);
  return u.toString();
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  // Identify teacher from JWT
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }

  const teacherId = user.id;
  const admin = adminClient();
  const { stripe } = await getStripe();

  // Where the app wants the browser sent back to after checkout. Optional, so
  // older app builds (which don't send it) still fall back to the app scheme.
  let returnUrl: string | null = null;
  let planCode: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.return_url === 'string' && body.return_url) returnUrl = body.return_url;
    if (typeof body?.plan_code === 'string' && body.plan_code) planCode = body.plan_code;
  } catch { /* no/invalid body — fine, use the default */ }

  // Get teacher username (for Stripe customer name)
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, username')
    .eq('id', teacherId)
    .maybeSingle();

  if (!teacher) {
    return errorResponse({ code: 'not_found', message: 'Teacher not found' });
  }

  // Get or create subscription row
  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, stripe_customer_id, status, current_period_end')
    .eq('teacher_id', teacherId)
    .maybeSingle();

  // Only an already-paying teacher is blocked. Trialing teachers MAY pay —
  // picking a plan during the trial is the normal upgrade path from the
  // subscription page.
  if (sub?.status === 'active') {
    return errorResponse({ code: 'conflict', message: 'Already subscribed' });
  }

  // Resolve the chosen package (price + name come from the DB so super-admin
  // price edits apply immediately). Default to 'growth' for old app builds
  // that don't send a plan_code.
  const { data: plan } = await admin
    .from('subscription_plans')
    .select('code, name, price_cents, currency, max_students')
    .eq('code', planCode ?? 'growth')
    .eq('is_active', true)
    .maybeSingle();

  // Get or create Stripe customer
  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { teacher_id: teacherId, username: teacher.username },
    });
    customerId = customer.id;

    // Upsert subscription row with customer ID
    await admin.from('subscriptions').upsert(
      { teacher_id: teacherId, stripe_customer_id: customerId, status: 'inactive' },
      { onConflict: 'teacher_id' },
    );
  }

  // Charge the plan's current DB price via price_data; fall back to the legacy
  // fixed Stripe price only if the plan lookup failed (e.g. migration not run).
  const lineItem = plan
    ? {
        price_data: {
          currency: plan.currency || 'usd',
          unit_amount: plan.price_cents,
          recurring: { interval: 'month' as const },
          product_data: {
            name: `Easyclz ${plan.name}`,
            description: plan.max_students == null
              ? 'Unlimited students'
              : `Up to ${plan.max_students} students`,
          },
        },
        quantity: 1,
      }
    : { price: PRICE_ID, quantity: 1 };

  const effectivePlanCode = plan?.code ?? 'pro_monthly';

  // Create Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [lineItem],
    success_url: resultUrl('success', returnUrl),
    cancel_url: resultUrl('cancel', returnUrl),
    metadata: { teacher_id: teacherId, plan_code: effectivePlanCode },
    subscription_data: {
      metadata: { teacher_id: teacherId, plan_code: effectivePlanCode },
    },
  });

  return jsonResponse({ url: session.url });
});
