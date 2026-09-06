import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const classes = sqliteTable('classes', {
  id:                   text('id').primaryKey(),
  teacherId:            text('teacher_id').notNull(),
  classType:            text('class_type').notNull(),         // 'al'|'ol'|'other'
  customClassType:      text('custom_class_type'),
  grade:                text('grade').notNull(),
  batch:                text('batch').notNull(),
  subject:              text('subject').notNull(),
  language:             text('language').notNull(),
  monthlyFeeCents:      integer('monthly_fee_cents').notNull(),
  location:             text('location'),
  remark:               text('remark'),
  imageUrl:             text('image_url'),
  isActive:             integer('is_active', { mode: 'boolean' }).notNull().default(true),
  classDay:             text('class_day').notNull(),
  classSchedule:        text('class_schedule'),               // JSON: [{day,start,end},...]
  classStartTime:       text('class_start_time').notNull(),   // HH:MM (derived from first day)
  classEndTime:         text('class_end_time').notNull(),     // HH:MM (derived from first day)
  qrGraceMinutesBefore: integer('qr_grace_minutes_before').notNull().default(30),
  paymentReminderDayOfMonth: integer('payment_reminder_day_of_month'),
  paymentReminderTime:  text('payment_reminder_time'),
  paymentReminderActive: integer('payment_reminder_active', { mode: 'boolean' }).notNull().default(true),
  deletedAt:            text('deleted_at'),
  createdAt:            text('created_at').notNull(),
  updatedAt:            text('updated_at').notNull(),
  clientUpdatedAt:      text('client_updated_at'),
  syncedAt:             text('synced_at'),
});

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
