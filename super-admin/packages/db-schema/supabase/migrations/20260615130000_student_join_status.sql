-- =============================================================================
-- 20260615130000_student_join_status.sql
-- Money gate for self-joined students.
--
-- A student who joins via the class-code flow starts as 'pending_payment'.
-- They appear in the teacher's roster but are NOT counted in any unpaid/
-- outstanding queries until they make their first payment, at which point the
-- teacher app promotes them to 'confirmed' (syncs up here automatically).
--
-- Manually-added students are always 'confirmed' — they were entered by the
-- teacher and are real from day one.
-- =============================================================================

alter table public.students
  add column if not exists join_status text not null default 'confirmed'
    check (join_status in ('confirmed', 'pending_payment'));

comment on column public.students.join_status is
  'confirmed = counted in money totals; pending_payment = self-joined but has not paid yet, excluded from unpaid/outstanding lists.';

create index if not exists students_join_status_idx
  on public.students (teacher_id, join_status)
  where join_status = 'pending_payment';
