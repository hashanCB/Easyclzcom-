-- Teacher lifecycle RPCs for super admin dashboard (U25 lifecycle)
-- 1. get_teacher_activity_list() — per-teacher health score for spotting inactive accounts
-- 2. get_onboarding_funnel()    — stage funnel: created→activated→class→student→payment

-- ── 1. Activity list with health score ────────────────────────────────────────
-- Health score 0-100:
--   Recency (last_login_at):  <7d=50pts  <30d=30pts  <90d=15pts  any=5pts  never=0
--   Students (non-deleted):   6pts each, capped at 30
--   Payments recorded:        20pts if ≥1 payment
--   Inactive account:         forced to 0

create or replace function public.get_teacher_activity_list()
returns table(
  id            uuid,
  username      text,
  name          text,
  is_active     boolean,
  sub_status    text,
  last_login_at timestamptz,
  student_count bigint,
  payment_count bigint,
  health_score  int
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.username::text,
    t.name,
    t.is_active,
    s.status                                              as sub_status,
    t.last_login_at,
    count(distinct st.id)                                 as student_count,
    count(distinct p.id)                                  as payment_count,
    case
      when not t.is_active then 0
      else
        least(100,
          case
            when t.last_login_at > now() - interval '7 days'  then 50
            when t.last_login_at > now() - interval '30 days' then 30
            when t.last_login_at > now() - interval '90 days' then 15
            when t.last_login_at is not null                   then 5
            else 0
          end
          + least(30, count(distinct st.id)::int * 6)
          + case when count(distinct p.id) > 0 then 20 else 0 end
        )
    end::int                                              as health_score
  from public.teachers t
  left join public.subscriptions s
    on  s.teacher_id = t.id
    and s.deleted_at is null
  left join public.students st
    on  st.teacher_id = t.id
    and st.deleted_at is null
  left join public.payments p
    on  p.teacher_id = t.id
    and p.deleted_at is null
  where t.deleted_at is null
  group by t.id, t.username, t.name, t.is_active, s.status, t.last_login_at
  order by health_score desc, t.created_at desc;
$$;

revoke all on function public.get_teacher_activity_list() from public;
grant execute on function public.get_teacher_activity_list() to authenticated;


-- ── 2. Onboarding funnel ───────────────────────────────────────────────────────
-- Five stages (each is cumulative — every teacher counted from their earliest stage):
--   created       → all non-deleted teachers
--   activated     → at least one login (last_login_at IS NOT NULL)
--   has_class     → created ≥1 class
--   has_student   → added ≥1 student
--   has_payment   → recorded ≥1 payment

create or replace function public.get_onboarding_funnel()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'created',     (select count(*) from public.teachers where deleted_at is null),
    'activated',   (select count(*) from public.teachers where deleted_at is null and last_login_at is not null),
    'has_class',   (
      select count(distinct t.id)
      from   public.teachers t
      join   public.classes  c on c.teacher_id = t.id and c.deleted_at is null
      where  t.deleted_at is null
    ),
    'has_student', (
      select count(distinct t.id)
      from   public.teachers t
      join   public.students s on s.teacher_id = t.id and s.deleted_at is null
      where  t.deleted_at is null
    ),
    'has_payment', (
      select count(distinct t.id)
      from   public.teachers t
      join   public.payments p on p.teacher_id = t.id and p.deleted_at is null
      where  t.deleted_at is null
    )
  );
$$;

revoke all on function public.get_onboarding_funnel() from public;
grant execute on function public.get_onboarding_funnel() to authenticated;
