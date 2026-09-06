-- =============================================================================
-- 20260507100900_notes.sql
-- Notes + note files per SRS §16. File bytes live in Cloudflare R2; this table
-- only stores metadata + the R2 storage_key.
-- Pro-only feature: students see notes only when teacher's plan is active —
-- enforced at the edge-function / API layer (RLS lets the row be readable
-- when the student is enrolled; the API gates the response).
-- =============================================================================

create table public.notes (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  title               text not null,
  topic               text,
  class_id            uuid not null references public.classes(id) on delete cascade,
  grade               text not null,
  batch               text not null,
  subject             text not null,
  language            text not null check (language in ('sinhala', 'english', 'tamil', 'other')),
  date                date not null,
  link_url            text,
  remark              text,
  is_today_special    boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz
);

create index notes_teacher_date_idx on public.notes (teacher_id, date desc);
create index notes_class_idx        on public.notes (class_id);
create index notes_today_idx        on public.notes (class_id) where is_today_special = true and deleted_at is null;
create index notes_title_trgm_idx   on public.notes using gin (title extensions.gin_trgm_ops);

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

create policy "notes_super_admin_all"
  on public.notes for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "notes_teacher_all"
  on public.notes for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "notes_student_class_select"
  on public.notes for select
  using (
    public.is_student()
    and class_id in (
      select class_id from public.students where auth_user_id = auth.uid()
    )
  );

-- ---- note_files ------------------------------------------------------------
create table public.note_files (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,
  note_id             uuid not null references public.notes(id)   on delete cascade,

  kind                text not null check (kind in ('pdf', 'image', 'document', 'link', 'other')),
  filename            text not null,
  storage_key         text not null,
  size_bytes          bigint not null check (size_bytes >= 0),
  mime_type           text not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz
);

create index note_files_teacher_idx on public.note_files (teacher_id);
create index note_files_note_idx    on public.note_files (note_id) where deleted_at is null;

create trigger note_files_set_updated_at
before update on public.note_files
for each row execute function public.set_updated_at();

alter table public.note_files enable row level security;

create policy "note_files_super_admin_all"
  on public.note_files for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "note_files_teacher_all"
  on public.note_files for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "note_files_student_select"
  on public.note_files for select
  using (
    public.is_student()
    and note_id in (
      select n.id from public.notes n
      join public.students s on s.class_id = n.class_id
      where s.auth_user_id = auth.uid()
    )
  );
