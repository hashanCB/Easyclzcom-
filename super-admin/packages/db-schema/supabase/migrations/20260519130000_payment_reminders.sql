-- =============================================================================
-- 20260519130000_payment_reminders.sql
-- Scheduled payment reminders (U35, SRS §13.3).
-- A pg_cron job runs every 15 minutes and invokes the `dispatch_reminders`
-- edge function, which sends SMS to parents of unpaid students for any class
-- whose reminder day/time has arrived.
-- =============================================================================

-- pg_cron schedules the job; pg_net lets it call the edge function over HTTP.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---- dispatch log ----------------------------------------------------------
-- One row per (class, month) once reminders have been sent, so the 15-minute
-- cron never double-sends within the same month.
create table if not exists public.reminder_dispatch_log (
  id              uuid primary key default extensions.gen_random_uuid(),
  class_id        uuid not null references public.classes(id) on delete cascade,
  teacher_id      uuid not null references public.teachers(id) on delete cascade,
  month           text not null check (month ~ '^\d{4}-\d{2}$'),  -- YYYY-MM
  dispatched_at   timestamptz not null default now(),
  student_count   integer not null default 0,
  sent_count      integer not null default 0,
  failed_count    integer not null default 0,
  unique (class_id, month)
);

create index if not exists reminder_log_teacher_idx
  on public.reminder_dispatch_log (teacher_id, month);

alter table public.reminder_dispatch_log enable row level security;

create policy "reminder_log_super_admin_all"
  on public.reminder_dispatch_log for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Teachers may read their own dispatch history (writes happen via service role).
create policy "reminder_log_teacher_select"
  on public.reminder_dispatch_log for select
  using (auth.uid() = teacher_id);

comment on table public.reminder_dispatch_log is
  'Idempotency log for scheduled payment reminders — one row per class per month.';

-- ---- cron job --------------------------------------------------------------
-- Runs every 15 minutes. The Authorization header is built from a Vault secret
-- named `cron_secret`, which the dispatch_reminders edge function verifies
-- (it holds the same value as the function's CRON_SECRET env var).
--
-- NOTE (one-time manual setup, since the secret must not live in version control):
--   In Supabase Dashboard → SQL Editor, run:
--     select vault.create_secret('<cron-secret>', 'cron_secret');
--
select cron.unschedule('dispatch-payment-reminders')
where exists (
  select 1 from cron.job where jobname = 'dispatch-payment-reminders'
);

select cron.schedule(
  'dispatch-payment-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://kesssbvejyeefyaqjobk.supabase.co/functions/v1/dispatch_reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cron_secret' limit 1
      )
    ),
    body    := '{}'::jsonb
  );
  $$
);
