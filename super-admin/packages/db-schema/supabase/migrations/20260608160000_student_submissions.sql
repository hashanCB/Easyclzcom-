-- =============================================================================
-- 20260608160000_student_submissions.sql
-- =============================================================================
-- Assistant-registered students now go through TEACHER REVIEW instead of landing
-- straight in the live roster. An assistant's "add student" creates a row in a
-- separate staging table (student_submissions). The teacher reviews each one and
-- Accepts (which creates the real students row) or Rejects it. Pending rows never
-- appear in attendance/payments/reports because they live outside `students`.
--
-- This replaces the direct assistant INSERT into `students` added in
-- 20260608140000 — that policy is dropped here so assistants cannot bypass review.
-- =============================================================================

-- 1. Staging table -----------------------------------------------------------
create table if not exists public.student_submissions (
  id                      uuid primary key,
  teacher_id              uuid not null,
  class_id                uuid not null references public.classes(id) on delete cascade,
  created_by_assistant_id uuid references public.assistants(id) on delete set null,
  name                    text not null,
  -- Full student form payload captured by the assistant (camelCase domain shape),
  -- used to create the real student when the teacher accepts.
  payload                 jsonb not null,
  status                  text not null default 'pending'
                            check (status in ('pending', 'accepted', 'rejected')),
  resulting_student_id    uuid,            -- set when accepted
  review_note             text,            -- optional reason when rejected
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now()
);

create index if not exists student_submissions_teacher_status_idx
  on public.student_submissions (teacher_id, status);
create index if not exists student_submissions_assistant_idx
  on public.student_submissions (created_by_assistant_id);

alter table public.student_submissions enable row level security;

-- 2. RLS ---------------------------------------------------------------------
-- Teacher owns every submission addressed to them (read + accept/reject update).
drop policy if exists "student_submissions_teacher_all" on public.student_submissions;
create policy "student_submissions_teacher_all"
  on public.student_submissions for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Assistant may create a submission for a class they can add students to.
drop policy if exists "student_submissions_assistant_insert" on public.student_submissions;
create policy "student_submissions_assistant_insert"
  on public.student_submissions for insert
  with check (
    public.assistant_can_add_student(class_id)
    and created_by_assistant_id = auth.uid()
    and teacher_id = (select teacher_id from public.classes where id = class_id)
  );

-- Assistant may read back the submissions they created (read-only summary).
drop policy if exists "student_submissions_assistant_select" on public.student_submissions;
create policy "student_submissions_assistant_select"
  on public.student_submissions for select
  using (created_by_assistant_id = auth.uid());

-- 3. Remove the direct assistant INSERT into students ------------------------
-- Assistants now submit for review; only the teacher (via accept) writes students.
drop policy if exists "students_assistant_insert" on public.students;
