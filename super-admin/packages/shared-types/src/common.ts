import { z } from 'zod';

export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ULID');
export type Ulid = z.infer<typeof Ulid>;

export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid ISO date YYYY-MM-DD');
export type IsoDate = z.infer<typeof IsoDate>;

export const MonthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Invalid month key YYYY-MM');
export type MonthKey = z.infer<typeof MonthKey>;

export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid HH:mm');
export type TimeOfDay = z.infer<typeof TimeOfDay>;

export const MoneyCents = z.number().int().nonnegative();
export type MoneyCents = z.infer<typeof MoneyCents>;

export const PhoneNumber = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9\-\s()]+$/, 'Invalid phone number');
export type PhoneNumber = z.infer<typeof PhoneNumber>;

export const Email = z.string().email();
export type Email = z.infer<typeof Email>;

export const Url = z.string().url();
export type Url = z.infer<typeof Url>;

export const TenantFields = z.object({
  teacher_id: Uuid,
});

export const TimestampFields = z.object({
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable().default(null),
});

export const SyncFields = z.object({
  client_updated_at: IsoDateTime,
  synced_at: IsoDateTime.nullable().default(null),
});

export const BaseEntity = z
  .object({ id: Uuid })
  .merge(TimestampFields)
  .merge(SyncFields);
export type BaseEntity = z.infer<typeof BaseEntity>;

export const TenantEntity = BaseEntity.merge(TenantFields);
export type TenantEntity = z.infer<typeof TenantEntity>;
