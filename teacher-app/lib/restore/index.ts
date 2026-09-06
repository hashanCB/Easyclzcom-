import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SECURE_STORE } from '../constants';
import { storage } from '../storage';
import {
  pullClasses,
  pullStudents,
  pullPayments,
  pullPaymentCorrections,
  pullAttendance,
  pullExams,
  pullMarks,
  pullNotes,
  pullNoteFiles,
} from '../sync/pull';

// ---------------------------------------------------------------------------
// New-Phone Restore (SRS §20.4)
//
// On a fresh install the local SQLite DB is empty and the sync cursors are at
// epoch. Running the pull functions therefore fetches the teacher's entire
// cloud dataset. This module wraps that flow with fresh-install detection,
// a cloud-data probe, and per-table progress reporting.
// ---------------------------------------------------------------------------

const REST = `${SUPABASE_URL}/rest/v1`;

// ---------------------------------------------------------------------------
// "Initial cloud pull" flag (per teacher, per device)
//
// Tracks whether this device has already pulled the teacher's cloud dataset.
// While the flag is unset, the Account screen surfaces a manual "Pull from
// cloud" button so a teacher who tapped "Later" / "Start as new" at login can
// still download their data. The flag is cleared on logout, session expiry,
// and re-activation (token reset) so the pull becomes available again — see
// lib/auth/store.ts and app/(auth)/activate.tsx.
// ---------------------------------------------------------------------------

function pullFlagKey(teacherId: string): string {
  return `${SECURE_STORE.CLOUD_PULL_DONE}_${teacherId}`;
}

/** True once this device has completed the initial cloud pull for the teacher. */
export async function hasPulledFromCloud(teacherId: string): Promise<boolean> {
  const v = await storage.getItem(pullFlagKey(teacherId));
  return v === '1';
}

/** Mark the initial cloud pull as done so the manual pull prompt hides. */
export async function markPulledFromCloud(teacherId: string): Promise<void> {
  await storage.setItem(pullFlagKey(teacherId), '1');
}

/** Reset the flag (logout / expiry / re-activation) so pull is offered again. */
export async function clearPulledFlag(teacherId: string): Promise<void> {
  await storage.deleteItem(pullFlagKey(teacherId));
}

/** True when the local DB holds no classes/students for this teacher — i.e.
 *  a fresh install or a teacher who has never created data on this device. */
export function localIsEmpty(teacherId: string): boolean {
  if (Platform.OS === 'web') return false;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { classesRepo } = require('../../db/repositories/classesRepo');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { studentsRepo } = require('../../db/repositories/studentsRepo');

  const classCount = classesRepo.findAll(teacherId).length;
  if (classCount > 0) return false;

  const studentCount = studentsRepo.findAll({ teacherId }).length;
  return studentCount === 0;
}

/** Probe Supabase for any cloud data belonging to this teacher. */
export async function cloudHasData(teacherId: string, token: string): Promise<boolean> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
  };

  for (const table of ['classes', 'students']) {
    const params = new URLSearchParams({
      teacher_id: `eq.${teacherId}`,
      select: 'id',
      limit: '1',
    });
    const res = await fetch(`${REST}/${table}?${params}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => res.status.toString());
      throw new Error(`cloudHasData(${table}): ${res.status} ${body}`);
    }
    const rows = (await res.json()) as unknown[];
    if (rows.length > 0) return true;
  }
  return false;
}

export interface RestoreProgress {
  step: string;
  classes: number;
  students: number;
  payments: number;
  corrections: number;
  attendance: number;
  exams: number;
  marks: number;
  notes: number;
  noteFiles: number;
}

/** Pull the teacher's full cloud dataset into the local DB. Reports progress
 *  as each table completes. Order matters: parents (classes, students, notes)
 *  before their children (payments, marks, note_files). */
export async function cloudRestore(
  teacherId: string,
  token: string,
  onProgress: (p: RestoreProgress) => void,
): Promise<RestoreProgress> {
  const progress: RestoreProgress = {
    step: 'Starting…',
    classes: 0,
    students: 0,
    payments: 0,
    corrections: 0,
    attendance: 0,
    exams: 0,
    marks: 0,
    notes: 0,
    noteFiles: 0,
  };

  progress.step = 'Restoring classes…';
  onProgress({ ...progress });
  progress.classes = await pullClasses(teacherId, token);

  progress.step = 'Restoring students…';
  onProgress({ ...progress });
  progress.students = await pullStudents(teacherId, token);

  progress.step = 'Restoring payments…';
  onProgress({ ...progress });
  progress.payments = await pullPayments(teacherId, token);

  progress.step = 'Restoring payment corrections…';
  onProgress({ ...progress });
  progress.corrections = await pullPaymentCorrections(teacherId, token);

  progress.step = 'Restoring attendance…';
  onProgress({ ...progress });
  progress.attendance = await pullAttendance(teacherId, token);

  progress.step = 'Restoring exams…';
  onProgress({ ...progress });
  progress.exams = await pullExams(teacherId, token);

  progress.step = 'Restoring marks…';
  onProgress({ ...progress });
  progress.marks = await pullMarks(teacherId, token);

  progress.step = 'Restoring notes…';
  onProgress({ ...progress });
  progress.notes = await pullNotes(teacherId, token);

  progress.step = 'Restoring note files…';
  onProgress({ ...progress });
  progress.noteFiles = await pullNoteFiles(teacherId, token);

  progress.step = 'Done';
  onProgress({ ...progress });
  return progress;
}
