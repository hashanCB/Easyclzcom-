-- =============================================================================
-- 20260507100700_attendance.sql
-- Attendance per SRS §11. One row per (student, class, date). Per SRS §23.3
-- attendance duplicates are detected by (student, class, date) — enforced via
-- a unique constraint here.
-- =============================================================================

create table public.attendance (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  student_id          uuid not null references public.students(id) on delete restrict,
  class_id            uuid not null references public.classes(id)  on delete restrict,
  date                date not null,
  status              text not null check (status in ('present', 'absent', 'late')),

  marked_by_user_id   uuid not null,
  marked_by_role      text not null check (marked_by_role in ('teacher', 'assistant')),
  marked_via          text not null default 'manual' check (marked_via in ('manual', 'qr', 'nfc')),
  marked_at           timestamptz not null default now(),

  sms_intent          boolean not null default false,
  sms_sent_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz,

  unique (student_id, class_id, date)
);

create index attendance_teacher_date_idx on public.attendance (teacher_id, date desc);
create index attendance_class_date_idx   on public.attendance (class_id, date desc);
create index attendance_student_idx      on public.attendance (student_id, date desc);
create index attendance_status_idx       on public.attendance (teacher_id, status, date) where deleted_at is null;

create trigger attendance_set_updated_at
before update on public.attendance
for each row execute function public.set_updated_at();

alter table public.attendance enable row level security;

create policy "attendance_super_admin_all"
  on public.attendance for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "attendance_teacher_all"
  on public.attendance for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "attendance_assistant_select"
  on public.attendance for select
  using (public.assistant_has_class_access(class_id, 'attendance'));

create policy "attendance_assistant_insert"
  on public.attendance for insert
  with check (
    public.assistant_has_class_access(class_id, 'attendance')
    and marked_by_role = 'assistant'
    and marked_by_user_id = auth.uid()
  );

create policy "attendance_assistant_update"
  on public.attendance for update
  using (public.assistant_has_class_access(class_id, 'attendance'))
  with check (public.assistant_has_class_access(class_id, 'attendance'));

create policy "attendance_student_self_select"
  on public.attendance for select
  using (
    public.is_student()
    and student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );

comment on table public.attendance is 'Daily attendance per student per class (SRS §11). Unique on (student, class, date).';
