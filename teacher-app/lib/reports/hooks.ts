import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { logger } from '../logger';

type PaymentsRepo = typeof import('../../db/repositories/paymentsRepo').paymentsRepo;
type StudentsRepo = typeof import('../../db/repositories/studentsRepo').studentsRepo;
type AttendanceRepo = typeof import('../../db/repositories/attendanceRepo').attendanceRepo;
type ClassesRepo = typeof import('../../db/repositories/classesRepo').classesRepo;
type ExamsRepo = typeof import('../../db/repositories/examsRepo').examsRepo;
type MarksRepo = typeof import('../../db/repositories/marksRepo').marksRepo;

function getRepos(): { p: PaymentsRepo; s: StudentsRepo; a: AttendanceRepo; c: ClassesRepo; e: ExamsRepo; m: MarksRepo } | null {
  if (Platform.OS === 'web') return null;
  try {
    return {
      p: require('../../db/repositories/paymentsRepo').paymentsRepo as PaymentsRepo,
      s: require('../../db/repositories/studentsRepo').studentsRepo as StudentsRepo,
      a: require('../../db/repositories/attendanceRepo').attendanceRepo as AttendanceRepo,
      c: require('../../db/repositories/classesRepo').classesRepo as ClassesRepo,
      e: require('../../db/repositories/examsRepo').examsRepo as ExamsRepo,
      m: require('../../db/repositories/marksRepo').marksRepo as MarksRepo,
    };
  } catch { return null; }
}

export interface DashboardStats {
  totalCents: number;
  todayCents: number;
  paidCount: number;
  partialCount: number;
  totalStudents: number;
  unpaidCount: number;
  pendingCents: number;        // sum of unpaid fees for the current month (active students × class fee − their paid amounts)
  presentToday: number;
  absentToday: number;
  lateToday: number;
  examAvgPct: number;          // avg % across exams in the last 3 months (0 if none)
  examCount: number;           // exams in the last 3 months
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function useDashboardStats(teacherId: string, classId?: string, month?: string) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const repos = getRepos();
    if (!repos) { setLoading(false); return; }

    try {
      const today = todayIso();
      const resolvedMonth = month ?? currentMonth();

      // Payment summary
      const paySummary = repos.p.summary(teacherId, resolvedMonth, today);

      // Students
      const allStudents = repos.s.findAll({ teacherId, status: 'active', classId });
      const totalStudents = allStudents.length;

      // Paid student IDs this month (regular monthly fee only — exclude extra classes)
      const monthPayments = repos.p.findAll({ teacherId, month: resolvedMonth, classId, monthlyOnly: true });
      const paidByStudent = new Map<string, number>();
      for (const p of monthPayments) {
        paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) ?? 0) + p.amountCents);
      }
      const unpaidCount = allStudents.filter((s) => !paidByStudent.has(s.id)).length;

      // Pending earnings = sum over active students of max(classFee − paidThisMonth, 0)
      const classFeeById = new Map<string, number>(
        repos.c.findAll(teacherId)
          .map((c) => [c.id, c.monthlyFeeCents] as const),
      );
      let pendingCents = 0;
      for (const s of allStudents) {
        const fee = classFeeById.get(s.classId) ?? 0;
        const paid = paidByStudent.get(s.id) ?? 0;
        pendingCents += Math.max(fee - paid, 0);
      }

      // Today's attendance — aggregate across all classes or specific class
      const classes = classId
        ? [{ id: classId }]
        : repos.c.findAll(teacherId).filter((c) => c.isActive);

      let presentToday = 0;
      let absentToday = 0;
      let lateToday = 0;

      for (const cls of classes) {
        const marks = repos.a.findByClassAndDate(cls.id, today);
        for (const m of marks) {
          if (m.status === 'present') presentToday++;
          else if (m.status === 'absent') absentToday++;
          else if (m.status === 'late') lateToday++;
        }
      }

      // Exam performance — avg % across exams in the last 3 months (class-filtered if classId set).
      const cutoff = (() => {
        const d = new Date(); d.setMonth(d.getMonth() - 3);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      const recentExams = repos.e
        .findAll({ teacherId, classId })
        .filter((ex) => ex.examDate >= cutoff && ex.totalMarks > 0);
      let pctSum = 0;
      let pctCount = 0;
      for (const ex of recentExams) {
        const ms = repos.m.findByExam(ex.id);
        for (const mk of ms) {
          if (typeof mk.mark === 'number') {
            pctSum += (mk.mark / ex.totalMarks) * 100;
            pctCount++;
          }
        }
      }
      const examAvgPct = pctCount ? Math.round((pctSum / pctCount) * 10) / 10 : 0;

      setStats({
        totalCents: paySummary.totalCents,
        todayCents: paySummary.todayCents,
        paidCount: paySummary.paidCount,
        partialCount: paySummary.partialCount,
        totalStudents,
        unpaidCount,
        pendingCents,
        presentToday,
        absentToday,
        lateToday,
        examAvgPct,
        examCount: recentExams.length,
      });
    } catch (e) {
      logger.warn('dashboard stats failed', e);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [teacherId, classId, month]);

  useEffect(() => { refresh(); }, [refresh]);

  return { stats, loading, refresh };
}

