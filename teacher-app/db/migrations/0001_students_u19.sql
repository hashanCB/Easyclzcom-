-- U19: extend students table with SRS §8.1 fields + §8.2 credentials
ALTER TABLE `students` ADD COLUMN `parent_name` text;
ALTER TABLE `students` ADD COLUMN `parent_phone` text;
ALTER TABLE `students` ADD COLUMN `parent_whatsapp` text;
ALTER TABLE `students` ADD COLUMN `emergency_contact` text;
ALTER TABLE `students` ADD COLUMN `grade` text;
ALTER TABLE `students` ADD COLUMN `batch` text;
ALTER TABLE `students` ADD COLUMN `subject` text;
ALTER TABLE `students` ADD COLUMN `language` text;
ALTER TABLE `students` ADD COLUMN `photo_url` text;
ALTER TABLE `students` ADD COLUMN `password_plain` text;
ALTER TABLE `students` ADD COLUMN `card_version` integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS `students_teacher_idx` ON `students` (`teacher_id`);
