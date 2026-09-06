import { z } from 'zod';
import { IsoDateTime, PhoneNumber, TenantEntity, Uuid } from './common';
import { AssistantPermission } from './enums';

export const AssistantFields = z.object({
  name: z.string().min(1).max(120),
  phone: PhoneNumber,
  username: z.string().min(3).max(50),
  is_active: z.boolean().default(true),
  last_login_at: IsoDateTime.nullable().default(null),
});

export const AssistantEntity = TenantEntity.merge(AssistantFields);
export type AssistantEntity = z.infer<typeof AssistantEntity>;

export const AssistantCreateInput = AssistantFields.omit({
  is_active: true,
  last_login_at: true,
});
export type AssistantCreateInput = z.infer<typeof AssistantCreateInput>;

export const AssistantUpdateInput = AssistantFields.partial();
export type AssistantUpdateInput = z.infer<typeof AssistantUpdateInput>;

export const AssistantLoginInput = z.object({
  username: z.string().min(3),
  password: z.string().regex(/^\d{8}$/, 'Password must be 8 digits'),
});
export type AssistantLoginInput = z.infer<typeof AssistantLoginInput>;

export const AssistantClassPermission = TenantEntity.extend({
  assistant_id: Uuid,
  class_id: Uuid,
  permission: AssistantPermission,
});
export type AssistantClassPermission = z.infer<typeof AssistantClassPermission>;

export const AssistantSessionSummary = z.object({
  assistant_id: Uuid,
  class_id: Uuid,
  date: z.string(),
  attendance_count: z.number().int().nonnegative(),
  payment_count: z.number().int().nonnegative(),
  total_collected_cents: z.number().int().nonnegative(),
  pending_sync_count: z.number().int().nonnegative(),
  submitted_at: IsoDateTime.nullable().default(null),
});
export type AssistantSessionSummary = z.infer<typeof AssistantSessionSummary>;
