import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { ExtraClass, NewExtraClass, NewAttendance, NewPayment, Student } from '../../db/schema';
import type { ExtraClassFilter } from '../../db/repositories/extraClassesRepo';
import { scheduleSync } from '../sync/engine';
import { extraChargeCents } from './charge';
import { logger } from '../logger';

type ExtraRepo = typeof import('../../db/repositories/extraClassesRepo').extraClassesRepo;
type StudentsRepo = typeof import('../../db/repositories/studentsRepo').studentsRepo;
type ClassesRepo = typeof import('../../db/repositories/classesRepo').classesRepo;
type AttendanceRepo = typeof import('../../db/repositories/attendanceRepo').attendanceRepo;
type PaymentsRepo = typeof import('../../db/repositories/paymentsRepo').paymentsRepo;
type EnrollRepo = typeof import('../../db/repositories/studentClassesRepo').studentClassesRepo;

// Metro needs STATIC require() string literals — never a variable.
function getExtra(): ExtraRepo | null {
  if (Platform.OS === 'web') return null;
  try { return require('../../db/repositories/extraClassesRepo').extraClassesRepo as ExtraRepo; } catch { return null; }
}
function getStudents(): StudentsRepo | null {
  if (Platform.OS === 'web') return null;
  try { return require('../../db/repositories/studentsRepo').studentsRepo as StudentsRepo; } catch { return null; }
}
function getClasses(): ClassesRepo | null {
  if (Platform.OS === 'web') return null;
  try { return require('../../db/repositories/classesRepo').classesRepo as ClassesRepo; } catch { return null; }
}
function getAttendance(): AttendanceRepo | null {
  if (Platform.OS === 'web') return null;
  try { return require('../../db/repositories/attendanceRepo').attendanceRepo as AttendanceRepo; } catch { return null; }
}
function getPayments(): PaymentsRepo | null {
  if (Platform.OS === 'web') return null;
  try { return require('../../db/repositories/paymentsRepo').paymentsRepo as PaymentsRepo; } catch { return null; }
}
function getEnroll(): EnrollRepo | null {
  if (Platform.OS === 'web') return null;
  try { return require('../../db/repositories/studentClassesRepo').studentClassesRepo as EnrollRepo; } catch { return null; }
}

