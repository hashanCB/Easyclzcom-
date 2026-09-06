-- =============================================================================
-- 20260507101100_chat.sql
-- Teacher ↔ student 1:1 chat per SRS §15. Students cannot DM each other.
-- =============================================================================

create table public.chat_threads (
  id                    uuid primary key default extensions.gen_random_uuid(),
  teacher_id            uuid not null references public.teachers(id) on delete cascade,
  student_id            uuid not null references public.students(id) on delete cascade,

  last_message_at       timestamptz,
  unread_for_teacher    integer not null default 0 check (unread_for_teacher >= 0),
  unread_for_student    integer not null default 0 check (unread_for_student >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  client_updated_at     timestamptz,
  synced_at             timestamptz,

  unique (teacher_id, student_id)
);

create index chat_threads_teacher_idx       on public.chat_threads (teacher_id) where deleted_at is null;
create index chat_threads_student_idx       on public.chat_threads (student_id) where deleted_at is null;
create index chat_threads_last_message_idx  on public.chat_threads (teacher_id, last_message_at desc nulls last);

create trigger chat_threads_set_updated_at
before update on public.chat_threads
for each row execute function public.set_updated_at();

alter table public.chat_threads enable row level security;

create policy "chat_threads_super_admin_all"
  on public.chat_threads for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "chat_threads_teacher_all"
  on public.chat_threads for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "chat_threads_student_self"
  on public.chat_threads for select
  using (
    public.is_student()
    and student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );

-- ---- chat_messages ---------------------------------------------------------
create table public.chat_messages (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  thread_id           uuid not null references public.chat_threads(id) on delete cascade,
  sender_role         text not null check (sender_role in ('teacher', 'student')),
  sender_id           uuid not null,
  body                text not null,
  attachment_url      text,
  read_at             timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz
);

create index chat_messages_thread_idx  on public.chat_messages (thread_id, created_at desc);
create index chat_messages_teacher_idx on public.chat_messages (teacher_id, created_at desc);
create index chat_messages_unread_idx  on public.chat_messages (thread_id) where read_at is null;

create trigger chat_messages_set_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();

alter table public.chat_messages enable row level security;

create policy "chat_messages_super_admin_all"
  on public.chat_messages for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "chat_messages_teacher_all"
  on public.chat_messages for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Student: read messages on their own thread; insert messages they author.
create policy "chat_messages_student_select"
  on public.chat_messages for select
  using (
    public.is_student()
    and thread_id in (
      select t.id
      from public.chat_threads t
      join public.students s on s.id = t.student_id
      where s.auth_user_id = auth.uid()
    )
  );

create policy "chat_messages_student_insert"
  on public.chat_messages for insert
  with check (
    public.is_student()
    and sender_role = 'student'
    and sender_id = auth.uid()
    and thread_id in (
      select t.id
      from public.chat_threads t
      join public.students s on s.id = t.student_id
      where s.auth_user_id = auth.uid()
    )
  );
