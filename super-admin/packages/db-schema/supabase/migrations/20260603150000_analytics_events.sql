-- =============================================================================
-- 20260603150000_analytics_events.sql
-- Product analytics — which features get used and where users drop off.
--
-- The teacher/assistant apps fire lightweight events (screen views, feature use,
-- funnel steps). Each row is owned by the auth user that created it. Clients can
-- only INSERT their own events; they can never read the table back. Super admins
-- read it (dashboards / funnels) via is_super_admin().
--
-- Volume control: this table can grow fast, so keep only what we need and prune
-- old rows on a schedule (see retention note at the bottom).
-- =============================================================================

create table public.analytics_events (
  id          bigint generated always as identity primary key,
  -- The signed-in user (teacher OR assistant). Defaults to the JWT subject so a
  -- client cannot spoof another user's events (RLS also enforces this).
  user_id     uuid not null default auth.uid(),
  -- 'teacher' | 'assistant' | other — lets us segment funnels by role.
  role        text,
  -- Dotted event name, e.g. 'screen.view', 'student.add', 'sms.send'.
  event       text not null,
  -- Arbitrary structured payload (screen name, count, source, etc.).
  props       jsonb not null default '{}'::jsonb,
  -- Per-app-launch id so we can reconstruct sessions / drop-off paths.
  session_id  text,
  platform    text,            -- 'ios' | 'android' | 'web'
  app_version text,
  -- When the event happened on the device (may differ from created_at offline).
  client_ts   timestamptz,
  -- Server insert time (authoritative ordering).
  created_at  timestamptz not null default now()
);

comment on table public.analytics_events is
  'Product analytics events (feature usage + funnels). Clients insert own rows only; super admins read.';

-- Query helpers: by event over time, by user, and by session for funnels.
create index analytics_events_event_created_idx on public.analytics_events (event, created_at desc);
create index analytics_events_user_created_idx  on public.analytics_events (user_id, created_at desc);
create index analytics_events_session_idx       on public.analytics_events (session_id);

alter table public.analytics_events enable row level security;

-- Clients may insert ONLY rows attributed to themselves. No update/delete/select.
create policy "analytics_insert_own"
  on public.analytics_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Super admins can read everything for dashboards.
create policy "analytics_admin_read"
  on public.analytics_events
  for select
  to authenticated
  using (public.is_super_admin());

-- ---- Retention --------------------------------------------------------------
-- Keep ~180 days of raw events. Run this from a scheduled job (pg_cron) or the
-- health-check function; it's cheap and bounded by the created_at index.
--   delete from public.analytics_events where created_at < now() - interval '180 days';
