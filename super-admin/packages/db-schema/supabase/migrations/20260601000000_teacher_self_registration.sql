-- =============================================================================
-- Teacher self-registration (public sign-up with phone OTP verification)
-- =============================================================================
-- Until now a teacher account could only be created by a super admin
-- (create_teacher). This adds a public, self-serve sign-up: a teacher enters
-- their details, verifies their phone via SMS OTP, and the account is created +
-- auto-activated on their phone — no admin, no hand-over token.
--
-- This table holds the PENDING registration between "request OTP" and "confirm".
-- It deliberately does NOT store the password: the password is supplied fresh
-- in the confirm call (the app keeps it in memory on the same screen), so a leak
-- of this short-lived table never exposes a credential. Rows are keyed by phone
-- and expire after a few minutes.
-- =============================================================================

create table if not exists public.teacher_registration_otps (
  phone       text        primary key,           -- local 07XXXXXXXXX format
  username    citext      not null,
  name        text,
  otp_hash    text        not null,              -- sha256(otp)
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Service-role only: every read/write happens inside the register_teacher_*
-- edge functions. No client ever touches this table directly.
alter table public.teacher_registration_otps enable row level security;

comment on table public.teacher_registration_otps
  is 'Pending teacher self-registrations awaiting phone-OTP confirmation. Service-role only; password is never stored here (supplied at confirm time).';
