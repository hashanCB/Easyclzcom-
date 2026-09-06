-- =============================================================================
-- 20260621150000_question_images.sql
-- Image support for online-exam questions: a question can have an image, and
-- each MCQ option can have an image (cropped from a photo). Stored as R2 object
-- keys (text). option_images is a JSON-array TEXT aligned to options by index.
-- =============================================================================

alter table public.question_bank        add column if not exists question_image text;
alter table public.question_bank        add column if not exists option_images  text;
alter table public.online_exam_questions add column if not exists question_image text;
alter table public.online_exam_questions add column if not exists option_images  text;

-- Re-snapshot the new image columns when an exam is created from the bank.
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
    insert into online_exam_questions (exam_id, teacher_id, position, question_type, question_text, options, correct_index, marks, question_image, option_images)
    values (v_exam.id, v_teacher, v_pos, r.question_type, r.question_text, r.options, r.correct_index, r.marks, r.question_image, r.option_images);
    v_pos := v_pos + 1;
    v_total := v_total + r.marks;
  end loop;

  if v_pos = 0 then raise exception 'no questions in the bank for this class'; end if;

  update online_exams set question_count = v_pos, total_marks = v_total where id = v_exam.id returning * into v_exam;
  return v_exam;
end;
$$;
