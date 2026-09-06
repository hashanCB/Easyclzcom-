-- Add is_active and deleted_at to student_accounts for admin deactivation / soft-delete.
ALTER TABLE student_accounts
  ADD COLUMN IF NOT EXISTS is_active  boolean      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS student_accounts_active_idx ON student_accounts (is_active) WHERE deleted_at IS NULL;
