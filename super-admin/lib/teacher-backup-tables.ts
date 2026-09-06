// Tables that make up a single teacher's dataset, in parent → child order so a
// restore satisfies foreign keys (e.g. a student needs its teacher + class
// first; a mark needs its exam + student). Every entry except `teachers` is
// filtered by its `teacher_id` column; `teachers` is keyed by `id`.
//
// Session/token/security/platform tables (teacher_sessions, teacher_tokens,
// duplicate_token_attempts, user_roles, audit_logs, analytics_events,
// system_alerts, app_settings) are intentionally excluded — they regenerate and
// are not part of a teacher's own data.
export const TEACHER_BACKUP_TABLES = [
  { table: 'teachers', key: 'id' },
  { table: 'classes', key: 'teacher_id' },
  { table: 'students', key: 'teacher_id' },
  { table: 'student_credentials', key: 'teacher_id' },
  { table: 'exams', key: 'teacher_id' },
  { table: 'attendance', key: 'teacher_id' },
  { table: 'marks', key: 'teacher_id' },
  { table: 'payments', key: 'teacher_id' },
  { table: 'payment_corrections', key: 'teacher_id' },
  { table: 'message_templates', key: 'teacher_id' },
  { table: 'messages', key: 'teacher_id' },
  { table: 'notes', key: 'teacher_id' },
  { table: 'note_files', key: 'teacher_id' },
  { table: 'chat_threads', key: 'teacher_id' },
  { table: 'chat_messages', key: 'teacher_id' },
  { table: 'assistants', key: 'teacher_id' },
  { table: 'assistant_class_permissions', key: 'teacher_id' },
  { table: 'subscriptions', key: 'teacher_id' },
  { table: 'subscription_events', key: 'teacher_id' },
  { table: 'sync_state', key: 'teacher_id' },
] as const;
