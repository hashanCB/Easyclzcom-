import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const syncCursor = sqliteTable('sync_cursor', {
  tableName:    text('table_name').primaryKey(),
  lastPulledAt: text('last_pulled_at'),
  lastPushedAt: text('last_pushed_at'),
});

export type SyncCursor = typeof syncCursor.$inferSelect;
