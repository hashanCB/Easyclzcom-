import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

// Per-class question bank for the online-exam system. A teacher builds a pool of
// questions once and reuses them across many published exams. Questions are
// teacher-only (students never see the bank — only the questions snapshotted
// into a published exam, and never the correct answer).
export const questionBank = sqliteTable('question_bank', {
  id:              text('id').primaryKey(),
  teacherId:       text('teacher_id').notNull(),
  classId:         text('class_id').notNull(),
  // 'mcq' = single-correct multiple choice; 'true_false' = True/False.
  questionType:    text('question_type').notNull().default('mcq'),
  questionText:    text('question_text').notNull(),
  // JSON array of option strings, e.g. ["4","5","6","7"] or ["True","False"].
  options:         text('options').notNull(),
  // Index into `options` of the correct answer (0-based).
  correctIndex:    integer('correct_index').notNull().default(0),
  marks:           integer('marks').notNull().default(1),
  // Optional R2 object key for an image shown with the question.
  questionImage:   text('question_image'),
  // Optional JSON array of R2 keys aligned to `options` (image per option).
  optionImages:    text('option_images'),
  isActive:        integer('is_active', { mode: 'boolean' }).notNull().default(true),
  deletedAt:       text('deleted_at'),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
  clientUpdatedAt: text('client_updated_at'),
  syncedAt:        text('synced_at'),
}, (t) => ({
  teacherIdx: index('question_bank_teacher_idx').on(t.teacherId),
  classIdx:   index('question_bank_class_idx').on(t.classId),
}));

export type QuestionBankItem = typeof questionBank.$inferSelect;
export type NewQuestionBankItem = typeof questionBank.$inferInsert;
