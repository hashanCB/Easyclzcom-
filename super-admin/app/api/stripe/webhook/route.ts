import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { createAdminClient } from '@/lib/supabase/admin';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Webhook signature invalid: ${msg}` }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      // In Stripe v22, period fields live on the first subscription item
      const item = sub.items?.data?.[0];
      const periodStart = item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null;
      const periodEnd = item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null;

      await admin
        .from('subscriptions')
        .update({
          status: sub.status,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancelled_at: sub.canceled_at
            ? new Date(sub.canceled_at * 1000).toISOString()
            : null,
          cancel_at_period_end: sub.cancel_at_period_end,
        })
        .eq('stripe_subscription_id', sub.id);
      break;
    }

    case 'invoice.payment_succeeded': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      const stripeSubId: string | null = invoice.subscription ?? null;
      if (!stripeSubId) break;

      const { data: subRow } = await admin
        .from('subscriptions')
        .select('id, teacher_id')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle();

      if (!subRow) break;

      await admin.from('subscription_events').insert({
        teacher_id: subRow.teacher_id,
        subscription_id: subRow.id,
        stripe_event_id: event.id,
        event_type: 'payment_succeeded',
        amount_cents: invoice.amount_paid,
        payload: event as unknown as Record<string, unknown>,
        occurred_at: new Date(invoice.created * 1000).toISOString(),
      });

      await admin
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('id', subRow.id);
      break;
    }

    case 'invoice.payment_failed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      const stripeSubId: string | null = invoice.subscription ?? null;
      if (!stripeSubId) break;

      await admin
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', stripeSubId);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
