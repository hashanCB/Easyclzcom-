import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const payments = sqliteTable('payments', {
  id:                  text('id').primaryKey(),
  teacherId:           text('teacher_id').notNull(),
  studentId:           text('student_id').notNull(),
  classId:             text('class_id').notNull(),
  month:               text('month').notNull(),              // YYYY-MM
  // Set when this payment is for a one-off extra class; null = normal monthly fee.
  extraClassId:        text('extra_class_id'),
  amountCents:         integer('amount_cents').notNull(),
  status:              text('status').notNull(),             // 'paid'|'free'|'partial'|'refunded'
  method:              text('method').notNull().default('cash'),
  location:            text('location'),                        // where payment was collected
  remark:              text('remark'),
  collectedByUserId:   text('collected_by_user_id').notNull(),
  collectedByRole:     text('collected_by_role').notNull(),  // 'teacher'|'assistant'
  collectedAt:         text('collected_at').notNull(),
  deletedAt:           text('deleted_at'),
  createdAt:           text('created_at').notNull(),
  updatedAt:           text('updated_at').notNull(),
  clientUpdatedAt:     text('client_updated_at'),
  syncedAt:            text('synced_at'),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
