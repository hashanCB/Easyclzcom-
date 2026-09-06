import { z } from 'zod';
import { IsoDateTime, TenantEntity, Uuid } from './common';

export const SyncOperation = z.enum(['insert', 'update', 'delete']);
export type SyncOperation = z.infer<typeof SyncOperation>;

export const SyncQueueItem = z.object({
  id: Uuid,
  table_name: z.string().max(50),
  row_id: Uuid,
  operation: SyncOperation,
  payload: z.record(z.unknown()),
  idempotency_key: z.string().max(100),
  attempts: z.number().int().nonnegative().default(0),
  last_error: z.string().max(1000).nullable().default(null),
  created_at: IsoDateTime,
  next_attempt_at: IsoDateTime.nullable().default(null),
});
export type SyncQueueItem = z.infer<typeof SyncQueueItem>;

export const SyncStateEntity = TenantEntity.extend({
  table_name: z.string().max(50),
  last_pulled_at: IsoDateTime.nullable().default(null),
  last_pushed_at: IsoDateTime.nullable().default(null),
  last_cursor: z.string().max(200).nullable().default(null),
});
export type SyncStateEntity = z.infer<typeof SyncStateEntity>;

export const SyncStatus = z.enum(['idle', 'syncing', 'error', 'offline']);
export type SyncStatus = z.infer<typeof SyncStatus>;
