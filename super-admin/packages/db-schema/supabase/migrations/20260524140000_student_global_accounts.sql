-- =============================================================================
-- student_global_accounts — shared student identity across multiple teachers
-- =============================================================================

-- One row per real student (phone is the login identifier).
CREATE TABLE IF NOT EXISTS student_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text UNIQUE NOT NULL,
  name            text NOT NULL,
  password_hash   text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Links a global student_account to a per-teacher students row.
CREATE TABLE IF NOT EXISTS student_account_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_account_id  uuid NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
  teacher_id          uuid NOT NULL,
  student_id          uuid NOT NULL,
  linked_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_account_id, student_id)
);

CREATE INDEX IF NOT EXISTS student_account_links_account_idx ON student_account_links (student_account_id);
CREATE INDEX IF NOT EXISTS student_account_links_student_idx ON student_account_links (student_id);

-- Short-lived invite tokens a teacher generates so a student can link their account.
CREATE TABLE IF NOT EXISTS student_invite_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  teacher_id  uuid NOT NULL,
  student_id  uuid NOT NULL UNIQUE, -- one pending invite per student at a time
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS student_invite_tokens_hash_idx ON student_invite_tokens (token_hash);
