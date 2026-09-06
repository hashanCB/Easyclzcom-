-- =============================================================================
-- Missing RLS: let assistants add students directly to the live roster.
-- =============================================================================
-- The at-the-door flow (assistant taps "Add & collect" / "No card? add new")
-- enqueues a direct POST to /rest/v1/students via the offline outbox. The
-- outbox code already assumes a policy named `students_assistant_insert`, but
-- it was never created — so every manual assistant add was rejected by RLS in
-- both DEV and PROD. (The QR-scan path is unaffected: it goes through the
-- assistant_register_from_account edge function, which uses the service role.)
--
-- This mirrors the proven payment_collections_assistant_insert policy:
--   * assistant must have can_add_student on the target class
--   * the row must be stamped with the assistant's own auth uid
--   * teacher_id must match the class's real owner (no cross-teacher writes)
--   * the teacher must be on an active Pro plan (assistants are a Pro feature)
-- Insert-only by design — assistants never UPDATE existing students.
-- =============================================================================

drop policy if exists students_assistant_insert on public.students;

create policy students_assistant_insert on public.students
  for insert to public
  with check (
    assistant_can_add_student(class_id)
    and created_by_assistant_id = auth.uid()
    and teacher_id = (select teacher_id from public.classes where id = students.class_id)
    and teacher_is_pro(teacher_id)
  );
