-- Add portal-access suspension flag to student_account_links.
-- is_active = false means the teacher/admin has temporarily suspended this
-- student's portal access. The link still exists (history/payments kept), but
-- the student cannot send chat messages or use teacher-scoped features.
-- Default true so all existing rows remain active.

ALTER TABLE student_account_links
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS student_account_links_active_idx
  ON student_account_links (student_id, is_active);
