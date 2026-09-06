-- =============================================================================
-- Student notifications (portal bell + Web Push fan-out)
-- =============================================================================
-- A student-facing notification feed for the web portal: a bell + unread badge
-- showing teacher activity (new chat reply, exam result, new note).
--
-- Rows are created by DB triggers so they fire no matter how the underlying data
-- arrives — the teacher app is offline-first and most chat/exam/note rows reach
-- the cloud via SYNC (a plain INSERT), not via an edge function. Triggers catch
-- all of them.
--
-- Push delivery (best-effort):
--   create_student_notification() inserts the feed row, then fires a pg_net call
--   to the dispatch_student_push edge function, which sends a Web Push to every
--   browser the student has subscribed. If pg_net / the URL setting is missing,
--   the in-app feed row is still saved — the write is never blocked.
--
-- Notifications target the student ACCOUNT (the portal login), so the bell
-- aggregates across all of a student's classes/teachers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Feed table
-- ---------------------------------------------------------------------------
create table if not exists public.student_notifications (
  id                  uuid primary key default extensions.gen_random_uuid(),
  student_account_id  uuid not null references public.student_accounts(id) on delete cascade,
  student_id          uuid,        -- the enrollment this relates to (for routing)
  teacher_id          uuid,

  type                text not null check (type in ('chat', 'exam', 'note')),
  title               text not null,
  body                text not null,
  data                jsonb not null default '{}'::jsonb,

  is_read             boolean not null default false,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists student_notifications_account_created_idx
  on public.student_notifications (student_account_id, created_at desc);
create index if not exists student_notifications_unread_idx
  on public.student_notifications (student_account_id) where is_read = false;

alter table public.student_notifications enable row level security;
-- All reads/writes happen via SECURITY DEFINER edge functions (custom student
-- JWT, not a Supabase auth user), so no public RLS policy is needed.

-- ---------------------------------------------------------------------------
-- 2. Web Push subscriptions (one row per browser/device per account)
-- ---------------------------------------------------------------------------
create table if not exists public.student_push_subscriptions (
  id                  uuid primary key default extensions.gen_random_uuid(),
  student_account_id  uuid not null references public.student_accounts(id) on delete cascade,
  endpoint            text not null unique,           -- browser push endpoint URL
  p256dh              text not null,                  -- client public key
  auth                text not null,                  -- client auth secret
  user_agent          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists student_push_subscriptions_account_idx
  on public.student_push_subscriptions (student_account_id);

alter table public.student_push_subscriptions enable row level security;
-- Managed only by SECURITY DEFINER edge functions; no public policy.

-- ---------------------------------------------------------------------------
-- 3. Private settings the trigger needs to reach the push edge function.
--    Supabase's managed role can't ALTER DATABASE SET custom GUCs, so we keep
--    these in a locked-down table that only the SECURITY DEFINER function (run
--    as the table owner) can read. No RLS policy = no anon/auth access.
--    Populate per-environment after migrating:
--      insert into app_private_settings(key, value) values
--        ('functions_url', 'https://<ref>.supabase.co/functions/v1'),
--        ('student_push_secret', '<random secret, also set as STUDENT_PUSH_SECRET>')
--      on conflict (key) do update set value = excluded.value;
-- ---------------------------------------------------------------------------
create table if not exists public.app_private_settings (
  key   text primary key,
  value text not null
);
alter table public.app_private_settings enable row level security;
revoke all on public.app_private_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3b. create_student_notification(): feed row(s) + best-effort Web Push.
--    Resolves the student enrollment -> account(s) via active links. A student
--    with no portal account is silently skipped (nobody to notify).
-- ---------------------------------------------------------------------------
create or replace function public.create_student_notification(
  p_student_id uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_data       jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link        record;
  v_id          uuid;
  v_base        text;
  v_secret      text;
begin
  select value into v_base   from public.app_private_settings where key = 'functions_url';
  select value into v_secret from public.app_private_settings where key = 'student_push_secret';

  for v_link in
    select sal.student_account_id, sal.teacher_id
    from public.student_account_links sal
    where sal.student_id = p_student_id
      and coalesce(sal.is_active, true) = true
  loop
    insert into public.student_notifications
      (student_account_id, student_id, teacher_id, type, title, body, data)
    values
      (v_link.student_account_id, p_student_id, v_link.teacher_id,
       p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb))
    returning id into v_id;

    -- Best-effort Web Push. Never let a push failure roll back the data write.
    if v_base is not null and v_secret is not null then
      begin
        perform net.http_post(
          url     := v_base || '/dispatch_student_push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Dispatch-Secret', v_secret
          ),
          body    := jsonb_build_object('notification_id', v_id)
        );
      exception when others then
        null;
      end;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4a. Trigger: teacher sends a chat message -> notify the thread's student.
-- ---------------------------------------------------------------------------
create or replace function public.notify_student_chat() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
begin
  if NEW.sender_role = 'teacher' and NEW.deleted_at is null then
    begin
      select student_id into v_student_id
      from public.chat_threads where id = NEW.thread_id;

      if v_student_id is not null then
        perform public.create_student_notification(
          v_student_id,
          'chat',
          'New message from your teacher',
          left(NEW.body, 140),
          jsonb_build_object('thread_id', NEW.thread_id, 'message_id', NEW.id)
        );
      end if;
    exception when others then
      null; -- never block the chat write
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists chat_messages_notify_student on public.chat_messages;
create trigger chat_messages_notify_student
  after insert on public.chat_messages
  for each row execute function public.notify_student_chat();

-- ---------------------------------------------------------------------------
-- 4b. Trigger: teacher publishes a mark -> notify that student.
-- ---------------------------------------------------------------------------
create or replace function public.notify_student_mark() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam  record;
begin
  if NEW.deleted_at is null then
    begin
      select title, total_marks into v_exam from public.exams where id = NEW.exam_id;
      perform public.create_student_notification(
        NEW.student_id,
        'exam',
        'Exam result published',
        'Your result for "' || coalesce(v_exam.title, 'an exam') || '" is ready: ' ||
          to_char(NEW.mark, 'FM999999990.##') ||
          coalesce('/' || v_exam.total_marks::text, ''),
        jsonb_build_object('exam_id', NEW.exam_id, 'mark_id', NEW.id)
      );
    exception when others then
      null; -- never block the mark write
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists marks_notify_student on public.marks;
create trigger marks_notify_student
  after insert on public.marks
  for each row execute function public.notify_student_mark();

-- ---------------------------------------------------------------------------
-- 4c. Trigger: teacher adds a note -> notify every active student in the class.
-- ---------------------------------------------------------------------------
create or replace function public.notify_class_note() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_label   text;
begin
  if NEW.deleted_at is null then
    begin
      v_label := case when NEW.link_url is not null then 'New link' else 'New note' end;
      for v_student in
        select id from public.students
        where class_id = NEW.class_id
          and deleted_at is null
          and is_active = true
      loop
        perform public.create_student_notification(
          v_student.id,
          'note',
          v_label,
          'Your teacher added: "' || NEW.title || '"',
          jsonb_build_object('note_id', NEW.id, 'class_id', NEW.class_id)
        );
      end loop;
    exception when others then
      null; -- never block the note write
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists notes_notify_students on public.notes;
create trigger notes_notify_students
  after insert on public.notes
  for each row execute function public.notify_class_note();
