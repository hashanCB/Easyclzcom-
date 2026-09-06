-- =============================================================================
-- 20260507100200_teachers.sql
-- The teacher tenant table plus the activation/session/audit tables that hang
-- off it. Every other multi-tenant table created in later migrations references
-- `public.teachers(id)` as the tenant key.
--
-- Auth model:
--   - Each teacher has a row in `auth.users` (Supabase Auth handles password
--     hashing). The `teachers.id` equals `auth.users.id` so `auth.uid()`
--     directly identifies the teacher row.
--   - `username` lives on this table (case-insensitive, unique). The U07
--     `login_teacher` edge function maps username → email for Supabase Auth.
-- =============================================================================

-- ---- teachers ---------------------------------------------------------------
create table public.teachers (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            citext not null unique,

  -- Profile (filled on first-time setup per SRS §5.2; super-admin creates the
  -- shell row, teacher fills the rest on first login).
  name                text,
  education_qualification text,
  phone               text not null,
  email               citext,
  address             text,
  gender              text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  profile_photo_url   text,

  -- Lifecycle
  is_active           boolean not null default true,
  is_profile_complete boolean not null default false,
  last_login_at       timestamptz,

  -- Standard sync columns (every multi-tenant table carries these)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz
);

create index teachers_username_idx       on public.teachers (username);
create index teachers_is_active_idx      on public.teachers (is_active) where deleted_at is null;
create index teachers_name_trgm_idx      on public.teachers using gin (name extensions.gin_trgm_ops);

create trigger teachers_set_updated_at
before update on public.teachers
for each row execute function public.set_updated_at();

alter table public.teachers enable row level security;

-- RLS: teachers
-- Super admin: full access (creates shells + monitors).
-- Teacher: read & update own row only. Soft-delete (`deleted_at`) is the only
-- delete path; we do not allow hard deletes from the API.
create policy "teachers_super_admin_all"
  on public.teachers
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "teachers_self_select"
  on public.teachers
  for select
  using (auth.uid() = id);

create policy "teachers_self_update"
  on public.teachers
  for update
  using (auth.uid() = id and deleted_at is null)
  with check (auth.uid() = id);

-- ---- teacher_tokens ---------------------------------------------------------
-- 12-digit activation tokens (ADR / shared-utils generateActivationToken).
-- Stored as a hash; the plaintext is shown to super-admin only at create time.
-- Single-device binding per SRS §5.5.
create table public.teacher_tokens (
  id                uuid primary key default extensions.gen_random_uuid(),
  teacher_id        uuid not null references public.teachers(id) on delete cascade,
  token_hash        text not null unique,

  bound_device_id   text,
  bound_at          timestamptz,
  revoked_at        timestamptz,
  revoked_reason    text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index teacher_tokens_teacher_idx on public.teacher_tokens (teacher_id);
create index teacher_tokens_active_idx
  on public.teacher_tokens (teacher_id)
  where revoked_at is null;

create trigger teacher_tokens_set_updated_at
before update on public.teacher_tokens
for each row execute function public.set_updated_at();

alter table public.teacher_tokens enable row level security;

-- RLS: teacher_tokens
-- Super admin: full access (creates / revokes tokens).
-- Teacher: read own tokens (so the device can confirm activation status), no
-- writes — token rotation is super-admin-only.
create policy "teacher_tokens_super_admin_all"
  on public.teacher_tokens
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "teacher_tokens_self_select"
  on public.teacher_tokens
  for select
  using (auth.uid() = teacher_id);

-- ---- teacher_sessions -------------------------------------------------------
-- Tracks active devices per teacher. The `login_teacher` / `activate_teacher`
-- edge functions in U07 maintain this; UI uses it to show "active devices" and
-- to detect duplicate-token attempts.
create table public.teacher_sessions (
  id            uuid primary key default extensions.gen_random_uuid(),
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  device_id     text not null,
  device_info   jsonb,
  is_active     boolean not null default true,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (teacher_id, device_id)
);

create index teacher_sessions_teacher_idx on public.teacher_sessions (teacher_id);
create index teacher_sessions_active_idx
  on public.teacher_sessions (teacher_id)
  where is_active = true;

create trigger teacher_sessions_set_updated_at
before update on public.teacher_sessions
for each row execute function public.set_updated_at();

alter table public.teacher_sessions enable row level security;

-- RLS: teacher_sessions
-- Super admin: read all (active sessions monitor).
-- Teacher: read own sessions; updates go through edge functions only.
create policy "teacher_sessions_super_admin_select"
  on public.teacher_sessions
  for select
  using (public.is_super_admin());

create policy "teacher_sessions_self_select"
  on public.teacher_sessions
  for select
  using (auth.uid() = teacher_id);

-- ---- duplicate_token_attempts ----------------------------------------------
-- Audit trail per SRS §5.5 — every time someone tries to use a token already
-- bound to a different device, an edge function writes a row here.
create table public.duplicate_token_attempts (
  id                      uuid primary key default extensions.gen_random_uuid(),
  teacher_id              uuid not null references public.teachers(id) on delete cascade,
  attempted_device_id     text not null,
  attempted_device_info   jsonb,
  attempted_at            timestamptz not null default now()
);

create index duplicate_token_attempts_teacher_idx
  on public.duplicate_token_attempts (teacher_id, attempted_at desc);

alter table public.duplicate_token_attempts enable row level security;

-- RLS: duplicate_token_attempts
-- Super admin: read all (admin dashboard widget).
-- Teacher: read own attempts (so device can warn the user).
-- Writes are service-role only.
create policy "duplicate_token_attempts_super_admin_select"
  on public.duplicate_token_attempts
  for select
  using (public.is_super_admin());

create policy "duplicate_token_attempts_self_select"
  on public.duplicate_token_attempts
  for select
  using (auth.uid() = teacher_id);

-- ---- Comments ---------------------------------------------------------------
comment on table public.teachers
  is 'Teacher tenant. teachers.id = auth.users.id; every multi-tenant table FK-references this id.';
comment on table public.teacher_tokens
  is 'Activation tokens (12-digit, hashed). Single-device-bind per SRS §5.5.';
comment on table public.teacher_sessions
  is 'Active device sessions for a teacher. Maintained by login_teacher edge function (U07).';
comment on table public.duplicate_token_attempts
  is 'Audit log of duplicate-token attempts per SRS §5.5.';
