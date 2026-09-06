// Exam report computation (U42) — pure helpers + PDF HTML builders.
// Used by the per-exam report screen and the per-student exam-history card.
import type { Exam, Mark, Student } from '../../db/schema';

// ── Per-exam report ──────────────────────────────────────────────────────────

export interface ExamRankRow {
  student: Student;
  mark: number | null; // null = not entered yet
  pct: number | null;
  rank: number | null; // null = not ranked (no mark)
}

export interface ExamReportStats {
  classAvg: number;     // average mark of entered students (0 if none)
  classAvgPct: number;  // same, as % of total
  highest: number;      // 0 if none
  lowest: number;       // 0 if none
  entered: number;
  total: number;        // total students in class
}

export interface ExamReport {
  rows: ExamRankRow[];
  stats: ExamReportStats;
}

// Rank by mark descending, ties share rank, "1224" ranking.
// Students without a mark sort to the bottom and get rank=null.
export function computeExamReport(
  exam: Exam,
  students: Student[],
  marksByStudentId: Map<string, Mark>,
): ExamReport {
  const totalMarks = exam.totalMarks;

  const withMark: { student: Student; mark: number }[] = [];
  const withoutMark: Student[] = [];
  for (const s of students) {
    const m = marksByStudentId.get(s.id);
    if (m && typeof m.mark === 'number') withMark.push({ student: s, mark: m.mark });
    else withoutMark.push(s);
  }

  withMark.sort((a, b) => b.mark - a.mark);

  const rows: ExamRankRow[] = [];
  let lastMark: number | null = null;
  let lastRank = 0;
  withMark.forEach((entry, idx) => {
    const rank = lastMark === entry.mark ? lastRank : idx + 1;
    rows.push({
      student: entry.student,
      mark: entry.mark,
      pct: totalMarks > 0 ? Math.round((entry.mark / totalMarks) * 1000) / 10 : 0,
      rank,
    });
    lastMark = entry.mark;
    lastRank = rank;
  });

  for (const s of withoutMark) {
    rows.push({ student: s, mark: null, pct: null, rank: null });
  }

  const enteredMarks = withMark.map((w) => w.mark);
  const sum = enteredMarks.reduce((a, b) => a + b, 0);
  const stats: ExamReportStats = {
    classAvg: enteredMarks.length ? Math.round((sum / enteredMarks.length) * 10) / 10 : 0,
    classAvgPct:
      enteredMarks.length && totalMarks > 0
        ? Math.round((sum / enteredMarks.length / totalMarks) * 1000) / 10
        : 0,
    highest: enteredMarks.length ? Math.max(...enteredMarks) : 0,
    lowest: enteredMarks.length ? Math.min(...enteredMarks) : 0,
    entered: enteredMarks.length,
    total: students.length,
  };

  return { rows, stats };
}

// ── Per-student trend ────────────────────────────────────────────────────────

export interface StudentExamHistoryItem {
  exam: Exam;
  mark: number;
  pct: number;
  classAvg: number;
  classAvgPct: number;
  rank: number | null;
  classSize: number;
}

export interface StudentTrend {
  items: StudentExamHistoryItem[]; // newest first
  averagePct: number;              // average % across items
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Builds history rows for a student across the supplied exams.
// `classMarksByExam` must contain ALL marks for each exam (used to compute rank + class avg).
export function computeStudentExamHistory(
  studentId: string,
  exams: Exam[],
  classMarksByExam: Map<string, Mark[]>,
): StudentExamHistoryItem[] {
  const items: StudentExamHistoryItem[] = [];
  for (const exam of exams) {
    const marks = classMarksByExam.get(exam.id) ?? [];
    const mine = marks.find((m) => m.studentId === studentId);
    if (!mine) continue;

    const others = marks
      .map((m) => m.mark)
      .filter((n): n is number => typeof n === 'number');
    const classSize = others.length;
    const classAvg = classSize ? Math.round((others.reduce((a, b) => a + b, 0) / classSize) * 10) / 10 : 0;
    const classAvgPct =
      classSize && exam.totalMarks > 0
        ? Math.round((classAvg / exam.totalMarks) * 1000) / 10
        : 0;
    const pct = exam.totalMarks > 0 ? Math.round((mine.mark / exam.totalMarks) * 1000) / 10 : 0;

    // Rank within class for this exam (1224, descending mark).
    const sorted = [...others].sort((a, b) => b - a);
    let rank: number | null = null;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] === mine.mark) {
        // first index of this mark in sorted array
        rank = i + 1;
        break;
      }
    }

    items.push({ exam, mark: mine.mark, pct, classAvg, classAvgPct, rank, classSize });
  }

  // newest first (by exam date desc, then createdAt desc)
  items.sort((a, b) => {
    if (a.exam.examDate !== b.exam.examDate) return a.exam.examDate < b.exam.examDate ? 1 : -1;
    return a.exam.createdAt < b.exam.createdAt ? 1 : -1;
  });
  return items;
}

