-- OTP table for teacher self-service password reset (forgotten password via SMS).
-- Mirrors password_reset_otps (students) but keyed on teachers(id). The code is
-- sent to the teacher's registered phone; the teacher is identified by username.
CREATE TABLE teacher_password_reset_otps (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id  uuid        NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  otp_hash    text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id)
);

-- Only the service role (edge functions) touches this table; never the client.
ALTER TABLE teacher_password_reset_otps ENABLE ROW LEVEL SECURITY;
