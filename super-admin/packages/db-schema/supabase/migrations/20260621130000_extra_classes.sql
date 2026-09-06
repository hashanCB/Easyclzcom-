-- =============================================================================
-- 20260621130000_extra_classes.sql
-- Extra Class — a one-off extra session on top of the normal weekly class. Can
-- be free or paid; for a paid extra class only the students who ATTEND owe the
-- fee, and they may pay any time. Free-card students are always free. Attendance
-- and payment rows are tagged with extra_class_id so they stay separate from the
-- regular monthly class. Mirrors the teacher-app local table for offline sync.
-- =============================================================================

create table if not exists public.extra_classes (
  id                 text primary key,
  teacher_id         uuid not null references public.teachers(id) on delete cascade,
  class_id           uuid not null references public.classes(id)  on delete cascade,
  topic              text,
  date               date not null,
  start_time         text,
  end_time           text,
  location           text,
  -- 'free' = no charge; 'monthly' = each present student's own monthly fee;
  -- 'custom' = a special amount (custom_fee_cents) for everyone present.
  fee_mode           text not null default 'free' check (fee_mode in ('free', 'monthly', 'custom')),
  custom_fee_cents   integer check (custom_fee_cents is null or custom_fee_cents >= 0),
  remark             text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  client_updated_at  timestamptz,
  synced_at          timestamptz
);
create index if not exists extra_classes_teacher_idx on public.extra_classes (teacher_id) where deleted_at is null;
create index if not exists extra_classes_class_idx   on public.extra_classes (class_id)   where deleted_at is null;

-- Tag attendance + payments so extra-class rows are distinguishable from the
-- regular monthly class. Nullable: a null value = a normal class row.
alter table public.attendance add column if not exists extra_class_id text;
alter table public.payments   add column if not exists extra_class_id text;
create index if not exists attendance_extra_class_idx on public.attendance (extra_class_id) where extra_class_id is not null;
create index if not exists payments_extra_class_idx   on public.payments   (extra_class_id) where extra_class_id is not null;

drop trigger if exists extra_classes_set_updated_at on public.extra_classes;
create trigger extra_classes_set_updated_at before update on public.extra_classes
for each row execute function public.set_updated_at();

alter table public.extra_classes enable row level security;

drop policy if exists "extra_classes_super_admin_all" on public.extra_classes;
create policy "extra_classes_super_admin_all" on public.extra_classes for all
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "extra_classes_teacher_all" on public.extra_classes;
create policy "extra_classes_teacher_all" on public.extra_classes for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- Assistants may read extra classes for classes they have any permission on
-- (so they can run attendance / collect payment for them).
drop policy if exists "extra_classes_assistant_select" on public.extra_classes;
create policy "extra_classes_assistant_select" on public.extra_classes for select
  using (
    public.assistant_has_class_access(class_id, 'attendance')
    or public.assistant_has_class_access(class_id, 'payment')
  );

comment on table public.extra_classes is
  'One-off extra sessions (free or paid). Paid: only attendees owe; free-card students always free. Mirrors the teacher-app local table.';
