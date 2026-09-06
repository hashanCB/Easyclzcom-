import { z } from 'zod';
import { PhoneNumber, TenantEntity, Url, Uuid } from './common';
import { Gender, Language } from './enums';

export const StudentFields = z.object({
  student_code: z.string().min(1).max(50),
  name: z.string().min(1).max(120),
  gender: Gender,
  address: z.string().max(500).nullable().default(null),
  student_phone: PhoneNumber.nullable().default(null),
  parent_name: z.string().max(120).nullable().default(null),
  parent_mobile: PhoneNumber.nullable().default(null),
  parent_whatsapp: PhoneNumber.nullable().default(null),
  emergency_contact: PhoneNumber.nullable().default(null),

  class_id: Uuid,
  grade: z.string().min(1).max(50),
  batch: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  language: Language,

  profile_photo_url: Url.nullable().default(null),
  is_active: z.boolean().default(true),

  card_version: z.number().int().nonnegative().default(1),
});

export const StudentEntity = TenantEntity.merge(StudentFields);
export type StudentEntity = z.infer<typeof StudentEntity>;

export const StudentCreateInput = StudentFields.omit({
  student_code: true,
  card_version: true,
});
export type StudentCreateInput = z.infer<typeof StudentCreateInput>;

export const StudentUpdateInput = StudentFields.partial();
export type StudentUpdateInput = z.infer<typeof StudentUpdateInput>;

export const StudentCredential = z.object({
  id: Uuid,
  teacher_id: Uuid,
  student_id: Uuid,
  password_hash: z.string(),
  password_changed_at: z.string().datetime({ offset: true }).nullable().default(null),
  failed_attempts: z.number().int().nonnegative().default(0),
  locked_until: z.string().datetime({ offset: true }).nullable().default(null),
});
export type StudentCredential = z.infer<typeof StudentCredential>;

export const StudentLoginInput = z.object({
  student_code: z.string().min(1),
  password: z.string().regex(/^\d{6}$/, 'Password must be 6 digits'),
});
export type StudentLoginInput = z.infer<typeof StudentLoginInput>;

export const StudentSearchFilter = z.object({
  class_id: Uuid.optional(),
  grade: z.string().optional(),
  batch: z.string().optional(),
  subject: z.string().optional(),
  language: Language.optional(),
  is_active: z.boolean().optional(),
  query: z.string().optional(),
});
export type StudentSearchFilter = z.infer<typeof StudentSearchFilter>;
