-- =============================================================================
-- Notifications (in-app notification center + push fan-out)
-- =============================================================================
-- A teacher-facing notification feed (the bell + unread badge in the app).
-- Rows are inserted server-side: by edge functions (chat, failed SMS, low SMS
-- balance) and by DB triggers (assistant-recorded payment / attendance).
--
-- Push delivery:
--   - Edge functions send the Expo push inline (reliable, no pg_net needed).
--   - Trigger-inserted rows fire a best-effort pg_net call to dispatch_push so
--     the teacher's phone still buzzes. If pg_net is unavailable the in-app
--     feed is still recorded — the write is never blocked.
-- =============================================================================

create table if not exists public.notifications (
  id           uuid primary key default extensions.gen_random_uuid(),
  teacher_id   uuid not null references public.teachers(id) on delete cascade,

  type         text not null check (type in (
                 'chat', 'sms_failed', 'sms_low_balance',
                 'payment', 'assistant_attendance', 'system')),
  title        text not null,
  body         text not null,
  data         jsonb not null default '{}'::jsonb,   -- routing payload (ids, etc.)

  is_read      boolean not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_teacher_created_idx
  on public.notifications (teacher_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (teacher_id) where is_read = false;

alter table public.notifications enable row level security;

-- The teacher owns their feed: read + mark-as-read only. Inserts are server-side
-- (service role / SECURITY DEFINER), which bypasses RLS — so no insert policy.
drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications
  for select using (auth.uid() = teacher_id);

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- ---------------------------------------------------------------------------
-- create_notification(): insert a row + best-effort push via pg_net.
-- SECURITY DEFINER so triggers / RPCs can write regardless of the caller.
-- ---------------------------------------------------------------------------
create or replace function public.create_notification(
  p_teacher_id uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_data       jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (teacher_id, type, title, body, data)
  values (p_teacher_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  -- Best-effort phone push. Wrapped so a missing/disabled pg_net extension or a
  -- missing service-role setting can never roll back the caller's transaction.
  begin
    perform net.http_post(
      url     := 'https://kesssbvejyeefyaqjobk.supabase.co/functions/v1/dispatch_push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body    := jsonb_build_object('notification_id', v_id)
    );
  exception when others then
    -- pg_net not enabled or key not configured: in-app notification still saved.
    null;
  end;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: assistant records a payment → notify the teacher.
-- Only assistant-collected, non-deleted "paid" rows fire, so a teacher never
-- gets pinged for their own entries.
-- ---------------------------------------------------------------------------
create or replace function public.notify_payment() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
begin
  if NEW.collected_by_role = 'assistant' and NEW.status = 'paid' then
    begin
      select name into v_student from public.students where id = NEW.student_id;
      perform public.create_notification(
        NEW.teacher_id,
        'payment',
        'Payment recorded',
        coalesce(v_student, 'A student') || ' — Rs ' ||
          to_char((NEW.amount_cents::numeric / 100), 'FM999999990.00') ||
          ' (' || NEW.month || ')',
        jsonb_build_object('payment_id', NEW.id, 'student_id', NEW.student_id, 'class_id', NEW.class_id)
      );
    exception when others then
      null; -- never block the payment write
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify
  after insert on public.payments
  for each row execute function public.notify_payment();

-- ---------------------------------------------------------------------------
-- Trigger: assistant marks attendance → notify the teacher.
-- ---------------------------------------------------------------------------
create or replace function public.notify_assistant_attendance() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
begin
  if NEW.marked_by_role = 'assistant' then
    begin
      select name into v_student from public.students where id = NEW.student_id;
      perform public.create_notification(
        NEW.teacher_id,
        'assistant_attendance',
        'Attendance marked by assistant',
        coalesce(v_student, 'A student') || ' marked ' || NEW.status || ' on ' || NEW.date::text,
        jsonb_build_object('student_id', NEW.student_id, 'class_id', NEW.class_id, 'date', NEW.date)
      );
    exception when others then
      null; -- never block the attendance write
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists attendance_notify on public.attendance;
create trigger attendance_notify
  after insert on public.attendance
  for each row execute function public.notify_assistant_attendance();
