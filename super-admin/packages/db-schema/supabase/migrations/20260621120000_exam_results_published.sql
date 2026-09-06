-- =============================================================================
-- 20260621120000_exam_results_published.sql
-- Hold exam marks back from students until the teacher publishes them. The score
-- is graded + stored on submit (server-side), but a student only sees their own
-- marks once results_published is true. Mirrors the manual-exam "publish" step.
-- =============================================================================

alter table public.online_exams
  add column if not exists results_published boolean not null default false;

alter table public.online_exams
  add column if not exists results_published_at timestamptz;
