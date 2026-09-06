import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const messageTemplates = sqliteTable(
  'message_templates',
  {
    id: text('id').primaryKey().notNull(),
    teacherId: text('teacher_id').notNull(),
    type: text('type').notNull(), // payment_reminder | attendance_absent | attendance_summary | class_cancel | exam_result | note_uploaded | custom
    language: text('language').notNull().default('english'),
    body: text('body').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    clientUpdatedAt: text('client_updated_at'),
    syncedAt: text('synced_at'),
  },
  (t) => ({
    teacherIdx: index('msg_templates_teacher_idx').on(t.teacherId),
  }),
);

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;
