import { z } from 'zod';
import { IsoDateTime, MoneyCents, MonthKey, TenantEntity, Uuid } from './common';
import { PaymentMethod, PaymentStatus } from './enums';

export const PaymentFields = z.object({
  student_id: Uuid,
  class_id: Uuid,
  month: MonthKey,
  amount_cents: MoneyCents,
  status: PaymentStatus,
  method: PaymentMethod.default('cash'),
  location: z.string().max(200).nullable().default(null),
  remark: z.string().max(500).nullable().default(null),
  collected_by_user_id: Uuid,
  collected_by_role: z.enum(['teacher', 'assistant']),
  collected_at: IsoDateTime,
});

export const PaymentEntity = TenantEntity.merge(PaymentFields);
export type PaymentEntity = z.infer<typeof PaymentEntity>;

export const PaymentCreateInput = PaymentFields.omit({
  collected_at: true,
}).extend({
  collected_at: IsoDateTime.optional(),
});
export type PaymentCreateInput = z.infer<typeof PaymentCreateInput>;

export const PaymentCorrectionFields = z.object({
  original_payment_id: Uuid,
  student_id: Uuid,
  class_id: Uuid,
  month: MonthKey,
  original_amount_cents: MoneyCents,
  corrected_amount_cents: MoneyCents,
  difference_amount_cents: z.number().int(),
  reason: z.string().min(1).max(500),
  done_by_user_id: Uuid,
  done_by_role: z.enum(['teacher', 'assistant']),
  done_at: IsoDateTime,
});

export const PaymentCorrectionEntity = TenantEntity.merge(PaymentCorrectionFields);
export type PaymentCorrectionEntity = z.infer<typeof PaymentCorrectionEntity>;

export const PaymentCorrectionInput = PaymentCorrectionFields.omit({
  difference_amount_cents: true,
  done_at: true,
});
export type PaymentCorrectionInput = z.infer<typeof PaymentCorrectionInput>;

export const PaymentSearchFilter = z.object({
  student_id: Uuid.optional(),
  student_query: z.string().optional(),
  class_id: Uuid.optional(),
  grade: z.string().optional(),
  batch: z.string().optional(),
  subject: z.string().optional(),
  language: z.string().optional(),
  month: MonthKey.optional(),
  status: PaymentStatus.optional(),
  date_from: IsoDateTime.optional(),
  date_to: IsoDateTime.optional(),
});
export type PaymentSearchFilter = z.infer<typeof PaymentSearchFilter>;
