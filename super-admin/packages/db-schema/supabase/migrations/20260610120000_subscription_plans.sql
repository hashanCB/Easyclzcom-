-- =============================================================================
-- 20260610120000_subscription_plans.sql
-- Named subscription packages with per-plan student limits and admin-editable
-- prices. Replaces the single hardcoded 'pro_monthly' plan with four tiers:
--
--   starter    — up to 50 students   — $1/mo
--   basic      — up to 100 students  — $3/mo
--   growth     — up to 500 students  — $8/mo   (default trial plan)
--   unlimited  — unlimited students  — $25/mo
--
-- • The teacher app reads these via the get_plans edge function (paywall,
--   registration plan picker, subscription page).
-- • create_checkout_session charges price_cents via Stripe price_data, so a
--   super-admin price change applies to all NEW checkouts immediately.
-- • The super-admin Settings page edits price_cents; existing Stripe
--   subscriptions keep the price they signed up at.
-- =============================================================================

create table public.subscription_plans (
  code          text primary key,
  name          text not null,
  blurb         text not null default '',
  max_students  integer check (max_students is null or max_students > 0), -- null = unlimited
  price_cents   integer not null check (price_cents >= 0),
  currency      text not null default 'usd',
  sort_order    integer not null default 0,
  -- is_active: selectable by teachers. Legacy codes stay as inactive rows so
  -- old subscriptions still join to a name.
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger subscription_plans_set_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

insert into public.subscription_plans (code, name, blurb, max_students, price_cents, sort_order, is_active) values
  ('starter',   'Starter',   'New / small teacher',  50,   100,  1, true),
  ('basic',     'Basic',     'Growing classes',      100,  300,  2, true),
  ('growth',    'Growth',    'Most popular',         500,  800,  3, true),
  ('unlimited', 'Unlimited', 'Big tuition center',   null, 2500, 4, true),
  -- Legacy codes from before plans existed (kept so old rows resolve to a name)
  ('pro_monthly',  'Pro (legacy)',      '', null, 100, 99, false),
  ('pro_override', 'Pro (admin grant)', '', null, 0,   99, false);

alter table public.subscription_plans enable row level security;

-- Plans are public pricing information: anyone (including the unauthenticated
-- registration screen) may read them.
create policy "subscription_plans_public_select"
  on public.subscription_plans for select
  using (true);

create policy "subscription_plans_super_admin_all"
  on public.subscription_plans for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on table public.subscription_plans is
  'Subscription packages (student limit + price). Prices editable by super-admin; charged via Stripe price_data.';

-- ---- Backfill: give existing trials a real package ---------------------------
-- Trials created before this migration were stamped 'pro_monthly' with no tier.
-- Map them to 'growth' (the plan the trial is based on).
update public.subscriptions
   set plan_code = 'growth'
 where plan_code = 'pro_monthly'
   and status = 'trialing';

-- ---- Per-plan student limit (server-side enforcement) ------------------------
-- Returns the max student count for a teacher's current plan; null = unlimited.
-- Unknown plan codes are treated as unlimited (never lock a paying teacher out).
create or replace function public.teacher_student_limit(p_teacher uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select p.max_students
  from public.subscriptions s
  join public.subscription_plans p on p.code = s.plan_code
  where s.teacher_id = p_teacher
    and s.deleted_at is null
    and s.status in ('active', 'trialing')
  limit 1;
$$;

comment on function public.teacher_student_limit(uuid) is
  'Max students allowed by the teacher''s current plan (null = unlimited or no limit configured).';

-- Block INSERTs (only inserts — updates/soft-deletes of existing rows must
-- always go through, otherwise sync of edits would jam at the limit).
create or replace function public.enforce_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count bigint;
begin
  -- Service role (super-admin tools, restores) bypasses the limit.
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     or auth.uid() is null then
    return new;
  end if;

  v_limit := public.teacher_student_limit(new.teacher_id);
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count
  from public.students
  where teacher_id = new.teacher_id
    and deleted_at is null;

  if v_count >= v_limit then
    raise exception 'student_limit_reached: your plan allows up to % students', v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger students_enforce_plan_limit
before insert on public.students
for each row execute function public.enforce_student_limit();

-- ---- get_teacher_activity_list: expose the package -----------------------------
-- Adds plan_code so the super-admin Teachers page can filter teachers by package.
drop function if exists public.get_teacher_activity_list();

create or replace function public.get_teacher_activity_list()
returns table(
  id            uuid,
  username      text,
  name          text,
  is_active     boolean,
  sub_status    text,
  plan_code     text,
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
    s.plan_code                                           as plan_code,
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
  group by t.id, t.username, t.name, t.is_active, s.status, s.plan_code, t.last_login_at
  order by health_score desc, t.created_at desc;
$$;

revoke all on function public.get_teacher_activity_list() from public;
grant execute on function public.get_teacher_activity_list() to authenticated;
