-- =============================================================================
-- 20260507100000_init_extensions_and_helpers.sql
-- Bootstraps shared extensions and small helper functions reused by every
-- subsequent migration (updated_at trigger + role-claim helpers).
-- =============================================================================

-- ---- Extensions -------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;  -- uuid_generate_v4()
create extension if not exists pgcrypto    with schema extensions;  -- gen_random_uuid(), digest()
create extension if not exists pg_trgm     with schema extensions;  -- trigram search on names
create extension if not exists citext      with schema extensions;  -- case-insensitive usernames

-- ---- updated_at trigger -----------------------------------------------------
-- Every multi-tenant table installs this trigger to keep `updated_at` honest
-- regardless of whether the writer remembered to set it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- Role-claim helpers -----------------------------------------------------
-- Read the `user_role` claim that `public.custom_access_token_hook` injects
-- into the access token (see migration 100100). Returns NULL for service-role
-- keys (which bypass RLS entirely anyway).
-- NOTE: this is the *application* role (super_admin / teacher / assistant /
-- student) — distinct from the standard JWT `role` claim, which PostgREST
-- uses to choose the Postgres role to switch to ('authenticated' etc.).
create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'),
    null
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'super_admin';
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'teacher';
$$;

create or replace function public.is_assistant()
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'assistant';
$$;

create or replace function public.is_student()
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'student';
$$;

comment on function public.jwt_role()         is 'Reads the role claim added by custom_access_token_hook.';
comment on function public.is_super_admin()   is 'True when the JWT role claim equals super_admin.';
comment on function public.is_teacher()       is 'True when the JWT role claim equals teacher.';
comment on function public.is_assistant()     is 'True when the JWT role claim equals assistant.';
comment on function public.is_student()       is 'True when the JWT role claim equals student.';
