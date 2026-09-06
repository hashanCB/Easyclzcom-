-- =============================================================================
-- 20260603130000_login_throttle.sql
-- Brute-force protection for teacher login (SRS hardening).
--
-- Supabase Auth (GoTrue) applies only coarse, global/IP rate limits — it does
-- NOT lock a single account after repeated wrong passwords. This table gives
-- login_teacher a per-username failed-attempt counter with a temporary lockout
-- so an attacker cannot grind passwords against one account.
--
-- Written/read only by the login_teacher edge function (service role), so RLS
-- is enabled with NO policies — clients can never touch it directly.
-- =============================================================================

create table public.login_attempts (
  identifier    text primary key,                  -- lowercased username
  fail_count    integer not null default 0 check (fail_count >= 0),
  locked_until  timestamptz,                        -- set when the lock trips
  updated_at    timestamptz not null default now()
);

comment on table public.login_attempts is
  'Per-username failed-login counter + temporary lockout for teacher login brute-force protection. Service-role only.';

alter table public.login_attempts enable row level security;
-- (no policies on purpose — only the service-role edge function reads/writes it)
