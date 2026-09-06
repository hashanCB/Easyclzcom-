-- Per-day class schedule support.
-- Each class can now store a per-day start/end time as JSON in class_schedule.
-- Format: [{"day":"monday","start":"14:00","end":"16:00"},...]
-- class_start_time and class_end_time remain NOT NULL (derived from first day)
-- for backward compatibility with existing queries and RLS policies.

ALTER TABLE classes ADD COLUMN IF NOT EXISTS class_schedule text;

COMMENT ON COLUMN classes.class_schedule IS
  'JSON array of per-day schedules: [{day, start, end}]. '
  'Null means all days share class_start_time / class_end_time.';
