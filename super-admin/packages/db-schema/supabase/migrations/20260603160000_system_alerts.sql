-- =============================================================================
-- 20260603160000_system_alerts.sql
-- Backend health alerts — a small audit trail of problems the health_check
-- edge function detects (failed-SMS spikes, low SMS balance, etc.).
--
-- The health_check function (service role) inserts rows here and also texts an
-- admin. Super admins read the history from the dashboard. The table doubles as
-- a per-kind de-dupe window: we only re-alert for a kind once its cooldown has
-- passed (the function checks the latest row of the same kind).
-- =============================================================================

create table public.system_alerts (
  id          bigint generated always as identity primary key,
  kind        text not null,                 -- e.g. 'sms_failures', 'low_sms_balance'
  severity    text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  message     text not null,                 -- human-readable summary (also sent via SMS)
  details     jsonb not null default '{}'::jsonb,
  notified    boolean not null default false, -- did we manage to send the alert SMS?
  created_at  timestamptz not null default now()
);

comment on table public.system_alerts is
  'Backend health alerts raised by the health_check edge function. Service-role writes; super admins read.';

create index system_alerts_kind_created_idx on public.system_alerts (kind, created_at desc);

alter table public.system_alerts enable row level security;

-- Super admins can read the alert history (dashboard). No client writes — only
-- the service-role health_check function inserts (service role bypasses RLS).
create policy "system_alerts_admin_read"
  on public.system_alerts
  for select
  to authenticated
  using (public.is_super_admin());
