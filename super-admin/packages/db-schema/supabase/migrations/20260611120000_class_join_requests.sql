-- =============================================================================
-- 20260611120000_class_join_requests.sql
-- Class join codes + student join requests (replaces the per-class invite link
-- as the main onboarding flow).
--
-- New flow:
--   1. Every class gets a permanent short join_code (e.g. 'X4K2M9'). The
--      teacher shares it once (WhatsApp group, whiteboard).
--   2. A student with their own account enters the code in the student portal,
--      previews the class, and sends a join request.
--   3. The teacher sees pending requests in the app and accepts (creating the
--      student record — or linking an existing manually-added one) or rejects.
--
-- The old invite-link flow (class_invite_tokens) keeps working for backwards
-- compatibility; nothing here removes it.
-- =============================================================================

-- ---- join_code on classes ----------------------------------------------------
-- Permanent, unique, human-typeable: 6 chars from an unambiguous alphabet
-- (no 0/O, 1/I/L). Assigned server-side on insert so the offline-first teacher
-- app never has to generate or sync it; the app reads it back via PostgREST.

alter table public.classes add column if not exists join_code text unique;

create or replace function public.generate_class_join_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.classes_assign_join_code()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is null then
    new.join_code := public.generate_class_join_code();
  end if;
  return new;
end;
$$;

drop trigger if exists classes_assign_join_code on public.classes;
create trigger classes_assign_join_code
  before insert on public.classes
  for each row execute function public.classes_assign_join_code();

-- Backfill codes for classes that already exist.
update public.classes
   set join_code = public.generate_class_join_code()
 where join_code is null;

comment on column public.classes.join_code is
  'Permanent share code students type in the portal to request to join this class.';

-- ---- class_join_requests -----------------------------------------------------
create table public.class_join_requests (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,
  class_id            uuid not null references public.classes(id) on delete cascade,
  student_account_id  uuid not null references public.student_accounts(id) on delete cascade,

  -- Snapshot of the account at request time, so the teacher sees who is asking
  -- even if the account is later renamed.
  student_name        text not null,
  student_phone       text not null,

  status              text not null default 'pending'
                        check (status in ('pending', 'accepted', 'rejected')),
  -- The students row created (or linked) on accept.
  student_id          uuid references public.students(id) on delete set null,
  decided_at          timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One live request per student per class.
create unique index class_join_requests_pending_uniq
  on public.class_join_requests (class_id, student_account_id)
  where status = 'pending';

create index class_join_requests_teacher_idx
  on public.class_join_requests (teacher_id, status, created_at desc);
create index class_join_requests_account_idx
  on public.class_join_requests (student_account_id, created_at desc);

create trigger class_join_requests_set_updated_at
before update on public.class_join_requests
for each row execute function public.set_updated_at();

alter table public.class_join_requests enable row level security;

-- Teacher reads their own requests (the app lists them via PostgREST).
-- All writes happen through edge functions with the service role: students
-- have no Supabase auth user, and accepting must also create student rows.
create policy "class_join_requests_teacher_select"
  on public.class_join_requests for select
  using (auth.uid() = teacher_id);

create policy "class_join_requests_super_admin_all"
  on public.class_join_requests for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on table public.class_join_requests is
  'Students request to join a class by code; the teacher accepts (creates/links the student record) or rejects.';
