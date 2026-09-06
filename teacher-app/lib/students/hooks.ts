import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Student, NewStudent } from '../../db/schema/students';
import type { StudentFilter } from '../../db/repositories/studentsRepo';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { scheduleSync } from '../sync/engine';
import { useSubscriptionStore, currentStudentLimit } from '../subscription/store';
import { logger } from '../logger';

type Repo = typeof import('../../db/repositories/studentsRepo').studentsRepo;
type ClassesRepo = typeof import('../../db/repositories/classesRepo').classesRepo;
type EnrollRepo = typeof import('../../db/repositories/studentClassesRepo').studentClassesRepo;
type EnrollmentInput = import('../../db/repositories/studentClassesRepo').EnrollmentInput;
type StudentClass = import('../../db/schema').StudentClass;

function getRepo(): Repo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/studentsRepo').studentsRepo as Repo;
  } catch {
    return null;
  }
}

function getClassesRepo(): ClassesRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/classesRepo').classesRepo as ClassesRepo;
  } catch {
    return null;
  }
}

function getEnrollRepo(): EnrollRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/studentClassesRepo').studentClassesRepo as EnrollRepo;
  } catch {
    return null;
  }
}

export function useStudentsList(filter: StudentFilter) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const key = JSON.stringify(filter);
  const refresh = useCallback(() => {
    const repo = getRepo();
    if (!repo) {
      setStudents([]);
      setLoading(false);
      return;
    }
    try {
      setStudents(repo.findAll(filter));
    } catch (e) {
      logger.warn('students.findAll failed', e);
      setStudents([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { students, loading, refresh, isWeb: Platform.OS === 'web' };
}

export function useStudent(id: string | undefined) {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!id || id === 'new') {
      setStudent(null);
      setLoading(false);
      return;
    }
    const repo = getRepo();
    if (!repo) {
      setLoading(false);
      return;
    }
    try {
      setStudent(repo.findById(id) ?? null);
    } catch (e) {
      logger.warn('students.findById failed', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { student, loading, refresh };
}

export interface ClassOption {
  id: string;
  label: string;
  feeCents: number;
  subject: string;
  grade: string;
  batch: string;
  language: string;
  location: string;
  // Schedule — drives the "mark only today, only within the window" rules.
  classDay: string;
  classSchedule: string | null;
  classStartTime: string;
  classEndTime: string;
  qrGraceMinutesBefore: number;
}

/** Shared class-dropdown label: "ICT - Main Hall · Group A (Grade 6)".
 *  Location is included only when the class has one. */
export function classOptionLabel(c: {
  subject: string; batch: string; grade: string; location?: string | null;
}): string {
  const loc = c.location?.trim();
  return `${c.subject}${loc ? ` - ${loc}` : ''} · ${c.batch} (Grade ${c.grade})`;
}

export function useClassOptions(teacherId: string): ClassOption[] {
  const [options, setOptions] = useState<ClassOption[]>([]);
  useEffect(() => {
    const repo = getClassesRepo();
    if (!repo) return;
    try {
      const rows = repo.findActive(teacherId);
      setOptions(
        rows.map((c) => ({
          id: c.id,
          label: classOptionLabel(c),
          feeCents: c.monthlyFeeCents,
          location: c.location ?? '',
          subject: c.subject,
          grade: c.grade,
          batch: c.batch,
          language: c.language,
          classDay: c.classDay,
          classSchedule: c.classSchedule ?? null,
          classStartTime: c.classStartTime,
          classEndTime: c.classEndTime,
          qrGraceMinutesBefore: c.qrGraceMinutesBefore ?? 30,
        })),
      );
    } catch {
      setOptions([]);
    }
  }, [teacherId]);
  return options;
}

/**
 * The earliest month (YYYY-MM) any student joined for this teacher (optionally
 * scoped to one class). Used to anchor the "From" end of month-range pickers so
 * they start when students first enrolled rather than an arbitrary month.
 * Returns null until known / when there are no students.
 */
export function useEarliestJoinMonth(teacherId: string, classId?: string): string | null {
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    const repo = getRepo();
    if (!repo || !teacherId) { setMonth(null); return; }
    try {
      setMonth(repo.earliestJoinMonth(teacherId, classId || undefined));
    } catch {
      setMonth(null);
    }
  }, [teacherId, classId]);
  return month;
}

/**
 * The month (YYYY-MM) the teacher created their FIRST class. This is the true
 * "you started here" anchor for payment month pickers — we never want to offer
 * months from before the teacher began using the app. Returns null until known
 * / when there are no classes yet.
 */
export function useEarliestClassMonth(teacherId: string): string | null {
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    const repo = getClassesRepo();
    if (!repo || !teacherId) { setMonth(null); return; }
    try {
      const rows = repo.findAll(teacherId); // excludes soft-deleted
      let earliest: string | null = null;
      for (const c of rows) {
        if (c.createdAt && (!earliest || c.createdAt < earliest)) earliest = c.createdAt;
      }
      setMonth(earliest ? earliest.slice(0, 7) : null); // 'YYYY-MM'
    } catch {
      setMonth(null);
    }
  }, [teacherId]);
  return month;
}

export function nextStudentCode(teacherId: string): string {
  const repo = getRepo();
  if (!repo) return 'STU-0001';
  return repo.nextCode(teacherId);
}

export function saveStudent(data: NewStudent, id?: string, enrollments?: EnrollmentInput[]): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');

  // Block a duplicate phone in the primary class BEFORE saving, so we never
  // create a row the cloud will reject forever (students_class_phone_uniq).
  if (data.studentPhone && data.studentPhone.trim()) {
    const clash = repo.findActiveByStudentPhoneInClass(
      data.classId,
      data.studentPhone.trim(),
      id && id !== 'new' ? id : data.id,
    );
    if (clash) {
      throw new Error(
        `This phone is already used by ${clash.name} (${clash.studentCode}) in this class. ` +
          `To add that student to another class, open their profile and edit their classes instead of registering again.`,
      );
    }
  }

  if (id && id !== 'new') {
    repo.update(id, data);
    if (enrollments) {
      getEnrollRepo()?.replaceForStudent(data.teacherId, id, enrollments);
    }
  } else {
    // Each package caps how many students a teacher can have. The server also
    // enforces this on sync, so check here first for a friendly message
    // (and to avoid creating a local row the cloud would reject).
    const { subscription, plans } = useSubscriptionStore.getState();
    const limit = currentStudentLimit(subscription, plans);
    if (limit != null) {
      const count = repo.findAll({ teacherId: data.teacherId }).length;
      if (count >= limit) {
        throw new Error(
          `Your plan allows up to ${limit} students. Upgrade your plan in Subscription settings to add more.`,
        );
      }
    }
    repo.insert(data);
    // Persist the class enrollments (one row per class, each with its own fee).
    // Fall back to the student's primary class so there's always one enrollment.
    const enr = enrollments && enrollments.length > 0
      ? enrollments
      : [{ classId: data.classId, feeType: data.feeType ?? 'regular', customFeeCents: data.customFeeCents ?? null }];
    getEnrollRepo()?.replaceForStudent(data.teacherId, data.id, enr);
    // New student added — nudge Free users to upgrade so their data goes to cloud.
    useSubscriptionStore.getState().maybeShowAd();
  }
  scheduleSync();
}

