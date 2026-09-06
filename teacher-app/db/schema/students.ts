import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const students = sqliteTable('students', {
  id:                text('id').primaryKey(),
  teacherId:         text('teacher_id').notNull(),
  classId:           text('class_id').notNull(),
  studentCode:       text('student_code').notNull(),
  name:              text('name').notNull(),
  studentPhone:      text('student_phone'),
  gender:            text('gender'),
  address:           text('address'),
  // SRS §8.1 additions
  parentName:        text('parent_name'),
  parentMobile:      text('parent_mobile'),
  parentWhatsapp:    text('parent_whatsapp'),
  emergencyContact:  text('emergency_contact'),
  grade:             text('grade'),
  batch:             text('batch'),
  subject:           text('subject'),
  language:          text('language'),
  profilePhotoUrl:   text('profile_photo_url'),
  // Per-student fee: 'regular' uses the class fee, 'free' owes nothing,
  // 'custom' uses customFeeCents (a discount below the class fee).
  feeType:           text('fee_type').notNull().default('regular'),
  customFeeCents:    integer('custom_fee_cents'),
  // Money gate: self-joined students start 'pending_payment' until they pay
  // once; manually-added students are always 'confirmed'.
  joinStatus:        text('join_status').notNull().default('confirmed'),
  // SRS §8.2 generated credentials (kept locally until cloud sync hashes them)
  passwordPlain:     text('password_plain'),
  cardVersion:       integer('card_version').notNull().default(1),
  // status
  isActive:          integer('is_active', { mode: 'boolean' }).notNull().default(true),
  deletedAt:         text('deleted_at'),
  createdAt:         text('created_at').notNull(),
  updatedAt:         text('updated_at').notNull(),
  clientUpdatedAt:   text('client_updated_at'),
  syncedAt:          text('synced_at'),
}, (t) => ({
  // Mirrors Supabase: unique per teacher, not globally — two teachers can
  // both have STU-001 in their own class without conflicting locally.
  teacherCodeUniq: uniqueIndex('students_teacher_code_unique').on(t.teacherId, t.studentCode),
}));

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
