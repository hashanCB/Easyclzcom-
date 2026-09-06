/**
 * clearLocalDb — wipe all local SQLite rows for the given teacher.
 *
 * Called from clearAuth() on logout so that the next teacher who signs in
 * on the same device starts with a clean slate.  We delete by teacherId
 * rather than dropping the whole file so that the schema / migrations state
 * is preserved.
 */
import { eq } from 'drizzle-orm';
import { getDb } from './client';
import {
  classes,
  students,
  payments,
  paymentCorrections,
  attendance,
  notes,
  noteFiles,
  exams,
  syncCursor,
} from './schema';

export async function clearLocalDb(teacherId: string): Promise<void> {
  try {
    const db = getDb();
    // Delete in child-first order to avoid FK constraint issues.
    db.delete(attendance).where(eq(attendance.teacherId, teacherId)).run();
    db.delete(payments).where(eq(payments.teacherId, teacherId)).run();
    db.delete(paymentCorrections).where(eq(paymentCorrections.teacherId, teacherId)).run();
    db.delete(exams).where(eq(exams.teacherId, teacherId)).run();
    db.delete(noteFiles).where(eq(noteFiles.teacherId, teacherId)).run();
    db.delete(notes).where(eq(notes.teacherId, teacherId)).run();
    db.delete(students).where(eq(students.teacherId, teacherId)).run();
    db.delete(classes).where(eq(classes.teacherId, teacherId)).run();
    // Clear sync cursors so the next teacher pulls fresh data.
    db.delete(syncCursor).run();
  } catch (e) {
    // Non-fatal — worst case the next teacher briefly sees stale rows, but
    // the teacherId filter on every query will hide them.
    console.warn('[clearLocalDb] failed to clear local data:', e);
  }
}
