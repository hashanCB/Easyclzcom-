import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

// A one-off extra session on top of the normal weekly class. Free or paid; for a
// paid extra class only the students who attend owe the fee, payable any time.
export const extraClasses = sqliteTable('extra_classes', {
  id:              text('id').primaryKey(),
  teacherId:       text('teacher_id').notNull(),
  classId:         text('class_id').notNull(),
  topic:           text('topic'),
  date:            text('date').notNull(),          // YYYY-MM-DD
  startTime:       text('start_time'),              // HH:MM
  endTime:         text('end_time'),                // HH:MM
  location:        text('location'),
  // 'free' = no charge; 'monthly' = each present student's own monthly fee;
  // 'custom' = a special amount (customFeeCents) for everyone present.
  feeMode:         text('fee_mode').notNull().default('free'),
  customFeeCents:  integer('custom_fee_cents'),
  remark:          text('remark'),
  isActive:        integer('is_active', { mode: 'boolean' }).notNull().default(true),
  deletedAt:       text('deleted_at'),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
  clientUpdatedAt: text('client_updated_at'),
  syncedAt:        text('synced_at'),
}, (t) => ({
  teacherIdx: index('extra_classes_teacher_idx').on(t.teacherId),
  classIdx:   index('extra_classes_class_idx').on(t.classId),
}));

export type ExtraClass = typeof extraClasses.$inferSelect;
export type NewExtraClass = typeof extraClasses.$inferInsert;
