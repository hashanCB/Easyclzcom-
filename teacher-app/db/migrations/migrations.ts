// Drizzle expo-sqlite migration bundle.
// journal.entries drives execution order; migrations are keyed `m<paddedIdx>`
// (Drizzle 0.36+ format). Each statement separated by `--> statement-breakpoint`
// so the runner executes them one at a time instead of as a single prepared stmt.
//
// On fresh local DBs we keep a SINGLE migration (m0000) that defines the latest
// schema. The DB filename is bumped (`teacher_local_v3.db`) so existing devices
// regenerate from this baseline rather than replaying ALTER TABLE chains.
//
// v3 baseline (U24): all columns renamed to match the Supabase cloud schema so
// sync push doesn't 400 (parent_mobile, profile_photo_url, synced_at on
// payment_corrections, sync_cursor table).

const m0000 = `
CREATE TABLE IF NOT EXISTS \`classes\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`class_type\` text NOT NULL,
  \`custom_class_type\` text,
  \`grade\` text NOT NULL,
  \`batch\` text NOT NULL,
  \`subject\` text NOT NULL,
  \`language\` text NOT NULL,
  \`monthly_fee_cents\` integer NOT NULL,
  \`location\` text,
  \`remark\` text,
  \`image_url\` text,
  \`is_active\` integer NOT NULL DEFAULT 1,
  \`class_day\` text NOT NULL,
  \`class_start_time\` text NOT NULL,
  \`class_end_time\` text NOT NULL,
  \`qr_grace_minutes_before\` integer NOT NULL DEFAULT 30,
  \`payment_reminder_day_of_month\` integer,
  \`payment_reminder_time\` text,
  \`payment_reminder_active\` integer NOT NULL DEFAULT 1,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`students\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`student_code\` text NOT NULL UNIQUE,
  \`name\` text NOT NULL,
  \`student_phone\` text,
  \`gender\` text,
  \`address\` text,
  \`parent_name\` text,
  \`parent_mobile\` text,
  \`parent_whatsapp\` text,
  \`emergency_contact\` text,
  \`grade\` text,
  \`batch\` text,
  \`subject\` text,
  \`language\` text,
  \`profile_photo_url\` text,
  \`password_plain\` text,
  \`card_version\` integer NOT NULL DEFAULT 1,
  \`is_active\` integer NOT NULL DEFAULT 1,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`payments\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`student_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`month\` text NOT NULL,
  \`amount_cents\` integer NOT NULL,
  \`status\` text NOT NULL,
  \`method\` text NOT NULL DEFAULT 'cash',
  \`remark\` text,
  \`collected_by_user_id\` text NOT NULL,
  \`collected_by_role\` text NOT NULL,
  \`collected_at\` text NOT NULL,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`attendance\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`student_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`date\` text NOT NULL,
  \`status\` text NOT NULL,
  \`sms_intent\` integer NOT NULL DEFAULT 0,
  \`sms_sent_at\` text,
  \`marked_by_user_id\` text NOT NULL,
  \`marked_by_role\` text NOT NULL,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`classes_teacher_idx\` ON \`classes\` (\`teacher_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`students_class_idx\` ON \`students\` (\`class_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`students_teacher_idx\` ON \`students\` (\`teacher_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`payments_student_month_idx\` ON \`payments\` (\`student_id\`, \`month\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`attendance_class_date_idx\` ON \`attendance\` (\`class_id\`, \`date\`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`payment_corrections\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`payment_id\` text NOT NULL,
  \`type\` text NOT NULL,
  \`amount_cents\` integer NOT NULL,
  \`remark\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`corrections_payment_idx\` ON \`payment_corrections\` (\`payment_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`corrections_teacher_idx\` ON \`payment_corrections\` (\`teacher_id\`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`sync_cursor\` (
  \`table_name\` text PRIMARY KEY NOT NULL,
  \`last_pulled_at\` text,
  \`last_pushed_at\` text
);
`;

