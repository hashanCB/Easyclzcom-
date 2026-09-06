-- =============================================================================
-- 20260522130000_push_tokens.sql  (U45 — Push Notifications)
-- =============================================================================
-- Expo push tokens for the native teacher/assistant app. One row per device.
-- The owner (teacher or assistant) manages their own rows via RLS; the
-- service-role edge functions read all rows to fan out notifications.
-- =============================================================================

create table if not exists public.push_tokens (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('teacher', 'assistant')),
  token        text not null unique,                 -- Expo push token
  device_id    text,
  platform     text check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

-- Owner manages their own tokens (auth.uid() = the teacher/assistant auth user).
create policy "push_tokens_owner_all"
  on public.push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Super admin may read (support/debug). Sending happens via service role.
create policy "push_tokens_super_admin_select"
  on public.push_tokens for select
  using (public.is_super_admin());

comment on table public.push_tokens is 'Expo push tokens per device for the native teacher/assistant app (U45).';
