-- =============================================================================
-- 20260519140000_chat.sql
-- Teacher ↔ student chat support (U37, SRS §15).
--  - trigger keeps chat_threads.last_message_at + unread counters fresh
--  - trigger auto-fills teacher_id when a student opens their own thread
--  - RLS lets a student create/update only their own thread
-- The base chat_threads / chat_messages tables + core RLS land in
-- 20260507101100_chat.sql; this migration only adds the moving parts.
-- =============================================================================

-- ---- keep thread metadata fresh on every new message -----------------------
create or replace function public.bump_chat_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_threads set
    last_message_at    = new.created_at,
    unread_for_student = unread_for_student + case when new.sender_role = 'teacher' then 1 else 0 end,
    unread_for_teacher = unread_for_teacher + case when new.sender_role = 'student' then 1 else 0 end,
    updated_at         = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_bump_thread on public.chat_messages;
create trigger chat_messages_bump_thread
after insert on public.chat_messages
for each row execute function public.bump_chat_thread();

-- ---- auto-fill teacher_id when a student creates their thread --------------
-- A student only knows their own student_id; the teacher is derived server-side
-- so the student never has to (and cannot) choose an arbitrary teacher.
create or replace function public.fill_chat_thread_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_id is null then
    select teacher_id into new.teacher_id
    from public.students where id = new.student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_threads_fill_teacher on public.chat_threads;
create trigger chat_threads_fill_teacher
before insert on public.chat_threads
for each row execute function public.fill_chat_thread_teacher();

-- ---- student RLS: create + update only their own thread --------------------
create policy "chat_threads_student_insert"
  on public.chat_threads for insert
  with check (
    public.is_student()
    and student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );

create policy "chat_threads_student_update"
  on public.chat_threads for update
  using (
    public.is_student()
    and student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  )
  with check (
    public.is_student()
    and student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );
