import { storage } from '../storage';
import { SECURE_STORE } from '../constants';

const OVERDUE_DAYS = 7;

export async function getLastBackupAt(): Promise<string | null> {
  return storage.getItem(SECURE_STORE.LAST_BACKUP);
}

export async function recordBackupDone(): Promise<void> {
  await storage.setItem(SECURE_STORE.LAST_BACKUP, new Date().toISOString());
}

export async function isBackupOverdue(): Promise<boolean> {
  const raw = await getLastBackupAt();
  if (!raw) return true;
  const diffMs = Date.now() - new Date(raw).getTime();
  return diffMs > OVERDUE_DAYS * 24 * 60 * 60 * 1000;
}

export function formatLastBackup(lastBackupAt: string | null): string {
  if (!lastBackupAt) return 'Never backed up';
  const diffMs = Date.now() - new Date(lastBackupAt).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Backed up today';
  if (days === 1) return 'Backed up yesterday';
  return `Backed up ${days} days ago`;
}
