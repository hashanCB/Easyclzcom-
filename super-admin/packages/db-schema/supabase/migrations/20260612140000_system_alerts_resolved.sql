-- =============================================================================
-- 20260612140000_system_alerts_resolved.sql
-- Let the super admin dismiss alerts on the new Alerts page.
-- =============================================================================

alter table public.system_alerts
  add column if not exists resolved_at timestamptz;

create index if not exists system_alerts_unresolved_idx
  on public.system_alerts (created_at desc)
  where resolved_at is null;
