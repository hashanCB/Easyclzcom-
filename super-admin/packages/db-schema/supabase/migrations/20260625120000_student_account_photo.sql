-- =============================================================================
-- 20260625120000_student_account_photo.sql
-- Lets a student attach a real profile photo to their global account (in
-- addition to the cosmetic emoji+color avatar). Stored as a small, downscaled
-- data URL (the student website downscales before upload, so rows stay small).
-- At class-join time (respond_join_request) this photo is copied into the
-- teacher's R2 namespace and surfaced on the teacher's student record.
-- =============================================================================

alter table student_accounts
  add column if not exists profile_photo text;
