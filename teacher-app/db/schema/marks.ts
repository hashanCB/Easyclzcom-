import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const marks = sqliteTable(
  'marks',
  {
    id: text('id').primaryKey().notNull(),
    teacherId: text('teacher_id').notNull(),
    examId: text('exam_id').notNull(),
    studentId: text('student_id').notNull(),
    mark: real('mark').notNull(),
    remark: text('remark'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    clientUpdatedAt: text('client_updated_at'),
    syncedAt: text('synced_at'),
  },
  (t) => ({
    examIdx: index('marks_exam_idx').on(t.examId),
    studentIdx: index('marks_student_idx').on(t.studentId),
  }),
);

export type Mark = typeof marks.$inferSelect;
export type NewMark = typeof marks.$inferInsert;
