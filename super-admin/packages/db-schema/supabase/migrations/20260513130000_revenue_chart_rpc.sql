-- Monthly revenue RPC for the last 12 months (U12)
-- Returns one row per month: { month_key text, revenue_cents bigint }
-- month_key format: 'YYYY-MM'

create or replace function public.get_monthly_revenue(months_back int default 12)
returns table(month_key text, revenue_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    to_char(m.month, 'YYYY-MM')                          as month_key,
    coalesce(sum(se.amount_cents), 0)::bigint             as revenue_cents
  from generate_series(
    date_trunc('month', now()) - ((months_back - 1) * interval '1 month'),
    date_trunc('month', now()),
    interval '1 month'
  ) as m(month)
  left join public.subscription_events se
    on  date_trunc('month', se.occurred_at) = m.month
    and se.event_type = 'payment_succeeded'
  group by m.month
  order by m.month;
end;
$$;

revoke all on function public.get_monthly_revenue(int) from public;
grant execute on function public.get_monthly_revenue(int) to authenticated;