// U38: notes + note_files tables
const m0001 = `
CREATE TABLE IF NOT EXISTS \`notes\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`title\` text NOT NULL,
  \`topic\` text,
  \`grade\` text,
  \`batch\` text,
  \`subject\` text,
  \`language\` text,
  \`note_date\` text NOT NULL,
  \`note_type\` text NOT NULL DEFAULT 'normal',
  \`link_url\` text,
  \`remark\` text,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`notes_teacher_idx\` ON \`notes\` (\`teacher_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`notes_class_idx\` ON \`notes\` (\`class_id\`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`note_files\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`note_id\` text NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`filename\` text NOT NULL,
  \`mime_type\` text NOT NULL,
  \`size_bytes\` integer,
  \`r2_key\` text NOT NULL,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`note_files_note_idx\` ON \`note_files\` (\`note_id\`);
`;

// U30-fix: note_files needs synced_at so the sync engine can push them to cloud
const m0002 = `
ALTER TABLE \`note_files\` ADD COLUMN \`synced_at\` text;
`;

// U33: message_templates local table for offline template CRUD + sync
const m0003 = `
CREATE TABLE IF NOT EXISTS \`message_templates\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`type\` text NOT NULL,
  \`language\` text NOT NULL DEFAULT 'english',
  \`body\` text NOT NULL,
  \`is_default\` integer NOT NULL DEFAULT 0,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`msg_templates_teacher_idx\` ON \`message_templates\` (\`teacher_id\`);
`;

// U40: exams local table
const m0004 = `
CREATE TABLE IF NOT EXISTS \`exams\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`title\` text NOT NULL,
  \`grade\` text NOT NULL,
  \`batch\` text NOT NULL,
  \`subject\` text NOT NULL,
  \`language\` text NOT NULL,
  \`exam_date\` text NOT NULL,
  \`total_marks\` integer NOT NULL,
  \`remark\` text,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`exams_teacher_idx\` ON \`exams\` (\`teacher_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`exams_class_idx\` ON \`exams\` (\`class_id\`);
`;

// U41: marks local table
const m0005 = `
CREATE TABLE IF NOT EXISTS \`marks\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`exam_id\` text NOT NULL,
  \`student_id\` text NOT NULL,
  \`mark\` real NOT NULL,
  \`remark\` text,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`marks_exam_idx\` ON \`marks\` (\`exam_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`marks_student_idx\` ON \`marks\` (\`student_id\`);
`;

// m0010: payments.location — where the payment was physically collected
const m0010 = `
ALTER TABLE \`payments\` ADD COLUMN \`location\` text;
`;

// Fix: note_files needs client_updated_at so soft-deletes sync to cloud
const m0006 = `
ALTER TABLE \`note_files\` ADD COLUMN \`client_updated_at\` text;
`;

// Per-day class schedule: each selected day can have its own start/end time.
// Stored as JSON text: [{"day":"monday","start":"14:00","end":"16:00"},...]
const m0007 = `
ALTER TABLE \`classes\` ADD COLUMN \`class_schedule\` text;
`;

// Local-only sync history log — keeps last 30 save events for the teacher.
// Never synced to cloud; purely for transparency / peace of mind.
const m0008 = `
CREATE TABLE IF NOT EXISTS \`sync_log\` (
  \`id\`                text PRIMARY KEY NOT NULL,
  \`synced_at\`         text NOT NULL,
  \`status\`            text NOT NULL,
  \`error_message\`     text,
  \`classes_pushed\`    integer NOT NULL DEFAULT 0,
  \`students_pushed\`   integer NOT NULL DEFAULT 0,
  \`payments_pushed\`   integer NOT NULL DEFAULT 0,
  \`attendance_pushed\` integer NOT NULL DEFAULT 0,
  \`notes_pushed\`      integer NOT NULL DEFAULT 0,
  \`exams_pushed\`      integer NOT NULL DEFAULT 0,
  \`marks_pushed\`      integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`sync_log_at_idx\` ON \`sync_log\` (\`synced_at\` DESC);
`;

