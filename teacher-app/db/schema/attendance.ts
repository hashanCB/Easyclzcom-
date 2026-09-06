import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const attendance = sqliteTable('attendance', {
  id:               text('id').primaryKey(),
  teacherId:        text('teacher_id').notNull(),
  studentId:        text('student_id').notNull(),
  classId:          text('class_id').notNull(),
  date:             text('date').notNull(),                  // YYYY-MM-DD
  // Set when this mark is for a one-off extra session; null = normal class.
  extraClassId:     text('extra_class_id'),
  status:           text('status').notNull(),                // 'present'|'absent'|'late'
  smsIntent:        integer('sms_intent', { mode: 'boolean' }).notNull().default(false),
  smsSentAt:        text('sms_sent_at'),
  markedByUserId:   text('marked_by_user_id').notNull(),
  markedByRole:     text('marked_by_role').notNull(),        // 'teacher'|'assistant'
  deletedAt:        text('deleted_at'),
  createdAt:        text('created_at').notNull(),
  updatedAt:        text('updated_at').notNull(),
  clientUpdatedAt:  text('client_updated_at'),
  syncedAt:         text('synced_at'),
});

export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
