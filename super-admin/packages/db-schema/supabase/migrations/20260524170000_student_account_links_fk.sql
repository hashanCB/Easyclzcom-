-- Add missing FK constraints to student_account_links so Supabase can
-- resolve the joins in student_global_login.

ALTER TABLE student_account_links
  ADD CONSTRAINT student_account_links_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE student_account_links
  ADD CONSTRAINT student_account_links_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE;
