-- =============================================================================
-- class_invite_tokens — one shareable link per class that any student in that
-- class can use to join. Unlike student_invite_tokens (single-use, one student),
-- a class token is multi-use: the student identifies themselves by student_code.
-- =============================================================================

CREATE TABLE IF NOT EXISTS class_invite_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  teacher_id  uuid NOT NULL,
  class_id    uuid NOT NULL UNIQUE,  -- one active link per class; regenerating replaces it
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_invite_tokens_hash_idx ON class_invite_tokens (token_hash);
