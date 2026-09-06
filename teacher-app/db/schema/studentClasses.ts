import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// A student can be enrolled in many classes (e.g. a Theory class and a
// Revision class). Each enrollment carries its OWN monthly fee so the teacher
// can charge a different amount per class. This is the many-to-many link
// between `students` and `classes`.
//
// `students.class_id` is kept as the student's PRIMARY class (the first one
// selected) so older screens that still read a single class keep working.
export const studentClasses = sqliteTable('student_classes', {
  id:              text('id').primaryKey(),
  teacherId:       text('teacher_id').notNull(),
  studentId:       text('student_id').notNull(),
  classId:         text('class_id').notNull(),
  // Per-class fee, mirrors the per-student fee model:
  // 'regular' uses the class fee, 'free' owes nothing, 'custom' uses customFeeCents.
  feeType:         text('fee_type').notNull().default('regular'),
  customFeeCents:  integer('custom_fee_cents'),
  isActive:        integer('is_active', { mode: 'boolean' }).notNull().default(true),
  deletedAt:       text('deleted_at'),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
  clientUpdatedAt: text('client_updated_at'),
  syncedAt:        text('synced_at'),
}, (t) => ({
  studentClassUniq: uniqueIndex('student_classes_student_class_unique').on(t.studentId, t.classId),
  classIdx:         index('student_classes_class_idx').on(t.classId),
  studentIdx:       index('student_classes_student_idx').on(t.studentId),
}));

export type StudentClass = typeof studentClasses.$inferSelect;
export type NewStudentClass = typeof studentClasses.$inferInsert;
