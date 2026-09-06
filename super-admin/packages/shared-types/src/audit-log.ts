import { z } from 'zod';
import { IsoDateTime, TenantEntity, Uuid } from './common';
import { AuditAction, UserRole } from './enums';

export const AuditLogFields = z.object({
  user_id: Uuid,
  user_role: UserRole,
  action: AuditAction,
  entity_type: z.string().max(50),
  entity_id: Uuid.nullable().default(null),
  old_value: z.record(z.unknown()).nullable().default(null),
  new_value: z.record(z.unknown()).nullable().default(null),
  device_id: z.string().nullable().default(null),
  device_info: z.record(z.string()).nullable().default(null),
  occurred_at: IsoDateTime,
});

export const AuditLogEntity = TenantEntity.merge(AuditLogFields);
export type AuditLogEntity = z.infer<typeof AuditLogEntity>;

export const AuditLogCreateInput = AuditLogFields.omit({ occurred_at: true }).extend({
  occurred_at: IsoDateTime.optional(),
});
export type AuditLogCreateInput = z.infer<typeof AuditLogCreateInput>;
