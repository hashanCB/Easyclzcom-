-- Business metrics RPC for super admin dashboard (U25)
-- Returns MRR, subscription health, churn rate, and failed payment count.
-- MRR is derived from the latest payment_succeeded event per active subscription
-- because plan price is not stored directly on the subscriptions table.

create or replace function public.get_business_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mrr_cents            bigint;
  v_active_count         bigint;
  v_trialing_count       bigint;
  v_past_due_count       bigint;
  v_cancelled_this_month bigint;
  v_churn_rate_pct       numeric(5,2);
  v_failed_payments      bigint;
  v_churn_base           bigint;
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- MRR: sum of each active/trialing subscription's latest payment amount.
  -- Uses DISTINCT ON to pick the most recent payment per subscription.
  select coalesce(sum(latest.amount_cents), 0)
  into v_mrr_cents
  from (
    select distinct on (se.subscription_id)
      se.amount_cents
    from public.subscription_events se
    join public.subscriptions s on s.id = se.subscription_id
    where se.event_type = 'payment_succeeded'
      and s.status in ('active', 'trialing')
      and s.deleted_at is null
    order by se.subscription_id, se.occurred_at desc
  ) latest;

  -- Subscription counts by live status
  select
    count(*) filter (where status = 'active'),
    count(*) filter (where status = 'trialing'),
    count(*) filter (where status = 'past_due')
  into v_active_count, v_trialing_count, v_past_due_count
  from public.subscriptions
  where deleted_at is null;

  -- Cancellations in the current calendar month
  select count(*)
  into v_cancelled_this_month
  from public.subscriptions
  where status = 'cancelled'
    and deleted_at is null
    and date_trunc('month', cancelled_at) = date_trunc('month', now());

  -- Churn rate % = cancelled_this_month / (active + trialing + cancelled_this_month) × 100
  -- Denominator approximates "subscribers at the start of the month".
  v_churn_base := v_active_count + v_trialing_count + v_cancelled_this_month;
  if v_churn_base > 0 then
    v_churn_rate_pct := round(
      (v_cancelled_this_month::numeric / v_churn_base) * 100,
      2
    );
  else
    v_churn_rate_pct := 0;
  end if;

  -- Failed payments: payment_failed events logged this calendar month
  select count(*)
  into v_failed_payments
  from public.subscription_events
  where event_type = 'payment_failed'
    and date_trunc('month', occurred_at) = date_trunc('month', now());

  return jsonb_build_object(
    'mrr_cents',             v_mrr_cents,
    'active_count',          v_active_count,
    'trialing_count',        v_trialing_count,
    'past_due_count',        v_past_due_count,
    'cancelled_this_month',  v_cancelled_this_month,
    'churn_rate_pct',        v_churn_rate_pct,
    'failed_payments_count', v_failed_payments
  );
end;
$$;

-- Only super_admin may call this function
revoke all on function public.get_business_metrics() from public;
grant execute on function public.get_business_metrics() to authenticated;
