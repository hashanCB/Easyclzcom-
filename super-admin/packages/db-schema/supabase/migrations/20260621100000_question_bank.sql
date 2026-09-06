-- =============================================================================
-- 20260621100000_question_bank.sql
-- Per-class question bank for the online-exam system (phase 1). A teacher builds
-- a pool of MCQ / True-False questions per class and reuses them across many
-- published exams. Teacher-only data — students never read this table (they only
-- ever see questions snapshotted into a published exam, without the answer).
-- Mirrors the teacher-app local `question_bank` table for offline-first sync.
-- =============================================================================

create table if not exists public.question_bank (
  id                 text primary key,
  teacher_id         uuid not null references public.teachers(id) on delete cascade,
  class_id           uuid not null references public.classes(id)  on delete cascade,

  question_type      text not null default 'mcq'
                       check (question_type in ('mcq', 'true_false')),
  question_text      text not null,
  -- JSON array of option strings as TEXT, e.g. ["4","5","6","7"] or ["True","False"].
  -- Stored as text (not jsonb) to mirror the teacher-app local column exactly, so
  -- the offline-first sync round-trips the value without double-encoding.
  options            text not null default '[]',
  correct_index      integer not null default 0 check (correct_index >= 0),
  marks              integer not null default 1 check (marks > 0),

  is_active          boolean not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  client_updated_at  timestamptz,
  synced_at          timestamptz
);

create index if not exists question_bank_teacher_idx on public.question_bank (teacher_id) where deleted_at is null;
create index if not exists question_bank_class_idx   on public.question_bank (class_id)   where deleted_at is null;

drop trigger if exists question_bank_set_updated_at on public.question_bank;
create trigger question_bank_set_updated_at
before update on public.question_bank
for each row execute function public.set_updated_at();

alter table public.question_bank enable row level security;

drop policy if exists "question_bank_super_admin_all" on public.question_bank;
create policy "question_bank_super_admin_all"
  on public.question_bank for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "question_bank_teacher_all" on public.question_bank;
create policy "question_bank_teacher_all"
  on public.question_bank for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

comment on table public.question_bank is
  'Per-class MCQ/True-False question pool for the online-exam system. Teacher-only; mirrors the teacher-app local table.';
