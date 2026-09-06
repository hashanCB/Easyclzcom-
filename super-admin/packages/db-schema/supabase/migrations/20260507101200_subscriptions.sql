-- =============================================================================
-- 20260507101200_subscriptions.sql
-- Stripe-backed Pro subscription state per SRS §3.2 / §21.
-- One row per teacher (cancelling does not delete data — SRS §3.3).
-- =============================================================================

create table public.subscriptions (
  id                          uuid primary key default extensions.gen_random_uuid(),
  teacher_id                  uuid not null unique references public.teachers(id) on delete cascade,

  stripe_customer_id          text unique,
  stripe_subscription_id      text unique,
  status                      text not null default 'inactive' check (status in
    ('inactive','trialing','active','past_due','cancelled','incomplete')),
  plan_code                   text not null default 'pro_monthly',
  current_period_start        timestamptz,
  current_period_end          timestamptz,
  cancelled_at                timestamptz,
  cancel_at_period_end        boolean not null default false,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz,
  client_updated_at           timestamptz,
  synced_at                   timestamptz
);

create index subscriptions_status_idx on public.subscriptions (status);
create index subscriptions_period_idx on public.subscriptions (current_period_end) where status in ('active', 'trialing');

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions_super_admin_all"
  on public.subscriptions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Teacher: read own subscription only. Writes are via Stripe webhook (service
-- role) — teacher cannot self-update plan status.
create policy "subscriptions_teacher_select"
  on public.subscriptions for select
  using (auth.uid() = teacher_id);

-- ---- subscription_events ---------------------------------------------------
-- Append-only log of Stripe webhook events for audit + replay.
create table public.subscription_events (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,
  subscription_id     uuid not null references public.subscriptions(id) on delete cascade,

  stripe_event_id     text not null unique,
  event_type          text not null,
  amount_cents        bigint check (amount_cents is null or amount_cents >= 0),
  payload             jsonb not null,
  occurred_at         timestamptz not null,

  created_at          timestamptz not null default now()
);

create index subscription_events_teacher_idx     on public.subscription_events (teacher_id, occurred_at desc);
create index subscription_events_subscription_idx on public.subscription_events (subscription_id, occurred_at desc);

alter table public.subscription_events enable row level security;

create policy "subscription_events_super_admin_select"
  on public.subscription_events for select
  using (public.is_super_admin());

create policy "subscription_events_teacher_select"
  on public.subscription_events for select
  using (auth.uid() = teacher_id);

comment on table public.subscriptions is 'One row per teacher; mirrors Stripe subscription state.';
comment on table public.subscription_events is 'Append-only Stripe webhook log (audit + replay).';