export function filterTrendByMonths(items: StudentExamHistoryItem[], months: 3 | 6): StudentTrend {
  const cutoff = monthsAgoIso(months);
  const filtered = items.filter((i) => i.exam.examDate >= cutoff);
  const sum = filtered.reduce((a, b) => a + b.pct, 0);
  const averagePct = filtered.length ? Math.round((sum / filtered.length) * 10) / 10 : 0;
  return { items: filtered, averagePct };
}

// ── PDF HTML builders ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildExamReportPdfHtml(params: {
  exam: Exam;
  classLabel: string;
  report: ExamReport;
}): string {
  const { exam, classLabel, report } = params;
  const { rows, stats } = report;

  const rowsHtml = rows.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:24px">No students in this class</td></tr>'
    : rows.map((r, i) => {
        const bg = i % 2 === 0 ? '#fff' : '#f9fafb';
        const markCell = r.mark === null
          ? '<span style="color:#9ca3af">—</span>'
          : `<b>${r.mark}</b>`;
        const pctCell = r.pct === null
          ? '<span style="color:#9ca3af">—</span>'
          : `${r.pct}%`;
        const rankCell = r.rank === null
          ? '<span style="color:#9ca3af">—</span>'
          : `#${r.rank}`;
        return `<tr style="background:${bg}">
          <td style="padding:9px 12px">${rankCell}</td>
          <td style="padding:9px 12px;font-family:monospace">${escapeHtml(r.student.studentCode)}</td>
          <td style="padding:9px 12px">${escapeHtml(r.student.name)}</td>
          <td style="padding:9px 12px;text-align:center">${markCell}</td>
          <td style="padding:9px 12px;text-align:center">${pctCell}</td>
          <td style="padding:9px 12px;text-align:center;color:#6b7280">${exam.totalMarks}</td>
        </tr>`;
      }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Exam Report — ${escapeHtml(exam.title)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 18px; }
    .stats { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    .stat { flex: 1; min-width: 110px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
    .stat .l { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .4px; }
    .stat .v { font-size: 18px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1e40af; color: #fff; padding: 9px 12px; text-align: left; }
    td { border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 24px; font-size: 11px; color: #9ca3af; }
  </style></head><body>
  <h1>${escapeHtml(exam.title)}</h1>
  <div class="meta">${escapeHtml(classLabel)} &nbsp;|&nbsp; ${exam.examDate} &nbsp;|&nbsp; Out of ${exam.totalMarks}</div>

  <div class="stats">
    <div class="stat"><div class="l">Class Average</div><div class="v">${stats.classAvg} <span style="font-size:12px;color:#6b7280">(${stats.classAvgPct}%)</span></div></div>
    <div class="stat"><div class="l">Highest</div><div class="v">${stats.highest}</div></div>
    <div class="stat"><div class="l">Lowest</div><div class="v">${stats.lowest}</div></div>
    <div class="stat"><div class="l">Entered</div><div class="v">${stats.entered}/${stats.total}</div></div>
  </div>

  <table>
    <thead><tr><th>Rank</th><th>Student ID</th><th>Name</th><th>Mark</th><th>%</th><th>Total</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Generated ${new Date().toLocaleString()}</div>
  </body></html>`;
}
