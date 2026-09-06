import { storage } from '../storage';
import { SECURE_STORE } from '../constants';

// A "cloud backup" is a successful full push of this teacher's local data to the
// cloud (the sync engine's pushAll). We persist the timestamp of the last one,
// per-teacher, so the indicator survives app restarts and we can guarantee a
// daily backup whenever the teacher opens the app.

/** Backups older than this are considered due — we aim for one per day. */
export const CLOUD_BACKUP_DUE_MS = 24 * 60 * 60 * 1000;

/** Past this age we warn the teacher (their data hasn't reached the cloud). */
export const CLOUD_BACKUP_OVERDUE_MS = 3 * 24 * 60 * 60 * 1000;

function key(teacherId: string): string {
  return `${SECURE_STORE.LAST_CLOUD_BACKUP}_${teacherId}`;
}

export async function getLastCloudBackupAt(teacherId: string): Promise<string | null> {
  return storage.getItem(key(teacherId));
}

export async function recordCloudBackupDone(
  teacherId: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  await storage.setItem(key(teacherId), at);
}

export async function clearCloudBackup(teacherId: string): Promise<void> {
  await storage.deleteItem(key(teacherId));
}

/** True when no backup exists yet, or the last one is older than a day. */
export async function isCloudBackupDue(teacherId: string): Promise<boolean> {
  const raw = await getLastCloudBackupAt(teacherId);
  if (!raw) return true;
  return Date.now() - new Date(raw).getTime() > CLOUD_BACKUP_DUE_MS;
}

export function isCloudBackupOverdue(lastBackupAt: string | null): boolean {
  if (!lastBackupAt) return true;
  return Date.now() - new Date(lastBackupAt).getTime() > CLOUD_BACKUP_OVERDUE_MS;
}

/** Human-readable "Backed up X ago" label for the indicator. */
export function formatCloudBackup(lastBackupAt: string | null): string {
  if (!lastBackupAt) return 'Not backed up to cloud yet';
  const diffMs = Date.now() - new Date(lastBackupAt).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Backed up to cloud just now';
  if (mins < 60) return `Backed up to cloud ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Backed up to cloud ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'Backed up to cloud yesterday' : `Backed up to cloud ${days}d ago`;
}
