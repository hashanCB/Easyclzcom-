-- =============================================================================
-- Multi-day class schedule (2026-05-25)
-- =============================================================================
-- Previously class_day was constrained to exactly one weekday enum value.
-- Teachers now pick one OR more days per class (e.g. Monday + Wednesday).
-- We store them as a comma-separated string: 'monday,wednesday,friday'.
--
-- Change: drop the single-value CHECK constraint so the column accepts
-- any text. Validation is enforced at the application layer.
-- =============================================================================

ALTER TABLE classes
  DROP CONSTRAINT IF EXISTS classes_class_day_check;

-- Add a comment so future developers understand the format.
COMMENT ON COLUMN classes.class_day IS
  'Comma-separated weekday names, e.g. ''monday'' or ''monday,wednesday,friday''. Validated at application layer.';