export function useExtraClasses(filter: ExtraClassFilter) {
  const [items, setItems] = useState<ExtraClass[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(filter);
  const refresh = useCallback(() => {
    const repo = getExtra();
    if (!repo) { setItems([]); setLoading(false); return; }
    try { setItems(repo.findAll(filter)); } catch { setItems([]); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { refresh(); }, [refresh]);
  return { items, loading, refresh, isWeb: Platform.OS === 'web' };
}

export function useExtraClass(id: string | undefined) {
  const [extra, setExtra] = useState<ExtraClass | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    if (!id || id === 'new') { setLoading(false); return; }
    const repo = getExtra();
    if (!repo) { setLoading(false); return; }
    try { setExtra(repo.findById(id) ?? null); } catch { /* ignore */ }
    setLoading(false);
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);
  return { extra, loading, refresh };
}

export function saveExtraClass(data: NewExtraClass, id?: string): void {
  const repo = getExtra();
  if (!repo) throw new Error('Local database is not available on web yet.');
  if (id && id !== 'new') repo.update(id, data);
  else repo.insert(data);
  scheduleSync();
}

export function deleteExtraClass(id: string): void {
  const repo = getExtra();
  if (!repo) throw new Error('Local database is not available on web yet.');
  repo.softDelete(id, new Date().toISOString());
  scheduleSync();
}

// ── Roster (attendance + per-student charge + paid/owed) ─────────────────────

export interface ExtraRosterRow {
  student: Student;
  status: 'present' | 'absent' | 'late' | null;
  chargeCents: number;   // what this student owes if present (0 for free/free-card)
  paidCents: number;     // collected so far for this extra class
  owedCents: number;     // present && charge > paid → balance; else 0
}

export interface ExtraRoster {
  rows: ExtraRosterRow[];
  presentCount: number;
  paidCount: number;     // present students whose charge is fully covered (or 0 charge)
  collectedCents: number;
  pendingCents: number;
  isPaid: boolean;       // the extra class charges money
}

export function useExtraClassRoster(extraClassId: string | undefined): {
  extra: ExtraClass | null; roster: ExtraRoster | null; loading: boolean; refresh: () => void;
} {
  const [extra, setExtra] = useState<ExtraClass | null>(null);
  const [roster, setRoster] = useState<ExtraRoster | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const eRepo = getExtra(); const sRepo = getStudents(); const cRepo = getClasses();
    const aRepo = getAttendance(); const pRepo = getPayments(); const enr = getEnroll();
    if (!extraClassId || !eRepo || !sRepo || !cRepo || !aRepo || !pRepo) { setLoading(false); return; }
    try {
      const ex = eRepo.findById(extraClassId) ?? null;
      setExtra(ex);
      if (!ex) { setRoster(null); setLoading(false); return; }

      const cls = cRepo.findById(ex.classId);
      const classFeeCents = cls?.monthlyFeeCents ?? 0;

      const students = sRepo.findByClass(ex.classId).filter((s) => s.isActive && !s.deletedAt && s.joinStatus === 'confirmed');
      const enrollMap = new Map((enr?.findByClass(ex.classId) ?? []).map((r) => [r.studentId, r]));
      const attMap = new Map(aRepo.findByExtraClass(extraClassId).map((a) => [a.studentId, a.status as ExtraRosterRow['status']]));
      const paidMap = new Map<string, number>();
      for (const p of pRepo.findByExtraClass(extraClassId)) {
        paidMap.set(p.studentId, (paidMap.get(p.studentId) ?? 0) + (p.amountCents ?? 0));
      }

      const isPaid = ex.feeMode !== 'free';
      let presentCount = 0, paidCount = 0, collectedCents = 0, pendingCents = 0;
      const rows: ExtraRosterRow[] = students.map((s) => {
        const status = attMap.get(s.id) ?? null;
        const e = enrollMap.get(s.id);
        const feeSrc = e ? { feeType: e.feeType, customFeeCents: e.customFeeCents } : { feeType: s.feeType, customFeeCents: s.customFeeCents };
        const chargeCents = extraChargeCents(ex.feeMode, ex.customFeeCents ?? null, feeSrc, classFeeCents);
        const paidCents = paidMap.get(s.id) ?? 0;
        const present = status === 'present' || status === 'late';
        const owedCents = present ? Math.max(0, chargeCents - paidCents) : 0;
        if (present) {
          presentCount++;
          collectedCents += Math.min(paidCents, chargeCents);
          pendingCents += owedCents;
          if (chargeCents === 0 || paidCents >= chargeCents) paidCount++;
        }
        return { student: s, status, chargeCents, paidCents, owedCents };
      });

      setRoster({ rows, presentCount, paidCount, collectedCents, pendingCents, isPaid });
    } catch (e) {
      logger.warn('extra roster failed', e);
      setRoster(null);
    } finally {
      setLoading(false);
    }
  }, [extraClassId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { extra, roster, loading, refresh };
}

/** Mark one student present/absent/late for an extra class. */
export function markExtraAttendance(
  args: { extraClassId: string; classId: string; teacherId: string; studentId: string; date: string; status: 'present' | 'absent' | 'late' },
): void {
  const repo = getAttendance();
  if (!repo) throw new Error('Local database is not available on web yet.');
  const now = new Date().toISOString();
  repo.upsertExtraMark({
    id: cryptoId(),
    teacherId: args.teacherId,
    studentId: args.studentId,
    classId: args.classId,
    extraClassId: args.extraClassId,
    date: args.date,
    status: args.status,
    smsIntent: false,
    smsSentAt: null,
    markedByUserId: args.teacherId,
    markedByRole: 'teacher',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    clientUpdatedAt: now,
    syncedAt: null,
  } as NewAttendance);
  scheduleSync();
}

/** Record an extra-class payment for one student. */
export function collectExtraPayment(data: NewPayment): void {
  const repo = getPayments();
  if (!repo) throw new Error('Local database is not available on web yet.');
  repo.insert(data);
  scheduleSync();
}

function cryptoId(): string {
  return require('../uuid').newId();
}
