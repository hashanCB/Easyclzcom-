-- =============================================================================
-- 20260507101300_audit_and_sync.sql
-- Audit log per SRS §24.4 (append-only) + sync_state bookkeeping per SRS §23.
-- =============================================================================

create table public.audit_logs (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  user_id             uuid not null,
  user_role           text not null check (user_role in ('super_admin','teacher','assistant','student')),
  action              text not null,
  entity_type         text not null,
  entity_id           uuid,
  old_value           jsonb,
  new_value           jsonb,
  device_id           text,
  device_info         jsonb,
  occurred_at         timestamptz not null default now(),

  created_at          timestamptz not null default now()
);

create index audit_logs_teacher_idx        on public.audit_logs (teacher_id, occurred_at desc);
create index audit_logs_action_idx         on public.audit_logs (teacher_id, action, occurred_at desc);
create index audit_logs_entity_idx         on public.audit_logs (entity_type, entity_id);
create index audit_logs_user_idx           on public.audit_logs (user_id, occurred_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_logs_super_admin_select"
  on public.audit_logs for select
  using (public.is_super_admin());

create policy "audit_logs_teacher_select"
  on public.audit_logs for select
  using (auth.uid() = teacher_id);

-- Audit rows are append-only — no policies for insert/update/delete; writes
-- happen through service-role edge functions.

-- Block updates and deletes outright as a defence-in-depth.
create or replace function public.audit_logs_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only'
    using errcode = 'restrict_violation';
end;
$$;

create trigger audit_logs_block_update
before update on public.audit_logs
for each row execute function public.audit_logs_block_mutation();

create trigger audit_logs_block_delete
before delete on public.audit_logs
for each row execute function public.audit_logs_block_mutation();

-- ---- sync_state ------------------------------------------------------------
-- One row per (teacher, table). Tracks last-pulled cursor + last-pushed
-- timestamp so the sync engine (U24) can resume from where it left off.
create table public.sync_state (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  table_name          text not null,
  last_pulled_at      timestamptz,
  last_pushed_at      timestamptz,
  last_cursor         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  client_updated_at   timestamptz,

  unique (teacher_id, table_name)
);

create index sync_state_teacher_idx on public.sync_state (teacher_id);

create trigger sync_state_set_updated_at
before update on public.sync_state
for each row execute function public.set_updated_at();

alter table public.sync_state enable row level security;

create policy "sync_state_super_admin_all"
  on public.sync_state for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "sync_state_teacher_all"
  on public.sync_state for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

comment on table public.audit_logs is 'Append-only audit log per SRS §24.4. Updates and deletes are blocked.';
comment on table public.sync_state is 'Sync cursor bookkeeping per (teacher, table) for the U24 sync engine.';
