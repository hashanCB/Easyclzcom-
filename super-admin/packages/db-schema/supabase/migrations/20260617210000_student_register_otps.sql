-- =============================================================================
-- 20260617210000_student_register_otps.sql
-- Phone-OTP verification for student self-registration.
--
-- Flow:
--   1. student_register_request — student submits phone + name + password.
--      We hash the password, generate a 6-digit OTP, store the pending row here,
--      and SMS the code. NO student_accounts row is created yet.
--   2. student_register_confirm — student submits the OTP. On match we create the
--      real student_accounts row and delete this pending row.
--
-- One pending registration per phone (upsert on conflict). Rows are short-lived
-- (10-min TTL) and cleaned up on confirm / expiry.
-- =============================================================================

create table if not exists public.student_register_otps (
  phone          text primary key,            -- local 07XXXXXXXXX format
  name           text not null,
  password_hash  text not null,
  otp_hash       text not null,
  attempts       smallint not null default 0, -- wrong-code guesses, capped
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

comment on table public.student_register_otps is
  'Pending phone-verified student registrations. Holds name + password hash + OTP until the code is confirmed, then a student_accounts row is created.';

-- Service-role only — all access goes through the register edge functions.
alter table public.student_register_otps enable row level security;

create policy student_register_otps_super_admin_all
  on public.student_register_otps for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
