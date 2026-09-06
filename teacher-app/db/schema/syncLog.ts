import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const syncLog = sqliteTable('sync_log', {
  id:                text('id').primaryKey(),
  syncedAt:          text('synced_at').notNull(),          // ISO timestamp
  status:            text('status').notNull(),              // 'success' | 'error'
  errorMessage:      text('error_message'),                 // null on success
  classesPushed:     integer('classes_pushed').notNull().default(0),
  studentsPushed:    integer('students_pushed').notNull().default(0),
  paymentsPushed:    integer('payments_pushed').notNull().default(0),
  attendancePushed:  integer('attendance_pushed').notNull().default(0),
  notesPushed:       integer('notes_pushed').notNull().default(0),
  examsPushed:       integer('exams_pushed').notNull().default(0),
  marksPushed:       integer('marks_pushed').notNull().default(0),
});

export type SyncLogEntry    = typeof syncLog.$inferSelect;
export type NewSyncLogEntry = typeof syncLog.$inferInsert;
