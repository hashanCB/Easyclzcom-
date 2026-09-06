-- =============================================================================
-- 20260507100500_assistants.sql
-- Assistants per SRS §12. A teacher can create up to 2 assistants. Each
-- assistant has its own auth.users row (8-digit password login) and is
-- granted permission per class via assistant_class_permissions.
-- The 2-assistant cap is enforced by a partial unique index on the count
-- (see trigger below — Postgres doesn't have a native "max N rows per
-- tenant" constraint, so we use a check trigger).
-- =============================================================================

create table public.assistants (
  id                  uuid primary key references auth.users(id) on delete cascade,
  teacher_id          uuid not null references public.teachers(id) on delete cascade,
  name                text not null,
  phone               text not null,
  username            citext not null,
  is_active           boolean not null default true,
  last_login_at       timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz,

  unique (teacher_id, username)
);

create index assistants_teacher_idx on public.assistants (teacher_id) where deleted_at is null;

create trigger assistants_set_updated_at
before update on public.assistants
for each row execute function public.set_updated_at();

-- Enforce the SRS §12.1 cap of 2 active assistants per teacher.
create or replace function public.enforce_assistant_cap()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  select count(*) into active_count
  from public.assistants
  where teacher_id = new.teacher_id
    and deleted_at is null
    and (tg_op = 'INSERT' or id <> new.id);

  if active_count >= 2 then
    raise exception 'Teacher % already has the maximum of 2 active assistants', new.teacher_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger assistants_enforce_cap
before insert or update on public.assistants
for each row
when (new.deleted_at is null)
execute function public.enforce_assistant_cap();

alter table public.assistants enable row level security;

create policy "assistants_super_admin_all"
  on public.assistants for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "assistants_teacher_all"
  on public.assistants for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "assistants_self_select"
  on public.assistants for select
  using (auth.uid() = id);

-- ---- assistant_class_permissions -------------------------------------------
create table public.assistant_class_permissions (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,
  assistant_id        uuid not null references public.assistants(id) on delete cascade,
  class_id            uuid not null references public.classes(id)    on delete cascade,
  permission          text not null check (permission in ('attendance', 'payment', 'both')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz,

  unique (assistant_id, class_id)
);

create index acp_teacher_idx   on public.assistant_class_permissions (teacher_id) where deleted_at is null;
create index acp_assistant_idx on public.assistant_class_permissions (assistant_id) where deleted_at is null;
create index acp_class_idx     on public.assistant_class_permissions (class_id) where deleted_at is null;

create trigger acp_set_updated_at
before update on public.assistant_class_permissions
for each row execute function public.set_updated_at();

alter table public.assistant_class_permissions enable row level security;

create policy "acp_super_admin_all"
  on public.assistant_class_permissions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "acp_teacher_all"
  on public.assistant_class_permissions for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "acp_assistant_self_select"
  on public.assistant_class_permissions for select
  using (auth.uid() = assistant_id);

-- ---- Assistant access helper -----------------------------------------------
-- Used by RLS on `attendance` and `payments` so an assistant can only touch
-- rows whose class they have permission for.
create or replace function public.assistant_has_class_access(p_class_id uuid, p_required text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.assistant_class_permissions acp
    join public.assistants a on a.id = acp.assistant_id
    where acp.assistant_id = auth.uid()
      and acp.class_id = p_class_id
      and acp.deleted_at is null
      and a.is_active = true
      and a.deleted_at is null
      and (acp.permission = p_required or acp.permission = 'both')
  );
$$;

comment on function public.assistant_has_class_access(uuid, text)
  is 'True when the current JWT subject is an active assistant with permission (attendance | payment | both) on the class.';