// ---------------------------------------------------------------------------
// PDF HTML builders
// ---------------------------------------------------------------------------

export function buildUnpaidPdfHtml(params: {
  teacherId: string;
  classLabel: string;
  month: string;
  rows: { name: string; studentCode: string; classLabel: string }[];
}): string {
  const { classLabel, month, rows } = params;
  const rowsHtml = rows.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:#6b7280;padding:24px">No unpaid students</td></tr>'
    : rows.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
          <td style="padding:10px 14px">${i + 1}</td>
          <td style="padding:10px 14px;font-family:monospace">${r.studentCode}</td>
          <td style="padding:10px 14px">${r.name}</td>
          <td style="padding:10px 14px">${r.classLabel}</td>
        </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Unpaid Students — ${month}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #1e40af; color: #fff; padding: 10px 14px; text-align: left; }
    td { border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 24px; font-size: 11px; color: #9ca3af; }
  </style></head><body>
  <h1>Unpaid Students Report</h1>
  <div class="meta">Class: ${classLabel} &nbsp;|&nbsp; Month: ${month} &nbsp;|&nbsp; Total: ${rows.length} students</div>
  <table>
    <thead><tr><th>#</th><th>Student ID</th><th>Name</th><th>Class</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Generated ${new Date().toLocaleString()}</div>
  </body></html>`;
}

export function buildAttendancePdfHtml(params: {
  classLabel: string;
  month: string;
  rows: { name: string; studentCode: string; present: number; late: number; absent: number; total: number; pct: number }[];
}): string {
  const { classLabel, month, rows } = params;
  const rowsHtml = rows.length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:24px">No attendance data</td></tr>'
    : rows.map((r, i) => {
        const pctColor = r.pct >= 80 ? '#065f46' : r.pct >= 50 ? '#92400e' : '#991b1b';
        return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
          <td style="padding:9px 12px">${i + 1}</td>
          <td style="padding:9px 12px;font-family:monospace">${r.studentCode}</td>
          <td style="padding:9px 12px">${r.name}</td>
          <td style="padding:9px 12px;text-align:center;color:#065f46">${r.present}</td>
          <td style="padding:9px 12px;text-align:center;color:#92400e">${r.late}</td>
          <td style="padding:9px 12px;text-align:center;color:#991b1b">${r.absent}</td>
          <td style="padding:9px 12px;text-align:center;font-weight:700;color:${pctColor}">${r.pct}%</td>
        </tr>`;
      }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Attendance Report — ${month}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1e40af; color: #fff; padding: 9px 12px; text-align: left; }
    td { border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 24px; font-size: 11px; color: #9ca3af; }
  </style></head><body>
  <h1>Attendance Report</h1>
  <div class="meta">Class: ${classLabel} &nbsp;|&nbsp; Month: ${month} &nbsp;|&nbsp; ${rows.length} students</div>
  <table>
    <thead><tr><th>#</th><th>Student ID</th><th>Name</th><th>Present</th><th>Late</th><th>Absent</th><th>%</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Generated ${new Date().toLocaleString()}</div>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// U43 — Monthly income + breakdowns
// ---------------------------------------------------------------------------

export interface MonthlyIncomeRow {
  month: string;     // YYYY-MM
  label: string;     // e.g. "Mar 2026"
  cents: number;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

// Last N months of collections (default 12), oldest → newest.
export function useMonthlyIncome(teacherId: string, classId?: string, months = 12) {
  const [rows, setRows] = useState<MonthlyIncomeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const repos = getRepos();
    if (!repos) { setLoading(false); return; }
    try {
      const out: MonthlyIncomeRow[] = [];
      const now = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const payments = repos.p.findAll({ teacherId, month: ym, classId });
        const cents = payments.reduce((sum, p) => sum + p.amountCents, 0);
        out.push({ month: ym, label: monthLabel(ym), cents });
      }
      setRows(out);
    } catch (e) {
      logger.warn('monthly income failed', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId, classId, months]);

  useEffect(() => { refresh(); }, [refresh]);
  return { rows, loading, refresh };
}

export type BreakdownAxis = 'class' | 'grade' | 'batch' | 'assistant';

export interface BreakdownRow {
  key: string;
  label: string;
  cents: number;
  paymentCount: number;
  studentCount: number;     // unique students included
  meta?: string;            // free-form e.g. grade/batch
}

// Sums payments along the chosen axis for one month, biggest first.
// For axis='assistant': only payments where collected_by_role='assistant'.
export function useIncomeBreakdown(
  teacherId: string,
  month: string,
  axis: BreakdownAxis,
  assistantNamesByUserId?: Map<string, string>,
) {
  const [rows, setRows] = useState<BreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const repos = getRepos();
    if (!repos) { setLoading(false); return; }
    try {
      const payments = repos.p.findAll({ teacherId, month });
      const classesById = new Map(repos.c.findAll(teacherId).map((c) => [c.id, c] as const));

      const agg = new Map<string, { label: string; cents: number; payments: number; students: Set<string>; meta?: string }>();
      for (const p of payments) {
        const cls = classesById.get(p.classId);
        let key: string;
        let label: string;
        let meta: string | undefined;

        if (axis === 'class') {
          key = p.classId;
          label = cls ? `${cls.subject} · ${cls.batch}` : p.classId;
          meta = cls ? `Grade ${cls.grade}` : undefined;
        } else if (axis === 'grade') {
          key = cls?.grade ?? 'Unknown';
          label = `Grade ${key}`;
        } else if (axis === 'batch') {
          key = cls?.batch ?? 'Unknown';
          label = key;
          meta = cls ? `${cls.subject} · Grade ${cls.grade}` : undefined;
        } else {
          // assistant
          if (p.collectedByRole !== 'assistant') continue;
          key = p.collectedByUserId;
          label = assistantNamesByUserId?.get(key) ?? `Assistant ${key.slice(0, 6)}`;
        }

        const entry = agg.get(key) ?? { label, cents: 0, payments: 0, students: new Set<string>(), meta };
        entry.cents += p.amountCents;
        entry.payments += 1;
        entry.students.add(p.studentId);
        agg.set(key, entry);
      }

      const out: BreakdownRow[] = [...agg.entries()]
        .map(([key, v]) => ({
          key,
          label: v.label,
          cents: v.cents,
          paymentCount: v.payments,
          studentCount: v.students.size,
          meta: v.meta,
        }))
        .sort((a, b) => b.cents - a.cents);
      setRows(out);
    } catch (e) {
      logger.warn('breakdown failed', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId, month, axis, assistantNamesByUserId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { rows, loading, refresh };
}

// ---------------------------------------------------------------------------
// Breakdown PDF builder
// ---------------------------------------------------------------------------

export function buildBreakdownPdfHtml(params: {
  title: string;
  month: string;
  rows: BreakdownRow[];
}): string {
  const { title, month, rows } = params;
  const total = rows.reduce((a, b) => a + b.cents, 0);
  const fmt = (c: number) =>
    `LKR ${(c / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;

  const rowsHtml = rows.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:24px">No data</td></tr>'
    : rows.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
          <td style="padding:9px 12px">${i + 1}</td>
          <td style="padding:9px 12px">${r.label}${r.meta ? ` <span style="color:#6b7280;font-size:11px">(${r.meta})</span>` : ''}</td>
          <td style="padding:9px 12px;text-align:center">${r.studentCount}</td>
          <td style="padding:9px 12px;text-align:center">${r.paymentCount}</td>
          <td style="padding:9px 12px;text-align:right;font-weight:600">${fmt(r.cents)}</td>
        </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${title} — ${month}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 18px; }
    .total { display: flex; justify-content: space-between; padding: 12px 14px; background: #f3f4f6; border-radius: 8px; margin-bottom: 16px; font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1e40af; color: #fff; padding: 9px 12px; text-align: left; }
    th.r { text-align: right; }
    th.c { text-align: center; }
    td { border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 24px; font-size: 11px; color: #9ca3af; }
  </style></head><body>
  <h1>${title}</h1>
  <div class="meta">Month: ${month} &nbsp;|&nbsp; ${rows.length} rows</div>
  <div class="total"><span>Total collected</span><span>${fmt(total)}</span></div>
  <table>
    <thead><tr><th>#</th><th>Name</th><th class="c">Students</th><th class="c">Payments</th><th class="r">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Generated ${new Date().toLocaleString()}</div>
  </body></html>`;
}
