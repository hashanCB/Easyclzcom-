-- =============================================================================
-- 20260617400000_student_classes.sql
-- Many-to-many: a student can be enrolled in MANY classes (e.g. a Theory class
-- and a Revision class), each with its OWN monthly fee. This mirrors the
-- teacher-app local `student_classes` table so the per-class fee / "free card"
-- the teacher sets at registration reaches the cloud — and therefore the
-- assistant payment-collection flow, which reads its roster from the cloud.
--
-- `students.class_id` is kept as the PRIMARY class for back-compat; this table
-- is the authoritative source for which classes a student belongs to and what
-- they pay in each.
--
-- The `id` is TEXT (not uuid) on purpose: the teacher app backfills existing
-- students with a deterministic id (`student_id || '-' || class_id`) so the same
-- enrollment created on two devices merges on the primary key instead of
-- duplicating. The foreign keys still reference uuid columns.
-- =============================================================================

create table if not exists public.student_classes (
  id                 text primary key,
  teacher_id         uuid not null references public.teachers(id) on delete cascade,
  student_id         uuid not null references public.students(id) on delete cascade,
  class_id           uuid not null references public.classes(id)  on delete cascade,

  -- Per-class fee: 'regular' uses the class fee, 'free' owes nothing,
  -- 'custom' uses custom_fee_cents (any per-student amount for this class).
  fee_type           text not null default 'regular'
                       check (fee_type in ('regular', 'free', 'custom')),
  custom_fee_cents   integer check (custom_fee_cents is null or custom_fee_cents >= 0),

  is_active          boolean not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  client_updated_at  timestamptz,
  synced_at          timestamptz,

  unique (student_id, class_id)
);

create index if not exists student_classes_teacher_idx on public.student_classes (teacher_id) where deleted_at is null;
create index if not exists student_classes_class_idx   on public.student_classes (class_id)   where deleted_at is null;
create index if not exists student_classes_student_idx on public.student_classes (student_id) where deleted_at is null;

drop trigger if exists student_classes_set_updated_at on public.student_classes;
create trigger student_classes_set_updated_at
before update on public.student_classes
for each row execute function public.set_updated_at();

alter table public.student_classes enable row level security;

drop policy if exists "student_classes_super_admin_all" on public.student_classes;
create policy "student_classes_super_admin_all"
  on public.student_classes for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "student_classes_teacher_all" on public.student_classes;
create policy "student_classes_teacher_all"
  on public.student_classes for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Assistants may read enrollments for classes they have any permission on, so
-- the door working-set can resolve each student's per-class fee.
drop policy if exists "student_classes_assistant_select" on public.student_classes;
create policy "student_classes_assistant_select"
  on public.student_classes for select
  using (
    public.assistant_has_class_access(class_id, 'attendance')
    or public.assistant_has_class_access(class_id, 'payment')
  );

-- ---- Backfill ---------------------------------------------------------------
-- One enrollment per existing student from their current primary class + fee.
-- The deterministic id matches what the teacher app generates locally, so a
-- later push from the teacher's device merges on the primary key.
insert into public.student_classes
  (id, teacher_id, student_id, class_id, fee_type, custom_fee_cents, is_active, created_at, updated_at, client_updated_at)
select
  s.id::text || '-' || s.class_id::text,
  s.teacher_id, s.id, s.class_id,
  s.fee_type, s.custom_fee_cents, s.is_active,
  s.created_at, s.updated_at, s.updated_at
from public.students s
where s.deleted_at is null
on conflict (id) do nothing;

comment on table public.student_classes is
  'Many-to-many student↔class enrollments with a per-class fee (regular/free/custom). Mirrors the teacher-app local table; powers per-class fees and the assistant collection roster.';
