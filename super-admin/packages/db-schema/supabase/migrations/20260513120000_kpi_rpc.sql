-- KPI summary RPC for super admin dashboard (U10)
-- Returns aggregate counts and revenue in a single round-trip.
-- Security: restricted to super_admin role via is_super_admin().

create or replace function public.get_admin_kpi()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_teachers        bigint;
  v_active_teachers       bigint;
  v_inactive_teachers     bigint;
  v_active_subs           bigint;
  v_cancelled_subs        bigint;
  v_monthly_revenue_cents bigint;
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;

  select
    count(*)                                    into v_total_teachers
  from public.teachers
  where deleted_at is null;

  select
    count(*) filter (where is_active = true),
    count(*) filter (where is_active = false)
  into v_active_teachers, v_inactive_teachers
  from public.teachers
  where deleted_at is null;

  select
    count(*) filter (where status in ('active', 'trialing')),
    count(*) filter (where status = 'cancelled')
  into v_active_subs, v_cancelled_subs
  from public.subscriptions
  where deleted_at is null;

  -- Revenue: sum of successful payments in the current calendar month
  select coalesce(sum(se.amount_cents), 0)
  into v_monthly_revenue_cents
  from public.subscription_events se
  where se.event_type = 'payment_succeeded'
    and date_trunc('month', se.occurred_at) = date_trunc('month', now());

  return jsonb_build_object(
    'total_teachers',         v_total_teachers,
    'active_teachers',        v_active_teachers,
    'inactive_teachers',      v_inactive_teachers,
    'active_subs',            v_active_subs,
    'cancelled_subs',         v_cancelled_subs,
    'monthly_revenue_cents',  v_monthly_revenue_cents
  );
end;
$$;

-- Only super_admin may call this function
revoke all on function public.get_admin_kpi() from public;
grant execute on function public.get_admin_kpi() to authenticated;
