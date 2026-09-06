-- OTP table for student password reset (forgotten password via SMS).
CREATE TABLE password_reset_otps (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
  otp_hash    text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);
