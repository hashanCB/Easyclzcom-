import { z } from 'zod';

export const UserRole = z.enum(['super_admin', 'teacher', 'assistant', 'student']);
export type UserRole = z.infer<typeof UserRole>;

export const Language = z.enum(['sinhala', 'english', 'tamil', 'other']);
export type Language = z.infer<typeof Language>;

export const Gender = z.enum(['male', 'female', 'other', 'prefer_not_to_say']);
export type Gender = z.infer<typeof Gender>;

export const ClassType = z.enum(['al', 'ol', 'other']);
export type ClassType = z.infer<typeof ClassType>;

export const PaymentStatus = z.enum([
  'paid',
  'unpaid',
  'partial',
  'advance',
  'free',
  'refunded',
  'corrected',
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PaymentMethod = z.enum(['cash', 'bank_transfer', 'card', 'mobile', 'other']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const AttendanceStatus = z.enum(['present', 'absent', 'late']);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const AttendanceMarkSource = z.enum(['manual', 'qr', 'nfc']);
export type AttendanceMarkSource = z.infer<typeof AttendanceMarkSource>;

export const AssistantPermission = z.enum(['attendance', 'payment', 'both']);
export type AssistantPermission = z.infer<typeof AssistantPermission>;

export const PlanStatus = z.enum([
  'inactive',
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'incomplete',
]);
export type PlanStatus = z.infer<typeof PlanStatus>;

export const MessageType = z.enum([
  'payment_reminder',
  'attendance_absent',
  'attendance_summary',
  'class_cancel',
  'exam_result',
  'note_uploaded',
  'custom',
]);
export type MessageType = z.infer<typeof MessageType>;

export const MessageChannel = z.enum(['sms', 'whatsapp', 'push', 'in_app']);
export type MessageChannel = z.infer<typeof MessageChannel>;

export const MessageStatus = z.enum(['queued', 'sent', 'delivered', 'failed', 'cancelled']);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const NoteFileKind = z.enum(['pdf', 'image', 'document', 'link', 'other']);
export type NoteFileKind = z.infer<typeof NoteFileKind>;

export const AuditAction = z.enum([
  'teacher.create',
  'teacher.activate',
  'teacher.login',
  'teacher.password_change',
  'teacher.deactivate',
  'payment.collect',
  'payment.correct',
  'payment.refund',
  'attendance.mark',
  'attendance.update',
  'student.create',
  'student.update',
  'student.deactivate',
  'class.create',
  'class.update',
  'class.deactivate',
  'assistant.login',
  'assistant.create',
  'assistant.password_reset',
  'backup.create',
  'backup.restore',
  'subscription.activate',
  'subscription.cancel',
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const ClassDay = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export type ClassDay = z.infer<typeof ClassDay>;
