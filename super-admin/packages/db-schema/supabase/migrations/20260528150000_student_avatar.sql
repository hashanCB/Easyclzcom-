-- Cosmetic emoji avatar + color theme for student profiles.
ALTER TABLE student_accounts
  ADD COLUMN IF NOT EXISTS avatar_emoji text NOT NULL DEFAULT '🎓',
  ADD COLUMN IF NOT EXISTS avatar_color text NOT NULL DEFAULT 'blue';
