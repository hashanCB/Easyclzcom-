import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Attendance, NewAttendance } from '../../db/schema/attendance';
import type { Student } from '../../db/schema/students';
import { scheduleSync } from '../sync/engine';
import { logger } from '../logger';

type AttendanceRepo = typeof import('../../db/repositories/attendanceRepo').attendanceRepo;
type StudentsRepo = typeof import('../../db/repositories/studentsRepo').studentsRepo;

function getRepo(): AttendanceRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/attendanceRepo').attendanceRepo as AttendanceRepo;
  } catch {
    return null;
  }
}

function getStudentsRepo(): StudentsRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/studentsRepo').studentsRepo as StudentsRepo;
  } catch {
    return null;
  }
}

export interface AttendanceSession {
  students: Student[];
  marksMap: Map<string, Attendance>; // keyed by studentId
}

export interface CalendarDayStat {
  date: string;
  total: number;
  present: number;
  absent: number;
  late: number;
}

/** Per-day attendance summary for a class in a given month (YYYY-MM). */
export function useCalendarMonth(classId: string, month: string) {
  const [dayStats, setDayStats] = useState<Map<string, CalendarDayStat>>(new Map());

  const refresh = useCallback(() => {
    if (!classId || !month) { setDayStats(new Map()); return; }
    const repo = getRepo();
    if (!repo) return;
    try {
      const rows = repo.findByClassAndMonth(classId, month);
      const map = new Map<string, CalendarDayStat>();
      for (const r of rows) {
        const s = map.get(r.date) ?? { date: r.date, total: 0, present: 0, absent: 0, late: 0 };
        s.total++;
        if (r.status === 'present') s.present++;
        else if (r.status === 'absent') s.absent++;
        else if (r.status === 'late') s.late++;
        map.set(r.date, s);
      }
      setDayStats(map);
    } catch (e) {
      logger.warn('calendar month load failed', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, month]);

  useEffect(() => { refresh(); }, [refresh]);
  return { dayStats, refresh };
}

/** Loads all active students for a class + existing attendance marks for that date. */
export function useAttendanceSession(classId: string, date: string) {
  const [session, setSession] = useState<AttendanceSession>({ students: [], marksMap: new Map() });
  const [loading, setLoading] = useState(true);

  const key = `${classId}::${date}`;
  const refresh = useCallback(() => {
    if (!classId || !date) { setLoading(false); return; }
    const aRepo = getRepo();
    const sRepo = getStudentsRepo();
    if (!aRepo || !sRepo) { setLoading(false); return; }
    try {
      const students = sRepo.findByClass(classId).filter((s) => s.isActive && !s.deletedAt);
      const marks = aRepo.findByClassAndDate(classId, date);
      const marksMap = new Map<string, Attendance>(marks.map((m) => [m.studentId, m]));
      setSession({ students, marksMap });
    } catch (e) {
      logger.warn('attendance session load failed', e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  return { session, loading, refresh };
}

export function markAttendance(data: NewAttendance): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web.');
  repo.upsertMark(data);
  scheduleSync();
}

// ── Report types ─────────────────────────────────────────────────────────────

export interface StudentAttendanceStat {
  student: Student;
  present: number;
  absent: number;
  late: number;
  total: number;       // unique dates in the month that had any attendance
  percentage: number;  // present / total * 100
}

export type ReportSort = 'az' | 'za' | 'high' | 'low';

export interface ReportFilter {
  classId: string;
  month: string;        // YYYY-MM
  sort: ReportSort;
  minAbsent: number;    // 0 = no filter
}

/** Loads attendance report for a class+month. Returns per-student stats. */
export function useAttendanceReport(filter: ReportFilter) {
  const [stats, setStats] = useState<StudentAttendanceStat[]>([]);
  const [loading, setLoading] = useState(true);

  const key = JSON.stringify(filter);
  const refresh = useCallback(() => {
    if (!filter.classId || !filter.month) { setStats([]); setLoading(false); return; }
    const aRepo = getRepo();
    const sRepo = getStudentsRepo();
    if (!aRepo || !sRepo) { setStats([]); setLoading(false); return; }
    try {
      const students = sRepo.findByClass(filter.classId).filter((s) => !s.deletedAt);
      const rows = aRepo.findByClassAndMonth(filter.classId, filter.month);

      // Unique session dates in this month for the class
      const sessionDates = new Set(rows.map((r) => r.date));
      const total = sessionDates.size;

      // Per-student counts
      const countMap = new Map<string, { present: number; absent: number; late: number }>();
      for (const r of rows) {
        const c = countMap.get(r.studentId) ?? { present: 0, absent: 0, late: 0 };
        if (r.status === 'present') c.present++;
        else if (r.status === 'absent') c.absent++;
        else if (r.status === 'late') c.late++;
        countMap.set(r.studentId, c);
      }

      let result: StudentAttendanceStat[] = students.map((s) => {
        const c = countMap.get(s.id) ?? { present: 0, absent: 0, late: 0 };
        return {
          student: s,
          present: c.present,
          absent: c.absent,
          late: c.late,
          total,
          percentage: total > 0 ? Math.round((c.present / total) * 100) : 0,
        };
      });

      // Absent filter
      if (filter.minAbsent > 0) {
        result = result.filter((s) => s.absent >= filter.minAbsent);
      }

      // Sort
      result.sort((a, b) => {
        if (filter.sort === 'az') return a.student.name.localeCompare(b.student.name);
        if (filter.sort === 'za') return b.student.name.localeCompare(a.student.name);
        if (filter.sort === 'high') return b.percentage - a.percentage;
        if (filter.sort === 'low') return a.percentage - b.percentage;
        return 0;
      });

      setStats(result);
    } catch (e) {
      logger.warn('attendance report failed', e);
      setStats([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  return { stats, loading, refresh };
}
