import { z } from 'zod';
import { IsoDateTime, MoneyCents, TenantEntity, Uuid } from './common';
import { PlanStatus } from './enums';

export const SubscriptionFields = z.object({
  stripe_customer_id: z.string().max(100).nullable().default(null),
  stripe_subscription_id: z.string().max(100).nullable().default(null),
  status: PlanStatus.default('inactive'),
  plan_code: z.string().max(50).default('pro_monthly'),
  current_period_start: IsoDateTime.nullable().default(null),
  current_period_end: IsoDateTime.nullable().default(null),
  cancelled_at: IsoDateTime.nullable().default(null),
  cancel_at_period_end: z.boolean().default(false),
});

export const SubscriptionEntity = TenantEntity.merge(SubscriptionFields);
export type SubscriptionEntity = z.infer<typeof SubscriptionEntity>;

export const SubscriptionEventFields = z.object({
  subscription_id: Uuid,
  stripe_event_id: z.string().max(100),
  event_type: z.string().max(100),
  amount_cents: MoneyCents.nullable().default(null),
  payload: z.record(z.unknown()),
  occurred_at: IsoDateTime,
});

export const SubscriptionEventEntity = TenantEntity.merge(SubscriptionEventFields);
export type SubscriptionEventEntity = z.infer<typeof SubscriptionEventEntity>;

export const ProFeatureFlags = z.object({
  cloud_sync: z.boolean(),
  student_portal: z.boolean(),
  note_library: z.boolean(),
  chat: z.boolean(),
  assistant_accounts: z.boolean(),
  qr_nfc: z.boolean(),
  sms_messaging: z.boolean(),
  push_notifications: z.boolean(),
});
export type ProFeatureFlags = z.infer<typeof ProFeatureFlags>;
