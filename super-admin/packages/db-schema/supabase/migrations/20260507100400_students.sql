-- =============================================================================
-- 20260507100400_students.sql
-- Students belong to a teacher tenant and are linked to a single class.
-- A student also has its own auth.users row (Student ID + 6-digit password
-- login per SRS §8.2); students.id = auth.users.id when the student has been
-- granted portal access.
-- =============================================================================

create table public.students (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  student_code        text not null,
  name                text not null,
  gender              text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  address             text,
  student_phone       text,
  parent_name         text,
  parent_mobile       text,
  parent_whatsapp     text,
  emergency_contact   text,

  class_id            uuid not null references public.classes(id) on delete restrict,
  grade               text not null,
  batch               text not null,
  subject             text not null,
  language            text not null check (language in ('sinhala', 'english', 'tamil', 'other')),

  profile_photo_url   text,
  is_active           boolean not null default true,

  -- Bumped each time the printed card is regenerated (lost-card reprint flow,
  -- SRS §9.2). Old QR codes remain valid until card_version changes.
  card_version        integer not null default 1,

  -- Optional link to auth.users when student portal access has been granted.
  -- Nullable because students exist offline-only until the teacher activates
  -- Pro and the student logs in.
  auth_user_id        uuid references auth.users(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz,

  unique (teacher_id, student_code)
);

create index students_teacher_idx        on public.students (teacher_id)              where deleted_at is null;
create index students_class_idx          on public.students (class_id)                where deleted_at is null;
create index students_teacher_active_idx on public.students (teacher_id, is_active)   where deleted_at is null;
create index students_name_trgm_idx      on public.students using gin (name extensions.gin_trgm_ops);
create index students_auth_user_idx      on public.students (auth_user_id)            where auth_user_id is not null;

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

alter table public.students enable row level security;

create policy "students_super_admin_all"
  on public.students for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "students_teacher_all"
  on public.students for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "students_self_select"
  on public.students for select
  using (auth.uid() = auth_user_id);

-- ---- student_credentials ---------------------------------------------------
-- Student passwords are hashed app-side (Argon2 — see U07) and stored here.
-- Supabase Auth handles password verification for students with auth_user_id;
-- this table is the offline-fallback / pre-auth source of truth.
create table public.student_credentials (
  id                    uuid primary key default extensions.gen_random_uuid(),
  teacher_id            uuid not null references public.teachers(id) on delete cascade,
  student_id            uuid not null references public.students(id) on delete cascade unique,
  password_hash         text not null,
  password_changed_at   timestamptz,
  failed_attempts       integer not null default 0 check (failed_attempts >= 0),
  locked_until          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index student_credentials_teacher_idx on public.student_credentials (teacher_id);

create trigger student_credentials_set_updated_at
before update on public.student_credentials
for each row execute function public.set_updated_at();

alter table public.student_credentials enable row level security;

-- Only super admin and the owning teacher can read credential metadata. The
-- password_hash column itself is never returned to teacher-side queries —
-- edge functions (service-role) verify the hash and return only success/fail.
create policy "student_credentials_super_admin_all"
  on public.student_credentials for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "student_credentials_teacher_select"
  on public.student_credentials for select
  using (auth.uid() = teacher_id);

comment on table public.students is 'Students per SRS §8. Linked to a class and (optionally) an auth.users row.';
comment on table public.student_credentials is 'Hashed student passwords (6-digit). password_hash is service-role only.';
