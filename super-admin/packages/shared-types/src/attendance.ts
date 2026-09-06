import { z } from 'zod';
import { IsoDate, IsoDateTime, MonthKey, TenantEntity, Uuid } from './common';
import { AttendanceMarkSource, AttendanceStatus } from './enums';

export const AttendanceFields = z.object({
  student_id: Uuid,
  class_id: Uuid,
  date: IsoDate,
  status: AttendanceStatus,
  marked_by_user_id: Uuid,
  marked_by_role: z.enum(['teacher', 'assistant']),
  marked_via: AttendanceMarkSource.default('manual'),
  marked_at: IsoDateTime,
  sms_intent: z.boolean().default(false),
  sms_sent_at: IsoDateTime.nullable().default(null),
});

export const AttendanceEntity = TenantEntity.merge(AttendanceFields);
export type AttendanceEntity = z.infer<typeof AttendanceEntity>;

export const AttendanceCreateInput = AttendanceFields.omit({ marked_at: true }).extend({
  marked_at: IsoDateTime.optional(),
});
export type AttendanceCreateInput = z.infer<typeof AttendanceCreateInput>;

export const AttendanceBulkInput = z.object({
  class_id: Uuid,
  date: IsoDate,
  marked_by_user_id: Uuid,
  marked_by_role: z.enum(['teacher', 'assistant']),
  send_sms: z.boolean().default(false),
  records: z
    .array(
      z.object({
        student_id: Uuid,
        status: AttendanceStatus,
      })
    )
    .min(1),
});
export type AttendanceBulkInput = z.infer<typeof AttendanceBulkInput>;

export const AttendanceSearchFilter = z.object({
  class_id: Uuid.optional(),
  student_id: Uuid.optional(),
  grade: z.string().optional(),
  batch: z.string().optional(),
  subject: z.string().optional(),
  language: z.string().optional(),
  month: MonthKey.optional(),
  date_from: IsoDate.optional(),
  date_to: IsoDate.optional(),
  status: AttendanceStatus.optional(),
  min_absent_count: z.number().int().nonnegative().optional(),
});
export type AttendanceSearchFilter = z.infer<typeof AttendanceSearchFilter>;
