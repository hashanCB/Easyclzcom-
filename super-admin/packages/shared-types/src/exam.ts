import { z } from 'zod';
import { IsoDate, TenantEntity, Uuid } from './common';
import { Language } from './enums';

export const ExamFields = z.object({
  title: z.string().min(1).max(200),
  class_id: Uuid,
  grade: z.string().min(1).max(50),
  batch: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  language: Language,
  exam_date: IsoDate,
  total_marks: z.number().int().positive(),
  remark: z.string().max(500).nullable().default(null),
});

export const ExamEntity = TenantEntity.merge(ExamFields);
export type ExamEntity = z.infer<typeof ExamEntity>;

export const ExamCreateInput = ExamFields;
export type ExamCreateInput = z.infer<typeof ExamCreateInput>;

export const ExamUpdateInput = ExamFields.partial();
export type ExamUpdateInput = z.infer<typeof ExamUpdateInput>;

export const MarkFields = z.object({
  exam_id: Uuid,
  student_id: Uuid,
  mark: z.number().nonnegative(),
  remark: z.string().max(500).nullable().default(null),
});

export const MarkEntity = TenantEntity.merge(MarkFields);
export type MarkEntity = z.infer<typeof MarkEntity>;

export const MarkCreateInput = MarkFields;
export type MarkCreateInput = z.infer<typeof MarkCreateInput>;

export const MarkBulkInput = z.object({
  exam_id: Uuid,
  records: z
    .array(
      z.object({
        student_id: Uuid,
        mark: z.number().nonnegative(),
        remark: z.string().max(500).nullable().default(null),
      })
    )
    .min(1),
});
export type MarkBulkInput = z.infer<typeof MarkBulkInput>;
