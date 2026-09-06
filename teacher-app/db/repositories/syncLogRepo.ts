import { desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { syncLog, type NewSyncLogEntry, type SyncLogEntry } from '../schema';

const MAX_ENTRIES = 30;

export const syncLogRepo = {
  /** Insert a new sync log entry and prune old ones to keep max 30. */
  insert(entry: NewSyncLogEntry): void {
    const db = getDb();
    db.insert(syncLog).values(entry).run();
    // Keep only the latest MAX_ENTRIES rows
    const all = db
      .select({ id: syncLog.id })
      .from(syncLog)
      .orderBy(desc(syncLog.syncedAt))
      .all();
    if (all.length > MAX_ENTRIES) {
      const toDelete = all.slice(MAX_ENTRIES).map((r) => r.id);
      for (const id of toDelete) {
        db.delete(syncLog).where(eq(syncLog.id, id)).run();
      }
    }
  },

  /** Get the most recent entries, newest first. */
  getRecent(limit = MAX_ENTRIES): SyncLogEntry[] {
    return getDb()
      .select()
      .from(syncLog)
      .orderBy(desc(syncLog.syncedAt))
      .limit(limit)
      .all();
  },
};
