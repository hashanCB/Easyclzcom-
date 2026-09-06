-- =============================================================================
-- 20260621140000_attendance_extra_unique.sql
-- An extra class can fall on a normal class day, so a student can have BOTH a
-- regular attendance row and an extra-class one for the same (student, class,
-- date). The old unique (student_id, class_id, date) collides. Replace it with
-- one that also keys on extra_class_id, using NULLS NOT DISTINCT (PG15+) so two
-- regular rows (extra_class_id IS NULL) still dedupe, while extra rows stay
-- separate.
-- =============================================================================

alter table public.attendance drop constraint if exists attendance_student_id_class_id_date_key;

-- Idempotent: drop any prior version of the new index, then recreate it.
drop index if exists public.attendance_student_class_date_extra_key;
create unique index attendance_student_class_date_extra_key
  on public.attendance (student_id, class_id, date, extra_class_id)
  nulls not distinct;
