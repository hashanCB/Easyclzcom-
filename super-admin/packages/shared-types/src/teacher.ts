import { z } from 'zod';
import { BaseEntity, Email, IsoDateTime, PhoneNumber, Url, Uuid } from './common';
import { Gender } from './enums';

export const TeacherProfile = z.object({
  name: z.string().min(1).max(120),
  education_qualification: z.string().max(200).nullable().default(null),
  phone: PhoneNumber,
  email: Email.nullable().default(null),
  address: z.string().max(500).nullable().default(null),
  gender: Gender,
  profile_photo_url: Url.nullable().default(null),
});
export type TeacherProfile = z.infer<typeof TeacherProfile>;

export const Teacher = BaseEntity.merge(TeacherProfile).extend({
  username: z.string().min(3).max(50),
  is_active: z.boolean().default(true),
  is_profile_complete: z.boolean().default(false),
  last_login_at: IsoDateTime.nullable().default(null),
});
export type Teacher = z.infer<typeof Teacher>;

export const TeacherCreateInput = TeacherProfile.partial({
  education_qualification: true,
  email: true,
  address: true,
  profile_photo_url: true,
}).extend({
  username: z.string().min(3).max(50),
});
export type TeacherCreateInput = z.infer<typeof TeacherCreateInput>;

export const TeacherUpdateInput = TeacherProfile.partial();
export type TeacherUpdateInput = z.infer<typeof TeacherUpdateInput>;

export const TeacherToken = z.object({
  id: Uuid,
  teacher_id: Uuid,
  token_hash: z.string(),
  bound_device_id: z.string().nullable().default(null),
  bound_at: IsoDateTime.nullable().default(null),
  created_at: IsoDateTime,
});
export type TeacherToken = z.infer<typeof TeacherToken>;

export const TeacherSession = z.object({
  id: Uuid,
  teacher_id: Uuid,
  device_id: z.string(),
  device_info: z.record(z.string()).nullable().default(null),
  is_active: z.boolean(),
  last_seen_at: IsoDateTime,
  created_at: IsoDateTime,
});
export type TeacherSession = z.infer<typeof TeacherSession>;

export const DuplicateTokenAttempt = z.object({
  id: Uuid,
  teacher_id: Uuid,
  attempted_device_id: z.string(),
  attempted_device_info: z.record(z.string()).nullable().default(null),
  attempted_at: IsoDateTime,
});
export type DuplicateTokenAttempt = z.infer<typeof DuplicateTokenAttempt>;

export const ChangePasswordInput = z
  .object({
    current_password: z.string().min(8),
    new_password: z.string().min(8).max(100),
    confirm_password: z.string().min(8).max(100),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'New password and confirmation must match',
    path: ['confirm_password'],
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;
