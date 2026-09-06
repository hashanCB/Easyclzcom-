-- =============================================================================
-- 20260507100100_user_roles_and_jwt_hook.sql
-- Maps each `auth.users` row to a single role and exposes that role to RLS via
-- the `custom_access_token_hook` JWT hook (wired up in supabase/config.toml).
-- =============================================================================

-- ---- user_roles -------------------------------------------------------------
create table public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('super_admin', 'teacher', 'assistant', 'student')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_roles_role_idx on public.user_roles(role);

create trigger user_roles_set_updated_at
before update on public.user_roles
for each row execute function public.set_updated_at();

alter table public.user_roles enable row level security;

-- ---- RLS: user_roles --------------------------------------------------------
-- Users can read their own row (so the client can sanity-check its role).
-- Only the service role (edge functions / admin scripts) writes here.
create policy "user_roles_self_select"
  on public.user_roles
  for select
  using (auth.uid() = user_id);

-- Super admin can read all roles (admin dashboard).
create policy "user_roles_super_admin_select"
  on public.user_roles
  for select
  using (public.is_super_admin());

-- ---- custom_access_token_hook ----------------------------------------------
-- Supabase Auth invokes this on every token issue/refresh. We add a `role`
-- claim sourced from `public.user_roles` so RLS policies can branch on it.
-- Reference: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_role text;
begin
  claims := event -> 'claims';

  select role into user_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid;

  -- IMPORTANT: do NOT overwrite the standard `role` claim. PostgREST uses
  -- that claim as the Postgres role to SET LOCAL ROLE to (so it must remain
  -- 'authenticated' / 'anon' / 'service_role'). Domain roles live on a
  -- separate `user_role` claim that RLS helpers read from.
  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Supabase Auth runs the hook as the `supabase_auth_admin` role; grant only
-- the minimum it needs.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.user_roles to supabase_auth_admin;

comment on function public.custom_access_token_hook(jsonb)
  is 'Supabase auth hook — injects role claim from public.user_roles into every access token.';
