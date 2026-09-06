-- =============================================================================
-- 20260603120000_server_pro_enforcement.sql
-- Server-side Pro enforcement (defence in depth).
--
-- Until now, "Free plan = local only" was enforced ONLY in the client app
-- (the sync engine skipped uploads for non-Pro teachers). A modified or old
-- build could bypass that and still push rows, because the teacher RLS write
-- policies checked tenant ownership (auth.uid() = teacher_id) but NOT the
-- subscription. This migration closes that gap: the database itself now
-- rejects cloud writes from teachers who are not Pro.
--
-- Design:
--   • READ stays open (the policy USING clause is untouched). A teacher whose
--     Pro lapsed to Free can STILL read / restore their existing cloud data —
--     they just cannot upload new changes. This avoids locking anyone out of
--     their own data.
--   • WRITE (INSERT / UPDATE — which is how the sync push and soft-deletes
--     reach the cloud) now also requires public.teacher_is_pro(teacher_id).
--   • "Pro" matches the app + get_subscription edge function exactly:
--     status in ('active','trialing'). New self-registered teachers start on a
--     14-day 'trialing' row, so they can upload during the trial.
--
-- This is purely a tightening of WITH CHECK on existing per-tenant policies; no
-- table or data changes.
-- =============================================================================

-- ---- Pro check helper -------------------------------------------------------
-- SECURITY DEFINER so it can read public.subscriptions regardless of the
-- caller's RLS (the subscriptions table only lets a teacher read their own
-- row, and assistants none). Marked STABLE — result is constant within a
-- statement, so the planner can cache it per row-batch.
create or replace function public.teacher_is_pro(p_teacher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.teacher_id = p_teacher
      and s.status in ('active', 'trialing')
      and s.deleted_at is null
  );
$$;

comment on function public.teacher_is_pro(uuid) is
  'True when the given teacher has an active/trialing subscription. Used by RLS to block cloud writes from Free-plan teachers (server-side enforcement of "Free = local only").';

-- ---- Tighten teacher write policies on every synced table -------------------
-- These are the exact tables the teacher app pushes via PostgREST upsert
-- (see teacher-app/lib/sync/push.ts): classes, students, payments,
-- payment_corrections, attendance, notes, note_files, exams, marks.
-- ALTER POLICY ... WITH CHECK only changes the write predicate; the USING
-- (read) predicate is preserved.

alter policy "classes_teacher_all" on public.classes
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "students_teacher_all" on public.students
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "payments_teacher_all" on public.payments
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "pc_teacher_all" on public.payment_corrections
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "attendance_teacher_all" on public.attendance
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "notes_teacher_all" on public.notes
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "note_files_teacher_all" on public.note_files
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "exams_teacher_all" on public.exams
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

alter policy "marks_teacher_all" on public.marks
  with check (auth.uid() = teacher_id and public.teacher_is_pro(teacher_id));

-- ---- Assistant write policies ----------------------------------------------
-- Assistants are themselves a Pro-only feature, so a Free teacher should never
-- have an assistant writing on their behalf. Add the same Pro gate (keyed on
-- the row's teacher_id) for defence in depth.

alter policy "payments_assistant_insert" on public.payments
  with check (
    public.assistant_has_class_access(class_id, 'payment')
    and collected_by_role = 'assistant'
    and collected_by_user_id = auth.uid()
    and public.teacher_is_pro(teacher_id)
  );

alter policy "attendance_assistant_insert" on public.attendance
  with check (
    public.assistant_has_class_access(class_id, 'attendance')
    and marked_by_role = 'assistant'
    and marked_by_user_id = auth.uid()
    and public.teacher_is_pro(teacher_id)
  );

alter policy "attendance_assistant_update" on public.attendance
  with check (
    public.assistant_has_class_access(class_id, 'attendance')
    and public.teacher_is_pro(teacher_id)
  );
