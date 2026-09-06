-- =============================================================================
-- 20260615140000_student_financial_confirmed.sql
--
-- Adds join_status to students.
--
-- 'confirmed'       → manually added (or assistant-added), counted in all money
--                     reports and outstanding-fee totals from day one.
-- 'pending_payment' → joined via class code; excluded from outstanding-fee
--                     totals until the teacher records their first payment
--                     (auto-confirms) or taps "Confirm for billing" manually.
--
-- All existing students are 'confirmed' (DEFAULT). New students created by
-- respond_join_request set financial_confirmed = 'pending_payment' explicitly.
-- =============================================================================

alter table public.students
  add column if not exists join_status text not null default 'confirmed'
    check (join_status in ('confirmed', 'pending_payment'));

create index if not exists students_join_status_idx
  on public.students (teacher_id, join_status)
  where join_status = 'pending_payment' and deleted_at is null;

comment on column public.students.join_status is
  'pending_payment = joined via class code but not yet paid or manually confirmed. Excluded from outstanding-fee totals.';
