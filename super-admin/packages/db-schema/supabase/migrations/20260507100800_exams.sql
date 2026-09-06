-- =============================================================================
-- 20260507100800_exams.sql
-- Exams + manual marks per SRS §18.
-- =============================================================================

create table public.exams (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  title               text not null,
  class_id            uuid not null references public.classes(id) on delete restrict,
  grade               text not null,
  batch               text not null,
  subject             text not null,
  language            text not null check (language in ('sinhala', 'english', 'tamil', 'other')),
  exam_date           date not null,
  total_marks         integer not null check (total_marks > 0),
  remark              text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz
);

create index exams_teacher_date_idx on public.exams (teacher_id, exam_date desc);
create index exams_class_idx        on public.exams (class_id);

create trigger exams_set_updated_at
before update on public.exams
for each row execute function public.set_updated_at();

alter table public.exams enable row level security;

create policy "exams_super_admin_all"
  on public.exams for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "exams_teacher_all"
  on public.exams for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "exams_student_self_select"
  on public.exams for select
  using (
    public.is_student()
    and class_id in (
      select class_id from public.students where auth_user_id = auth.uid()
    )
  );

-- ---- marks -----------------------------------------------------------------
create table public.marks (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  exam_id             uuid not null references public.exams(id)    on delete cascade,
  student_id          uuid not null references public.students(id) on delete restrict,
  mark                numeric(8,2) not null check (mark >= 0),
  remark              text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz,

  unique (exam_id, student_id)
);

create index marks_teacher_idx on public.marks (teacher_id);
create index marks_exam_idx    on public.marks (exam_id);
create index marks_student_idx on public.marks (student_id);

create trigger marks_set_updated_at
before update on public.marks
for each row execute function public.set_updated_at();

alter table public.marks enable row level security;

create policy "marks_super_admin_all"
  on public.marks for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "marks_teacher_all"
  on public.marks for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "marks_student_self_select"
  on public.marks for select
  using (
    public.is_student()
    and student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );
