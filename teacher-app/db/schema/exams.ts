import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const exams = sqliteTable(
  'exams',
  {
    id: text('id').primaryKey().notNull(),
    teacherId: text('teacher_id').notNull(),
    classId: text('class_id').notNull(),
    title: text('title').notNull(),
    grade: text('grade').notNull(),
    batch: text('batch').notNull(),
    subject: text('subject').notNull(),
    language: text('language').notNull(),
    examDate: text('exam_date').notNull(), // ISO date YYYY-MM-DD
    totalMarks: integer('total_marks').notNull(),
    remark: text('remark'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    clientUpdatedAt: text('client_updated_at'),
    syncedAt: text('synced_at'),
  },
  (t) => ({
    teacherIdx: index('exams_teacher_idx').on(t.teacherId),
    classIdx: index('exams_class_idx').on(t.classId),
  }),
);

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
