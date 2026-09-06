import { z } from 'zod';
import { MoneyCents, TenantEntity, TimeOfDay, Url } from './common';
import { ClassDay, ClassType, Language } from './enums';

export const ClassFields = z.object({
  class_type: ClassType,
  custom_class_type: z.string().max(100).nullable().default(null),
  grade: z.string().min(1).max(50),
  batch: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  language: Language,
  monthly_fee_cents: MoneyCents,
  location: z.string().max(200).nullable().default(null),
  remark: z.string().max(500).nullable().default(null),
  image_url: Url.nullable().default(null),
  is_active: z.boolean().default(true),

  payment_reminder_day_of_month: z.number().int().min(1).max(28).nullable().default(null),
  payment_reminder_time: TimeOfDay.nullable().default(null),
  payment_reminder_active: z.boolean().default(true),

  class_day: ClassDay,
  class_start_time: TimeOfDay,
  class_end_time: TimeOfDay,
  qr_grace_minutes_before: z.number().int().nonnegative().default(30),
  qr_grace_minutes_after: z.number().int().nonnegative().default(30),
});

export const ClassEntity = TenantEntity.merge(ClassFields);
export type ClassEntity = z.infer<typeof ClassEntity>;

export const ClassCreateInput = ClassFields;
export type ClassCreateInput = z.infer<typeof ClassCreateInput>;

export const ClassUpdateInput = ClassFields.partial();
export type ClassUpdateInput = z.infer<typeof ClassUpdateInput>;

export const ClassSearchFilter = z.object({
  class_type: ClassType.optional(),
  grade: z.string().optional(),
  subject: z.string().optional(),
  batch: z.string().optional(),
  language: Language.optional(),
  is_active: z.boolean().optional(),
  query: z.string().optional(),
});
export type ClassSearchFilter = z.infer<typeof ClassSearchFilter>;
