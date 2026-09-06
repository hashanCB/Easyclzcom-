-- OTP store for student phone-number changes.
-- One pending request per account at a time (UNIQUE on account_id).
CREATE TABLE IF NOT EXISTS phone_change_otps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
  new_phone   text        NOT NULL,
  otp_hash    text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);
