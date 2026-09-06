-- =============================================================================
-- 20260621110000_online_exams.sql
-- Online-exam system (phases 2-3). A teacher publishes an exam built from their
-- per-class question_bank; students take it in the student web app using a join
-- code. Correct answers live ONLY in online_exam_questions (never sent to the
-- student client — the start/submit edge functions strip them). Anti-cheat
-- "left the screen" events are logged per attempt.
--
-- Identity: teacher operations run as the teacher's Supabase JWT (auth.uid()).
-- Student operations go through edge functions (custom student JWT) using the
-- service role, so these tables have NO student-facing RLS policies.
-- =============================================================================

-- ── Published exam ───────────────────────────────────────────────────────────
create table if not exists public.online_exams (
  id               uuid primary key default extensions.gen_random_uuid(),
  teacher_id       uuid not null references public.teachers(id) on delete cascade,
  class_id         uuid not null references public.classes(id)  on delete cascade,
  title            text not null,
  join_code        text not null unique,
  duration_minutes integer not null default 15 check (duration_minutes > 0),
  question_count   integer not null default 0,
  total_marks      integer not null default 0,
  status           text not null default 'published'
                     check (status in ('draft', 'published', 'closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists online_exams_teacher_idx on public.online_exams (teacher_id) where deleted_at is null;
create index if not exists online_exams_class_idx   on public.online_exams (class_id)   where deleted_at is null;

-- ── Snapshot of the questions in a published exam (answers server-only) ──────
create table if not exists public.online_exam_questions (
  id            uuid primary key default extensions.gen_random_uuid(),
  exam_id       uuid not null references public.online_exams(id) on delete cascade,
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  position      integer not null,
  question_type text not null,
  question_text text not null,
  options       text not null,
  correct_index integer not null,
  marks         integer not null default 1
);
create index if not exists online_exam_questions_exam_idx on public.online_exam_questions (exam_id);

-- ── One attempt per student per exam ─────────────────────────────────────────
create table if not exists public.online_exam_attempts (
  id               uuid primary key default extensions.gen_random_uuid(),
  exam_id          uuid not null references public.online_exams(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  teacher_id       uuid not null references public.teachers(id) on delete cascade,
  status           text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  score            integer,
  total            integer,
  focus_lost_count integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (exam_id, student_id)
);
create index if not exists online_exam_attempts_exam_idx on public.online_exam_attempts (exam_id);

-- ── Answers + proctoring events ──────────────────────────────────────────────
create table if not exists public.online_exam_answers (
  id             uuid primary key default extensions.gen_random_uuid(),
  attempt_id     uuid not null references public.online_exam_attempts(id) on delete cascade,
  question_id    uuid not null references public.online_exam_questions(id) on delete cascade,
  selected_index integer,
  is_correct     boolean not null default false,
  unique (attempt_id, question_id)
);

create table if not exists public.online_exam_events (
  id         uuid primary key default extensions.gen_random_uuid(),
  attempt_id uuid not null references public.online_exam_attempts(id) on delete cascade,
  type       text not null,
  created_at timestamptz not null default now()
);
create index if not exists online_exam_events_attempt_idx on public.online_exam_events (attempt_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
drop trigger if exists online_exams_set_updated_at on public.online_exams;
create trigger online_exams_set_updated_at before update on public.online_exams
for each row execute function public.set_updated_at();

drop trigger if exists online_exam_attempts_set_updated_at on public.online_exam_attempts;
create trigger online_exam_attempts_set_updated_at before update on public.online_exam_attempts
for each row execute function public.set_updated_at();

-- ── RLS — teacher owns their rows; students never touch these directly ───────
alter table public.online_exams           enable row level security;
alter table public.online_exam_questions  enable row level security;
alter table public.online_exam_attempts   enable row level security;
alter table public.online_exam_answers    enable row level security;
alter table public.online_exam_events     enable row level security;

drop policy if exists "online_exams_super_admin_all" on public.online_exams;
create policy "online_exams_super_admin_all" on public.online_exams for all
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "online_exams_teacher_all" on public.online_exams;
create policy "online_exams_teacher_all" on public.online_exams for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

drop policy if exists "online_exam_questions_teacher_all" on public.online_exam_questions;
create policy "online_exam_questions_teacher_all" on public.online_exam_questions for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

drop policy if exists "online_exam_attempts_teacher_select" on public.online_exam_attempts;
create policy "online_exam_attempts_teacher_select" on public.online_exam_attempts for select
  using (auth.uid() = teacher_id or public.is_super_admin());

-- answers/events: no teacher policy needed for v1 (results read from attempts).
-- Service role (edge functions) bypasses RLS; super admin can read for support.
drop policy if exists "online_exam_answers_super_admin" on public.online_exam_answers;
create policy "online_exam_answers_super_admin" on public.online_exam_answers for select
  using (public.is_super_admin());
drop policy if exists "online_exam_events_super_admin" on public.online_exam_events;
create policy "online_exam_events_super_admin" on public.online_exam_events for select
  using (public.is_super_admin());

-- ── create_online_exam — build + publish an exam from the question bank ──────
-- Picks p_question_count random active questions from the teacher's bank for the
-- class, snapshots them (with answers), generates a unique join code, and
-- returns the published exam row. Runs as the calling teacher.
create or replace function public.create_online_exam(
  p_class_id uuid,
  p_title text,
  p_question_count integer,
  p_duration integer
) returns public.online_exams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_code    text;
  v_exam    public.online_exams;
  v_pos     integer := 0;
  v_total   integer := 0;
  r         record;
begin
  if v_teacher is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from classes where id = p_class_id and teacher_id = v_teacher and deleted_at is null) then
    raise exception 'class not found';
  end if;

  loop
    v_code := upper(substr(md5(extensions.gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from online_exams where join_code = v_code);
  end loop;

  insert into online_exams (teacher_id, class_id, title, join_code, duration_minutes, question_count, total_marks, status)
  values (v_teacher, p_class_id, coalesce(nullif(trim(p_title), ''), 'Exam'), v_code, greatest(coalesce(p_duration, 15), 1), 0, 0, 'published')
  returning * into v_exam;

  for r in
    select * from question_bank
    where teacher_id = v_teacher and class_id = p_class_id and deleted_at is null and is_active = true
    order by random()
    limit greatest(coalesce(p_question_count, 1), 1)
  loop
    insert into online_exam_questions (exam_id, teacher_id, position, question_type, question_text, options, correct_index, marks)
    values (v_exam.id, v_teacher, v_pos, r.question_type, r.question_text, r.options, r.correct_index, r.marks);
    v_pos := v_pos + 1;
    v_total := v_total + r.marks;
  end loop;

  if v_pos = 0 then raise exception 'no questions in the bank for this class'; end if;

  update online_exams set question_count = v_pos, total_marks = v_total where id = v_exam.id returning * into v_exam;
  return v_exam;
end;
$$;

grant execute on function public.create_online_exam(uuid, text, integer, integer) to authenticated;

comment on table public.online_exams is 'Published online exams (phase 2). Built from question_bank; taken by students via a join code.';
