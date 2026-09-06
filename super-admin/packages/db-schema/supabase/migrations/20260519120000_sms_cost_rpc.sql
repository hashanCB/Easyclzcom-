-- Per-teacher SMS usage + cost summary RPC (U34)
-- Returns message counts by status and total cost for the calling teacher.
-- Security: definer, scoped to auth.uid() so a teacher only sees their own data.

create or replace function public.get_sms_cost_summary(p_month text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id     uuid := auth.uid();
  v_sent           bigint;
  v_failed         bigint;
  v_queued         bigint;
  v_total_cost     bigint;
  v_month_start    timestamptz;
  v_month_end      timestamptz;
begin
  if v_teacher_id is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Optional month filter, expects 'YYYY-MM'.
  if p_month is not null then
    v_month_start := to_timestamp(p_month || '-01', 'YYYY-MM-DD');
    v_month_end   := v_month_start + interval '1 month';
  end if;

  select
    count(*) filter (where status in ('sent', 'delivered')),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'queued'),
    coalesce(sum(cost_cents) filter (where status in ('sent', 'delivered')), 0)
  into v_sent, v_failed, v_queued, v_total_cost
  from public.messages
  where teacher_id = v_teacher_id
    and channel = 'sms'
    and deleted_at is null
    and (p_month is null or (created_at >= v_month_start and created_at < v_month_end));

  return jsonb_build_object(
    'sent',             v_sent,
    'failed',           v_failed,
    'queued',           v_queued,
    'total_cost_cents', v_total_cost
  );
end;
$$;

revoke all on function public.get_sms_cost_summary(text) from public;
grant execute on function public.get_sms_cost_summary(text) to authenticated;
