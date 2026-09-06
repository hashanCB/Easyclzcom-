-- =============================================================================
-- Collect the teacher's email at self-registration.
-- =============================================================================
-- The teachers table already has an `email citext` column (filled later in the
-- profile). This carries the email through the pending OTP step so it is saved
-- onto the account the moment registration is confirmed. Idempotent.
-- =============================================================================

alter table public.teacher_registration_otps
  add column if not exists email text;