// m0009: Fix student_code unique constraint to be per-teacher (not global).
// Previously: student_code UNIQUE (global) — breaks when two teachers share codes.
// Now:        UNIQUE(teacher_id, student_code) — mirrors Supabase constraint.
// SQLite can't ALTER a UNIQUE constraint, so we rebuild the table.
const m0009 = `
CREATE TABLE \`students_new\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`student_code\` text NOT NULL,
  \`name\` text NOT NULL,
  \`student_phone\` text,
  \`gender\` text,
  \`address\` text,
  \`parent_name\` text,
  \`parent_mobile\` text,
  \`parent_whatsapp\` text,
  \`emergency_contact\` text,
  \`grade\` text,
  \`batch\` text,
  \`subject\` text,
  \`language\` text,
  \`profile_photo_url\` text,
  \`password_plain\` text,
  \`card_version\` integer NOT NULL DEFAULT 1,
  \`is_active\` integer NOT NULL DEFAULT 1,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
INSERT INTO \`students_new\` SELECT * FROM \`students\`;
--> statement-breakpoint
DROP TABLE \`students\`;
--> statement-breakpoint
ALTER TABLE \`students_new\` RENAME TO \`students\`;
--> statement-breakpoint
CREATE UNIQUE INDEX \`students_teacher_code_unique\` ON \`students\` (\`teacher_id\`, \`student_code\`);
`;

// m0011: per-student fee type. 'regular' uses the class fee, 'free' owes
// nothing, 'custom' uses custom_fee_cents (a discount below the class fee).
const m0011 = `
ALTER TABLE \`students\` ADD COLUMN \`fee_type\` text NOT NULL DEFAULT 'regular';
--> statement-breakpoint
ALTER TABLE \`students\` ADD COLUMN \`custom_fee_cents\` integer;
`;

// m0012: money gate — self-joined students start 'pending_payment' until they
// pay once; manually-added students are always 'confirmed'.
const m0012 = `
ALTER TABLE \`students\` ADD COLUMN \`join_status\` text NOT NULL DEFAULT 'confirmed';
`;

// m0013: student_classes — a student can belong to MANY classes, each with its
// own monthly fee. Backfill one enrollment per existing student from their
// current class_id / fee_type / custom_fee_cents so nothing is lost.
const m0013 = `
CREATE TABLE IF NOT EXISTS \`student_classes\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`student_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`fee_type\` text NOT NULL DEFAULT 'regular',
  \`custom_fee_cents\` integer,
  \`is_active\` integer NOT NULL DEFAULT 1,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS \`student_classes_student_class_unique\` ON \`student_classes\` (\`student_id\`, \`class_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`student_classes_class_idx\` ON \`student_classes\` (\`class_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`student_classes_student_idx\` ON \`student_classes\` (\`student_id\`);
--> statement-breakpoint
INSERT OR IGNORE INTO \`student_classes\`
  (\`id\`, \`teacher_id\`, \`student_id\`, \`class_id\`, \`fee_type\`, \`custom_fee_cents\`, \`is_active\`, \`created_at\`, \`updated_at\`, \`client_updated_at\`)
SELECT
  \`id\` || '-' || \`class_id\`,
  \`teacher_id\`, \`id\`, \`class_id\`,
  \`fee_type\`, \`custom_fee_cents\`, \`is_active\`,
  \`created_at\`, \`updated_at\`, \`updated_at\`
FROM \`students\`
WHERE \`deleted_at\` IS NULL AND \`class_id\` IS NOT NULL AND \`class_id\` <> '';
`;

