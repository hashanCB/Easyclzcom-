-- =============================================================================
-- 20260624100000_device_trials.sql
-- One free trial per phone. Records every device that has already been granted
-- a sign-up trial, so a NEW account created later on the SAME phone starts
-- WITHOUT a fresh trial (it begins 'inactive' and must subscribe).
--
-- Note: switching phones with the SAME account is unaffected — that path is a
-- login, which never creates a subscription. This table only gates the trial
-- handed out at registration (register_teacher_confirm).
-- =============================================================================

create table if not exists public.device_trials (
  device_id        text primary key,
  -- The first account that consumed the trial on this device (informational;
  -- kept even if that teacher is later deleted).
  first_teacher_id uuid references public.teachers(id) on delete set null,
  first_used_at    timestamptz not null default now()
);

alter table public.device_trials enable row level security;

-- Service role (edge functions) bypasses RLS. Super-admin may read for support.
drop policy if exists "device_trials_super_admin_all" on public.device_trials;
create policy "device_trials_super_admin_all"
  on public.device_trials for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
