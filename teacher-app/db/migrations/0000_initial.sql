CREATE TABLE IF NOT EXISTS `classes` (
  `id` text PRIMARY KEY NOT NULL,
  `teacher_id` text NOT NULL,
  `class_type` text NOT NULL,
  `custom_class_type` text,
  `grade` text NOT NULL,
  `batch` text NOT NULL,
  `subject` text NOT NULL,
  `language` text NOT NULL,
  `monthly_fee_cents` integer NOT NULL,
  `location` text,
  `remark` text,
  `image_url` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `class_day` text NOT NULL,
  `class_start_time` text NOT NULL,
  `class_end_time` text NOT NULL,
  `qr_grace_minutes_before` integer NOT NULL DEFAULT 30,
  `payment_reminder_day_of_month` integer,
  `payment_reminder_time` text,
  `payment_reminder_active` integer NOT NULL DEFAULT 1,
  `deleted_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `client_updated_at` text,
  `synced_at` text
);

CREATE TABLE IF NOT EXISTS `students` (
  `id` text PRIMARY KEY NOT NULL,
  `teacher_id` text NOT NULL,
  `class_id` text NOT NULL,
  `student_code` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `student_phone` text,
  `gender` text,
  `address` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `deleted_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `client_updated_at` text,
  `synced_at` text
);

CREATE TABLE IF NOT EXISTS `payments` (
  `id` text PRIMARY KEY NOT NULL,
  `teacher_id` text NOT NULL,
  `student_id` text NOT NULL,
  `class_id` text NOT NULL,
  `month` text NOT NULL,
  `amount_cents` integer NOT NULL,
  `status` text NOT NULL,
  `method` text NOT NULL DEFAULT 'cash',
  `remark` text,
  `collected_by_user_id` text NOT NULL,
  `collected_by_role` text NOT NULL,
  `collected_at` text NOT NULL,
  `deleted_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `client_updated_at` text,
  `synced_at` text
);

CREATE TABLE IF NOT EXISTS `attendance` (
  `id` text PRIMARY KEY NOT NULL,
  `teacher_id` text NOT NULL,
  `student_id` text NOT NULL,
  `class_id` text NOT NULL,
  `date` text NOT NULL,
  `status` text NOT NULL,
  `sms_intent` integer NOT NULL DEFAULT 0,
  `sms_sent_at` text,
  `marked_by_user_id` text NOT NULL,
  `marked_by_role` text NOT NULL,
  `deleted_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `client_updated_at` text,
  `synced_at` text
);

CREATE INDEX IF NOT EXISTS `classes_teacher_idx` ON `classes` (`teacher_id`);
CREATE INDEX IF NOT EXISTS `students_class_idx` ON `students` (`class_id`);
CREATE INDEX IF NOT EXISTS `payments_student_month_idx` ON `payments` (`student_id`, `month`);
CREATE INDEX IF NOT EXISTS `attendance_class_date_idx` ON `attendance` (`class_id`, `date`);
