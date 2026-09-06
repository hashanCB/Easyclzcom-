import { Platform } from 'react-native';

// Escape a CSV cell: wrap in quotes if it contains comma, quote, or newline.
function cell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(',');
}

// ─── Report builders ──────────────────────────────────────────────────────────

export function buildPaymentsCsv(params: {
  classLabel: string;
  month: string;
  rows: {
    studentName: string;
    studentCode: string;
    classLabel: string;
    month: string;
    amountLkr: number;
    status: string;
    method: string;
    collectedAt: string;
    remark: string | null;
  }[];
}): string {
  const { classLabel, month, rows } = params;
  const header = row(['Student Name', 'Student ID', 'Class', 'Month', 'Amount (LKR)', 'Status', 'Method', 'Date', 'Remark']);
  const meta = `# Payments Report — ${classLabel} · ${month}`;
  const dataRows = rows.map((r) =>
    row([r.studentName, r.studentCode, r.classLabel, r.month, r.amountLkr, r.status, r.method, r.collectedAt, r.remark ?? '']),
  );
  const total = rows.reduce((s, r) => s + r.amountLkr, 0);
  const totalRow = row(['', '', '', 'TOTAL', total, '', '', '', '']);
  return [meta, header, ...dataRows, totalRow].join('\n');
}

export function buildAttendanceCsv(params: {
  classLabel: string;
  month: string;
  rows: {
    name: string;
    studentCode: string;
    present: number;
    late: number;
    absent: number;
    total: number;
    pct: number;
  }[];
}): string {
  const { classLabel, month, rows } = params;
  const header = row(['Student Name', 'Student ID', 'Present', 'Late', 'Absent', 'Total Sessions', 'Attendance %']);
  const meta = `# Attendance Report — ${classLabel} · ${month}`;
  const dataRows = rows.map((r) =>
    row([r.name, r.studentCode, r.present, r.late, r.absent, r.total, `${r.pct}%`]),
  );
  return [meta, header, ...dataRows].join('\n');
}

export function buildUnpaidCsv(params: {
  classLabel: string;
  month: string;
  rows: { name: string; studentCode: string; classLabel: string }[];
}): string {
  const { classLabel, month, rows } = params;
  const header = row(['Student Name', 'Student ID', 'Class']);
  const meta = `# Unpaid Students — ${classLabel} · ${month}`;
  const dataRows = rows.map((r) => row([r.name, r.studentCode, r.classLabel]));
  return [meta, header, ...dataRows].join('\n');
}

// ─── Share helper ─────────────────────────────────────────────────────────────

export async function shareCsv(csvContent: string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('CSV export is not available on web.');
  }

  const fs = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const sharing = require('expo-sharing') as typeof import('expo-sharing');

  const path = `${fs.cacheDirectory}${filename}`;
  await fs.writeAsStringAsync(path, csvContent, { encoding: fs.EncodingType.UTF8 });

  const canShare = await sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');

  await sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: filename,
    UTI: 'public.comma-separated-values-text',
  });
}
