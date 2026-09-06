import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const paymentCorrections = sqliteTable('payment_corrections', {
  id:          text('id').primaryKey(),
  teacherId:   text('teacher_id').notNull(),
  paymentId:   text('payment_id').notNull(),
  type:        text('type').notNull(),        // 'correction' | 'refund'
  amountCents: integer('amount_cents').notNull(), // signed: negative = refund
  remark:      text('remark'),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
  syncedAt:    text('synced_at'),
});

export type PaymentCorrection = typeof paymentCorrections.$inferSelect;
export type NewPaymentCorrection = typeof paymentCorrections.$inferInsert;
