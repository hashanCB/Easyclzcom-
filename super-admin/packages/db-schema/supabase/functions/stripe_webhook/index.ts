// =============================================================================
// stripe_webhook — handles Stripe events and updates subscriptions table
// =============================================================================
// Events handled:
//   checkout.session.completed         → activate subscription
//   customer.subscription.updated      → sync status / period
//   customer.subscription.deleted      → mark cancelled
//   invoice.payment_failed             → mark past_due

import { adminClient } from '../_shared/supabase.ts';
import { getStripe, Stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 });
  }

  const { stripe, webhookSecret } = await getStripe();

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  const admin = adminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const teacherId = session.metadata?.teacher_id;
        if (!teacherId) break;

        const subscriptionId = session.subscription as string;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        await upsertSubscription(admin, teacherId, sub);
        await logEvent(admin, teacherId, event, null);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const teacherId = await resolveTeacherId(admin, sub);
        if (!teacherId) break;

        await upsertSubscription(admin, teacherId, sub);
        await logEvent(admin, teacherId, event, null);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const teacherId = await resolveTeacherId(admin, sub);
        if (!teacherId) break;

        await admin.from('subscriptions').update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          stripe_subscription_id: sub.id,
          updated_at: new Date().toISOString(),
        }).eq('teacher_id', teacherId);

        await logEvent(admin, teacherId, event, null);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const teacherId = await resolveTeacherId(admin, sub);
        if (!teacherId) break;

        await admin.from('subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('teacher_id', teacherId);

        await logEvent(admin, teacherId, event, null);
        break;
      }

      default:
        // Unhandled event type — return 200 to acknowledge receipt
        break;
    }
  } catch (err) {
    console.error('Error processing webhook event:', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Resolve the teacher for a subscription. Prefers the metadata that
// create_checkout_session stamps onto subscription_data; falls back to a
// lookup by stripe_customer_id for subscriptions created/edited outside our
// flow (e.g. directly in the Stripe dashboard, or legacy rows).
async function resolveTeacherId(
  // deno-lint-ignore no-explicit-any
  admin: any,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = sub.metadata?.teacher_id;
  if (fromMeta) return fromMeta;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const { data } = await admin
    .from('subscriptions')
    .select('teacher_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.teacher_id ?? null;
}

async function upsertSubscription(
  // deno-lint-ignore no-explicit-any
  admin: any,
  teacherId: string,
  sub: Stripe.Subscription,
) {
  const status = mapStripeStatus(sub.status);

  // Newer Stripe API exposes the billing period on the subscription item,
  // not the subscription object. Fall back to the subscription fields for
  // older API versions.
  const item = sub.items?.data?.[0];
  // deno-lint-ignore no-explicit-any
  const periodStart = (item as any)?.current_period_start ?? (sub as any).current_period_start;
  // deno-lint-ignore no-explicit-any
  const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end;

  // The plan the teacher picked is stamped into subscription metadata by
  // create_checkout_session. When absent (legacy subs created before plans
  // existed), leave plan_code untouched so we don't clobber the stored value.
  const planCode = sub.metadata?.plan_code;

  await admin.from('subscriptions').upsert(
    {
      teacher_id: teacherId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      status,
      ...(planCode ? { plan_code: planCode } : {}),
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'teacher_id' },
  );
}

async function logEvent(
  // deno-lint-ignore no-explicit-any
  admin: any,
  teacherId: string,
  event: Stripe.Event,
  amountCents: number | null,
) {
  const { data: sub } = await admin
    .from('subscriptions')
    .select('id')
    .eq('teacher_id', teacherId)
    .maybeSingle();

  if (!sub) return;

  // Idempotent: Stripe retries deliver the same event.id. The unique constraint
  // on stripe_event_id would otherwise throw 23505 → 500 → infinite retries.
  await admin.from('subscription_events').upsert({
    teacher_id: teacherId,
    subscription_id: sub.id,
    stripe_event_id: event.id,
    event_type: event.type,
    amount_cents: amountCents,
    payload: event.data.object,
    occurred_at: new Date(event.created * 1000).toISOString(),
  }, { onConflict: 'stripe_event_id', ignoreDuplicates: true });
}

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  const map: Record<string, string> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'cancelled',
    incomplete: 'incomplete',
    incomplete_expired: 'cancelled',
    unpaid: 'past_due',
    paused: 'inactive',
  };
  return map[stripeStatus] ?? 'inactive';
}