/**
 * Loads a student's class enrollments (active only) for the edit form / profile.
 * Returns rows mapped to the shape the form and detail screens expect.
 */
export function useStudentClasses(studentId: string | undefined): {
  enrollments: StudentClass[];
  refresh: () => void;
} {
  const [enrollments, setEnrollments] = useState<StudentClass[]>([]);
  const refresh = useCallback(() => {
    const repo = getEnrollRepo();
    if (!repo || !studentId || studentId === 'new') { setEnrollments([]); return; }
    try {
      setEnrollments(repo.findByStudent(studentId));
    } catch {
      setEnrollments([]);
    }
  }, [studentId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { enrollments, refresh };
}

export function setStudentActive(id: string, isActive: boolean): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');
  repo.setActive(id, isActive);
  scheduleSync();
}

export function confirmStudentForBilling(id: string): void {
  const repo = getRepo();
  if (!repo) return;
  repo.confirmIfPending(id);
  scheduleSync();
}

export function bumpStudentCardVersion(id: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');
  repo.bumpCardVersion(id);
  scheduleSync();
}

export interface StudentMapEntry {
  name: string;
  studentCode: string;
  id: string;
}

/**
 * Portal status for a student in this teacher's class.
 * - 'active'     → joined the portal and access is enabled
 * - 'suspended'  → joined but access has been suspended by teacher/admin
 * - null         → not joined (no portal link)
 */
export type PortalStatus = 'active' | 'suspended' | null;

/**
 * Fetches portal link status for all of a teacher's students.
 * Returns a Map<studentId, PortalStatus> and a refresh function.
 */
export function usePortalStatusMap(
  teacherId: string,
  accessToken: string | undefined,
): { statusMap: Map<string, PortalStatus>; loading: boolean; refresh: () => void } {
  const [statusMap, setStatusMap] = useState<Map<string, PortalStatus>>(new Map());
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef<() => void>(() => {});

  const fetch_ = useCallback(() => {
    if (!teacherId || !accessToken) {
      setStatusMap(new Map());
      return;
    }
    setLoading(true);
    fetch(
      `${SUPABASE_URL}/rest/v1/student_account_links?select=student_id,is_active&teacher_id=eq.${encodeURIComponent(teacherId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          Accept: 'application/json',
        },
      },
    )
      .then((r) => r.json())
      .then((rows: unknown) => {
        if (Array.isArray(rows)) {
          const m = new Map<string, PortalStatus>();
          for (const row of rows as { student_id: string; is_active?: boolean }[]) {
            m.set(row.student_id, row.is_active === false ? 'suspended' : 'active');
          }
          setStatusMap(m);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teacherId, accessToken]);

  useEffect(() => { fetchRef.current = fetch_; }, [fetch_]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const refresh = useCallback(() => fetchRef.current(), []);
  return { statusMap, loading, refresh };
}

/**
 * @deprecated Use usePortalStatusMap instead — kept for backwards compat.
 * Returns the set of student IDs that have ANY portal link (active or suspended).
 */
export function usePortalJoinedIds(
  teacherId: string,
  accessToken: string | undefined,
): { joinedIds: Set<string>; loading: boolean; refresh: () => void } {
  const { statusMap, loading, refresh } = usePortalStatusMap(teacherId, accessToken);
  const joinedIds = useMemo(() => new Set(statusMap.keys()), [statusMap]);
  return { joinedIds, loading, refresh };
}

/**
 * Count of this teacher's students who are awaiting their first payment
 * (join_status = 'pending_payment'). Used to show the money-gate banner.
 */
export function usePendingPaymentCount(teacherId: string): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    const repo = getRepo();
    if (!repo || !teacherId) { setCount(0); return; }
    try {
      setCount(repo.countPendingPayment(teacherId));
    } catch {
      setCount(0);
    }
  }, [teacherId]);

  useEffect(() => { refresh(); }, [refresh]);
  return count;
}

/** Returns a Map<studentId, {name, studentCode}> for all students of a teacher.
 *  Use this in list screens to resolve UUIDs → human-readable names in O(1). */
export function useStudentsMap(teacherId: string): Map<string, StudentMapEntry> {
  const [map, setMap] = useState<Map<string, StudentMapEntry>>(new Map());

  useEffect(() => {
    const repo = getRepo();
    if (!repo || !teacherId) return;
    try {
      const rows = repo.findAll({ teacherId });
      const m = new Map<string, StudentMapEntry>();
      for (const s of rows) {
        m.set(s.id, { id: s.id, name: s.name, studentCode: s.studentCode });
      }
      setMap(m);
    } catch {
      setMap(new Map());
    }
  }, [teacherId]);

  return map;
}
