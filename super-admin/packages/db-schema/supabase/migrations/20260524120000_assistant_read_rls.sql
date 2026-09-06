-- =============================================================================
-- 20260524120000_assistant_read_rls.sql
-- =============================================================================
-- Fix: assistants could not READ the classes/students they were assigned to.
-- The classes & students tables only had super_admin + teacher (+ student-self)
-- SELECT policies. attendance/payments already use assistant_has_class_access(),
-- but the assistant app first has to LIST classes and look up students (QR scan,
-- daily summary) — those reads were silently blocked by RLS, so the assistant
-- saw "No classes assigned" even when permissions existed.
--
-- assistant_has_class_access(class_id, perm) is true when the current JWT is an
-- active assistant with that permission ('both' satisfies either). ORing the two
-- permission kinds means "has any permission on this class" → may read it.
-- =============================================================================

-- Assistants may read classes they have any permission for.
drop policy if exists "classes_assistant_select" on public.classes;
create policy "classes_assistant_select"
  on public.classes for select
  using (
    public.assistant_has_class_access(id, 'attendance')
    or public.assistant_has_class_access(id, 'payment')
  );

-- Assistants may read students in classes they have any permission for.
drop policy if exists "students_assistant_select" on public.students;
create policy "students_assistant_select"
  on public.students for select
  using (
    public.assistant_has_class_access(class_id, 'attendance')
    or public.assistant_has_class_access(class_id, 'payment')
  );
