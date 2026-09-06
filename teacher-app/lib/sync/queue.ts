import { Platform } from 'react-native';
import { getRawDb } from '../../db/client';

// "Queued changes" = local rows that have not yet reached the cloud. A teacher
// can keep working fully offline; these counts tell them how much data is still
// only on this phone so they know whether it's safe to close the app.

// Tables carrying both synced_at and client_updated_at: a row is unsynced when
// it was never pushed (synced_at IS NULL) or edited since the last push
// (client_updated_at > synced_at). Names are constant literals — never user
// input — so interpolating them into SQL is safe.
const STANDARD_TABLES = [
  'classes',
  'students',
  'payments',
  'attendance',
  'notes',
  'note_files',
  'exams',
  'marks',
] as const;

// Append-only tables: "unsynced" simply means never pushed.
const APPEND_ONLY_TABLES = ['payment_corrections'] as const;

/**
 * Count local changes that still need to be backed up to the cloud for this
 * teacher. Native only (web has no local SQLite). Best-effort — returns 0 if
 * the DB isn't ready rather than throwing.
 */
export function countUnsyncedChanges(teacherId: string): number {
  if (Platform.OS === 'web' || !teacherId) return 0;
  try {
    const db = getRawDb();
    let total = 0;

    for (const table of STANDARD_TABLES) {
      const row = db.getFirstSync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM ${table} WHERE teacher_id = ? AND (synced_at IS NULL OR client_updated_at > synced_at)`,
        teacherId,
      );
      total += row?.c ?? 0;
    }

    for (const table of APPEND_ONLY_TABLES) {
      const row = db.getFirstSync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM ${table} WHERE teacher_id = ? AND synced_at IS NULL`,
        teacherId,
      );
      total += row?.c ?? 0;
    }

    return total;
  } catch {
    return 0;
  }
}