// m0014: question_bank — per-class question pool for the online-exam system.
const m0014 = `
CREATE TABLE IF NOT EXISTS \`question_bank\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`question_type\` text NOT NULL DEFAULT 'mcq',
  \`question_text\` text NOT NULL,
  \`options\` text NOT NULL,
  \`correct_index\` integer NOT NULL DEFAULT 0,
  \`marks\` integer NOT NULL DEFAULT 1,
  \`is_active\` integer NOT NULL DEFAULT 1,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`question_bank_teacher_idx\` ON \`question_bank\` (\`teacher_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`question_bank_class_idx\` ON \`question_bank\` (\`class_id\`);
`;

// m0015: extra_classes (one-off extra sessions) + extra_class_id on attendance
// and payments so those rows stay separate from the regular monthly class.
const m0015 = `
CREATE TABLE IF NOT EXISTS \`extra_classes\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`teacher_id\` text NOT NULL,
  \`class_id\` text NOT NULL,
  \`topic\` text,
  \`date\` text NOT NULL,
  \`start_time\` text,
  \`end_time\` text,
  \`location\` text,
  \`fee_mode\` text NOT NULL DEFAULT 'free',
  \`custom_fee_cents\` integer,
  \`remark\` text,
  \`is_active\` integer NOT NULL DEFAULT 1,
  \`deleted_at\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  \`client_updated_at\` text,
  \`synced_at\` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`extra_classes_teacher_idx\` ON \`extra_classes\` (\`teacher_id\`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`extra_classes_class_idx\` ON \`extra_classes\` (\`class_id\`);
--> statement-breakpoint
ALTER TABLE \`attendance\` ADD COLUMN \`extra_class_id\` text;
--> statement-breakpoint
ALTER TABLE \`payments\` ADD COLUMN \`extra_class_id\` text;
`;

// m0016: image support for question bank — optional question image + per-option
// images (R2 object keys; option_images is a JSON array aligned to options).
const m0016 = `
ALTER TABLE \`question_bank\` ADD COLUMN \`question_image\` text;
--> statement-breakpoint
ALTER TABLE \`question_bank\` ADD COLUMN \`option_images\` text;
`;

const migrationBundle = {
  journal: {
    entries: [
      { idx: 0, when: 1747785600, tag: '0000_v3_baseline', breakpoints: true },
      { idx: 1, when: 1747958400, tag: '0001_notes_u38', breakpoints: true },
      { idx: 2, when: 1748044800, tag: '0002_note_files_synced_at', breakpoints: true },
      { idx: 3, when: 1748131200, tag: '0003_message_templates_u33', breakpoints: true },
      { idx: 4, when: 1748217600, tag: '0004_exams_u40', breakpoints: true },
      { idx: 5, when: 1748304000, tag: '0005_marks_u41', breakpoints: true },
      { idx: 6, when: 1748390400, tag: '0006_note_files_client_updated_at', breakpoints: true },
      { idx: 7, when: 1748476800, tag: '0007_class_schedule_per_day', breakpoints: true },
      { idx: 8, when: 1748563200, tag: '0008_sync_log', breakpoints: true },
      { idx: 9, when: 1748649600, tag: '0009_student_code_per_teacher_unique', breakpoints: true },
      { idx: 10, when: 1748736000, tag: '0010_payments_location', breakpoints: true },
      { idx: 11, when: 1748822400, tag: '0011_student_fee_type', breakpoints: true },
      { idx: 12, when: 1750032000, tag: '0012_student_join_status', breakpoints: true },
      { idx: 13, when: 1750118400, tag: '0013_student_classes', breakpoints: true },
      { idx: 14, when: 1750204800, tag: '0014_question_bank', breakpoints: true },
      { idx: 15, when: 1750291200, tag: '0015_extra_classes', breakpoints: true },
      { idx: 16, when: 1750377600, tag: '0016_question_images', breakpoints: true },
    ],
  },
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
    m0006,
    m0007,
    m0008,
    m0009,
    m0010,
    m0011,
    m0012,
    m0013,
    m0014,
    m0015,
    m0016,
  },
};

export default migrationBundle;
