-- =============================================================================
-- 20260608140000_assistant_add_students.sql
-- =============================================================================
-- Lets a teacher delegate *student registration* to an assistant, alongside the
-- existing attendance/payment grants. Adds an independent per-class capability
-- flag (does NOT disturb the attendance/payment/both model).
--
-- Assistant adds are offline-first: the app queues a plain `students` INSERT and
-- replays it when online. The server assigns the per-teacher `STU-####` code on
-- insert via a trigger, because the assistant's phone only holds one class's
-- roster and can't number reliably.
-- =============================================================================

-- 1. New capability flag on the per-class permission row ----------------------
alter table public.assistant_class_permissions
  add column if not exists can_add_student boolean not null default false;

-- An assistant may now have ONLY the add-student capability (no attendance or
-- payment). Allow permission to be null so that combo can be stored; the access
-- helper assistant_has_class_access() treats null as "no attendance/payment".
alter table public.assistant_class_permissions
  alter column permission drop not null;

-- 2. Track which assistant registered a student (for their read-only summary) -
alter table public.students
  add column if not exists created_by_assistant_id uuid
    references public.assistants(id) on delete set null;

create index if not exists students_created_by_assistant_idx
  on public.students (created_by_assistant_id)
  where created_by_assistant_id is not null;

-- 3. Access helper: active assistant with can_add_student on the class --------
create or replace function public.assistant_can_add_student(p_class_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.assistant_class_permissions acp
    join public.assistants a on a.id = acp.assistant_id
    where acp.assistant_id = auth.uid()
      and acp.class_id = p_class_id
      and acp.deleted_at is null
      and acp.can_add_student = true
      and a.is_active = true
      and a.deleted_at is null
  );
$$;

comment on function public.assistant_can_add_student(uuid)
  is 'True when the current JWT subject is an active assistant allowed to register students in the class.';

-- 4. Auto-assign the per-teacher STU-#### code when an insert omits it ---------
-- Teacher inserts always carry a code, so this only fires for assistant adds.
-- An advisory lock per teacher serialises concurrent inserts so two assistants
-- (or assistant + teacher) cannot grab the same number.
create or replace function public.students_assign_code()
returns trigger
language plpgsql
as $$
declare
  next_num integer;
begin
  if new.student_code is null or btrim(new.student_code) = '' then
    perform pg_advisory_xact_lock(hashtextextended(new.teacher_id::text, 0));
    select coalesce(max((substring(student_code from '^STU-(\d+)$'))::int), 0) + 1
      into next_num
      from public.students
      where teacher_id = new.teacher_id
        and student_code ~ '^STU-\d+$';
    new.student_code := 'STU-' || lpad(next_num::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists students_assign_code on public.students;
create trigger students_assign_code
  before insert on public.students
  for each row execute function public.students_assign_code();

-- 5. RLS: permitted assistants may INSERT students into their class -----------
drop policy if exists "students_assistant_insert" on public.students;
create policy "students_assistant_insert"
  on public.students for insert
  with check (
    public.assistant_can_add_student(class_id)
    and created_by_assistant_id = auth.uid()
    and teacher_id = (select teacher_id from public.classes where id = class_id)
  );

-- 6. RLS: extend the assistant read policies to add-only assistants -----------
-- (the existing policies in 20260524120000 only cover attendance/payment).
drop policy if exists "students_assistant_select" on public.students;
create policy "students_assistant_select"
  on public.students for select
  using (
    public.assistant_has_class_access(class_id, 'attendance')
    or public.assistant_has_class_access(class_id, 'payment')
    or public.assistant_can_add_student(class_id)
  );

drop policy if exists "classes_assistant_select" on public.classes;
create policy "classes_assistant_select"
  on public.classes for select
  using (
    public.assistant_has_class_access(id, 'attendance')
    or public.assistant_has_class_access(id, 'payment')
    or public.assistant_can_add_student(id)
  );
