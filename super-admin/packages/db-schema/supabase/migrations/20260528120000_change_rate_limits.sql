-- Monthly rate-limit counters for student self-service changes.
ALTER TABLE student_accounts
  ADD COLUMN IF NOT EXISTS phone_change_month  text,     -- 'YYYY-MM' of current window
  ADD COLUMN IF NOT EXISTS phone_change_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pw_change_month     text,
  ADD COLUMN IF NOT EXISTS pw_change_count     integer NOT NULL DEFAULT 0;
