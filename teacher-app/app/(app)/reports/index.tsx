import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import {
  useDashboardStats,
  useMonthlyIncome,
  buildUnpaidPdfHtml,
  buildAttendancePdfHtml,
} from '../../../lib/reports/hooks';
import { buildPaymentsCsv, buildAttendanceCsv, buildUnpaidCsv, shareCsv } from '../../../lib/reports/csv';
import { useAttendanceReport } from '../../../lib/attendance/hooks';
import { useStudentsList, useStudentsMap } from '../../../lib/students/hooks';
import { usePaymentsList, useDiscountSummary } from '../../../lib/payments/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { useScreenTitle } from '../../../lib/ui/header';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function formatMoney(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function getPrint() {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-print') as typeof import('expo-print');
  } catch { return null; }
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y!, (m! - 1) + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))].sort();
}

export default function ReportsDashboardScreen() {
  useScreenTitle('Reports');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';

  const classOptions = useClassOptions(teacherId);

  // Month selector — defaults to current month, can navigate ±1
  const [month, setMonth] = useState(currentMonth());
  const isCurrentMonth = month === currentMonth();

  // Demographic filter chips (derived from classOptions)
  const [selGrade,    setGrade]    = useState('');
  const [selBatch,    setBatch]    = useState('');
  const [selSubject,  setSubject]  = useState('');
  const [selLang,     setLang]     = useState('');

  // Derived unique values
  const grades    = unique(classOptions.map((c) => c.grade));
  const batches   = unique(classOptions.map((c) => c.batch));
  const subjects  = unique(classOptions.map((c) => c.subject));
  const languages = unique(classOptions.map((c) => c.language));

  // Filter class list by demographic chips
  const filteredClasses = classOptions.filter((c) =>
    (!selGrade   || c.grade    === selGrade)   &&
    (!selBatch   || c.batch    === selBatch)    &&
    (!selSubject || c.subject  === selSubject)  &&
    (!selLang    || c.language === selLang),
  );

  // Class chip selection (within filtered set)
  const [selectedClass, setSelectedClass] = useState('');
  // If the current selectedClass is no longer in the filtered set, clear it
  const effectiveClass = filteredClasses.some((c) => c.id === selectedClass)
    ? selectedClass
    : '';

  const { stats, loading, refresh } = useDashboardStats(teacherId, effectiveClass || undefined, month);
  const { rows: monthlyRows } = useMonthlyIncome(teacherId, effectiveClass || undefined, 12);
  // Money given away each month: free cards (full waiver) + offers (partial discount).
  const discounts = useDiscountSummary(teacherId, effectiveClass || undefined);

  // For PDF exports
  const attendanceFilter = useMemo(
    () => ({ classId: effectiveClass, month, sort: 'az' as const, minAbsent: 0 }),
    [effectiveClass, month],
  );
  const { stats: attendanceStats } = useAttendanceReport(attendanceFilter);

  const unpaidStudents = useStudentsList(
    useMemo(() => ({ teacherId, classId: effectiveClass || undefined, status: 'active' as const }), [teacherId, effectiveClass]),
  );

  // Payments for CSV export — same month + class filter as the stats
  const paymentFilter = useMemo(
    () => ({ teacherId, classId: effectiveClass || undefined, fromMonth: month, toMonth: month }),
    [teacherId, effectiveClass, month],
  );
  const { payments: paymentsForExport } = usePaymentsList(paymentFilter);
  const studentsMapForExport = useStudentsMap(teacherId);

  useFocusEffect(React.useCallback(() => { refresh(); }, [refresh]));

  // Reset class selection when demographic filters change
  React.useEffect(() => { setSelectedClass(''); }, [selGrade, selBatch, selSubject, selLang]);

  const classLabel = effectiveClass
    ? (classOptions.find((c) => c.id === effectiveClass)?.label ?? effectiveClass)
    : 'All Classes';

  async function exportUnpaidPdf() {
    const print = getPrint();
    if (!print) { Alert.alert('Not supported', 'PDF export is not available on web.'); return; }
    if (!selectedClass) { Alert.alert('Select a class', 'Please select a class to export unpaid students.'); return; }

    try {
      const rows = unpaidStudents.students.map((s) => ({
        name: s.name,
        studentCode: s.studentCode,
        classLabel,
      }));
      const html = buildUnpaidPdfHtml({ teacherId, classLabel, month, rows });
      await print.printAsync({ html });
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  async function exportAttendancePdf() {
    const print = getPrint();
    if (!print) { Alert.alert('Not supported', 'PDF export is not available on web.'); return; }
    if (!selectedClass) { Alert.alert('Select a class', 'Please select a class to export attendance.'); return; }

    try {
      const rows = attendanceStats.map((s) => ({
        name: s.student.name,
        studentCode: s.student.studentCode,
        present: s.present,
        late: s.late,
        absent: s.absent,
        total: s.total,
        pct: s.percentage,
      }));
      const html = buildAttendancePdfHtml({ classLabel, month, rows });
      await print.printAsync({ html });
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  async function exportPaymentsCsv() {
    if (!selectedClass) { Alert.alert('Select a class', 'Please select a class to export payments.'); return; }
    try {
      const rows = paymentsForExport.map((p) => {
        const s = studentsMapForExport.get(p.studentId);
        return {
          studentName: s?.name ?? '—',
          studentCode: s?.studentCode ?? p.studentId.slice(0, 8),
          classLabel,
          month: p.month,
          amountLkr: p.amountCents / 100,
          status: p.status,
          method: p.method.replace('_', ' '),
          collectedAt: p.collectedAt.slice(0, 10),
          remark: p.remark,
        };
      });
      const csv = buildPaymentsCsv({ classLabel, month, rows });
      const filename = `payments-${classLabel.replace(/[^a-zA-Z0-9]/g, '_')}-${month}.csv`;
      await shareCsv(csv, filename);
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  async function exportAttendanceCsv() {
    if (!selectedClass) { Alert.alert('Select a class', 'Please select a class to export attendance.'); return; }
    try {
      const rows = attendanceStats.map((s) => ({
        name: s.student.name,
        studentCode: s.student.studentCode,
        present: s.present,
        late: s.late,
        absent: s.absent,
        total: s.total,
        pct: s.percentage,
      }));
      const csv = buildAttendanceCsv({ classLabel, month, rows });
      const filename = `attendance-${classLabel.replace(/[^a-zA-Z0-9]/g, '_')}-${month}.csv`;
      await shareCsv(csv, filename);
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  async function exportUnpaidCsv() {
    if (!selectedClass) { Alert.alert('Select a class', 'Please select a class to export unpaid students.'); return; }
    try {
      const rows = unpaidStudents.students.map((s) => ({
        name: s.name,
        studentCode: s.studentCode,
        classLabel,
      }));
      const csv = buildUnpaidCsv({ classLabel, month, rows });
      const filename = `unpaid-${classLabel.replace(/[^a-zA-Z0-9]/g, '_')}-${month}.csv`;
      await shareCsv(csv, filename);
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  const styles = useMemo(() => buildStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Month picker */}
      <View style={[styles.monthRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={10} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel(month)}</Text>
        <Pressable
          onPress={() => !isCurrentMonth && setMonth((m) => shiftMonth(m, 1))}
          hitSlop={10}
          style={[styles.monthArrow, isCurrentMonth && { opacity: 0.3 }]}
          disabled={isCurrentMonth}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Demographic filter rails (only shown when >1 unique value) */}
        {grades.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>GRADE</Text>
            <View style={{ marginBottom: 10 }}>
              <ClassPicker
                classes={grades.map((g) => ({ id: g, label: `Grade ${g}` }))}
                value={selGrade || undefined}
                onChange={(id) => setGrade(id ?? '')}
                colors={colors}
                allLabel="All grades"
                placeholder="All grades"
                title="Filter by grade"
              />
            </View>
          </>
        )}
        {subjects.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>SUBJECT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              <Chip label="All" active={selSubject === ''} onPress={() => setSubject('')} colors={colors} />
              {subjects.map((s) => <Chip key={s} label={s} active={selSubject === s} onPress={() => setSubject(s === selSubject ? '' : s)} colors={colors} />)}
            </ScrollView>
          </>
        )}
        {batches.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>BATCH</Text>
            <View style={{ marginBottom: 10 }}>
              <ClassPicker
                classes={batches.map((b) => ({ id: b, label: b }))}
                value={selBatch || undefined}
                onChange={(id) => setBatch(id ?? '')}
                colors={colors}
                allLabel="All batches"
                placeholder="All batches"
                title="Filter by batch"
              />
            </View>
          </>
        )}
        {languages.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>LANGUAGE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              <Chip label="All" active={selLang === ''} onPress={() => setLang('')} colors={colors} />
              {languages.map((l) => <Chip key={l} label={l} active={selLang === l} onPress={() => setLang(l === selLang ? '' : l)} colors={colors} />)}
            </ScrollView>
          </>
        )}

        {/* Class selector (filtered by demographic selection above) */}
        <Text style={styles.sectionLabel}>CLASS</Text>
        <View style={{ marginBottom: 20 }}>
          <ClassPicker
            classes={filteredClasses}
            value={effectiveClass || undefined}
            onChange={(id) => setSelectedClass(id ?? '')}
            colors={colors}
            allLabel="All Classes"
            title="Select a class"
          />
        </View>

        {/* Dashboard cards */}
        <Text style={styles.sectionLabel}>THIS MONTH</Text>
        {loading ? (
          <View style={[styles.loadingBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Loading stats…</Text>
          </View>
        ) : !stats ? (
          <View style={[styles.loadingBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>No data available on this platform.</Text>
          </View>
        ) : (
          <>
            {/* Row 1 — Money */}
            <View style={styles.cardRow}>
              <StatCard
                icon="cash-outline"
                label="Total Collected"
                value={formatMoney(stats.totalCents)}
                accent="#059669"
                accentBg="#ecfdf5"
                colors={colors}
                style={{ flex: 1 }}
              />
              <StatCard
                icon="today-outline"
                label="Today's Collections"
                value={formatMoney(stats.todayCents)}
                accent="#4f46e5"
                accentBg="#eef2ff"
                colors={colors}
                style={{ flex: 1 }}
              />
            </View>

            {/* Row 2 — Pending + Exam performance */}
            <View style={styles.cardRow}>
              <StatCard
                icon="hourglass-outline"
                label="Pending Earnings"
                value={formatMoney(stats.pendingCents)}
                accent="#b45309"
                accentBg="#fef3c7"
                colors={colors}
                style={{ flex: 1 }}
              />
              <StatCard
                icon="podium-outline"
                label={stats.examCount > 0 ? `Exam Avg (last 3m, ${stats.examCount})` : 'Exam Avg (3m)'}
                value={stats.examCount > 0 ? `${stats.examAvgPct}%` : '—'}
                accent="#a855f7"
                accentBg="#faf5ff"
                colors={colors}
                style={{ flex: 1 }}
              />
            </View>

            {/* Row 3 — Students */}
            <View style={styles.cardRow}>
              <StatCard
                icon="people-outline"
                label="Total Students"
                value={String(stats.totalStudents)}
                accent="#0891b2"
                accentBg="#ecfeff"
                colors={colors}
                style={{ flex: 1 }}
              />
              <StatCard
                icon="checkmark-circle-outline"
                label="Paid"
                value={String(stats.paidCount)}
                accent="#059669"
                accentBg="#ecfdf5"
                colors={colors}
                style={{ flex: 1 }}
              />
              <StatCard
                icon="alert-circle-outline"
                label="Unpaid"
                value={String(stats.unpaidCount)}
                accent="#dc2626"
                accentBg="#fef2f2"
                colors={colors}
                style={{ flex: 1 }}
              />
            </View>

            {/* Row 3b — Free cards & discounts given (per month) */}
            {discounts && (discounts.freeCount > 0 || discounts.discountCount > 0) ? (
              <View style={styles.cardRow}>
                <StatCard
                  icon="gift-outline"
                  label="Free Cards"
                  value={String(discounts.freeCount)}
                  accent="#059669"
                  accentBg="#ecfdf5"
                  colors={colors}
                  style={{ flex: 1 }}
                />
                <StatCard
                  icon="pricetag-outline"
                  label="Given Away / mo"
                  value={formatMoney(discounts.totalGivenCents)}
                  accent="#0d9488"
                  accentBg="#f0fdfa"
                  colors={colors}
                  style={{ flex: 1 }}
                />
              </View>
            ) : null}

            {/* Row 4 — Attendance today */}
            <Text style={styles.sectionLabel}>TODAY'S ATTENDANCE</Text>
            <View style={styles.cardRow}>
              <StatCard
                icon="checkbox-outline"
                label="Present"
                value={String(stats.presentToday)}
                accent="#059669"
                accentBg="#ecfdf5"
                colors={colors}
                style={{ flex: 1 }}
              />
              <StatCard
                icon="time-outline"
                label="Late"
                value={String(stats.lateToday)}
                accent="#d97706"
                accentBg="#fffbeb"
                colors={colors}
                style={{ flex: 1 }}
              />
              <StatCard
                icon="close-circle-outline"
                label="Absent"
                value={String(stats.absentToday)}
                accent="#dc2626"
                accentBg="#fef2f2"
                colors={colors}
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}

        {/* Monthly income bars (last 12 months) */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>MONTHLY INCOME (12M)</Text>
        <MonthlyIncomeStrip rows={monthlyRows} colors={colors} />

        {/* CSV / Excel Export */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>EXPORT EXCEL / CSV</Text>
        <View style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ExportRow
            icon="card-outline"
            label="Payments — Excel / CSV"
            sub={`${classLabel} · ${monthLabel(month)}`}
            colors={colors}
            onPress={exportPaymentsCsv}
            badge="CSV"
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ExportRow
            icon="checkbox-outline"
            label="Attendance — Excel / CSV"
            sub={`${classLabel} · ${monthLabel(month)}`}
            colors={colors}
            onPress={exportAttendanceCsv}
            badge="CSV"
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ExportRow
            icon="people-outline"
            label="Unpaid Students — Excel / CSV"
            sub={`${classLabel} · ${monthLabel(month)}`}
            colors={colors}
            onPress={exportUnpaidCsv}
            badge="CSV"
          />
        </View>

        {/* PDF Export */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>EXPORT PDF</Text>
        <View style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ExportRow
            icon="people-outline"
            label="Unpaid Students Report"
            sub={`${classLabel} · ${monthLabel(month)}`}
            colors={colors}
            onPress={exportUnpaidPdf}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ExportRow
            icon="checkbox-outline"
            label="Attendance Report"
            sub={`${classLabel} · ${monthLabel(month)}`}
            colors={colors}
            onPress={exportAttendancePdf}
          />
        </View>

        {/* Quick nav */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>DETAILED VIEWS</Text>
        <View style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ExportRow
            icon="pie-chart-outline"
            label="Income Breakdowns"
            sub="Class / Grade / Batch / Assistant"
            colors={colors}
            onPress={() => router.push('/(app)/reports/breakdowns' as never)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ExportRow
            icon="card-outline"
            label="Payment History"
            sub="Filter by class, month, status"
            colors={colors}
            onPress={() => router.push('/(app)/payments' as never)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ExportRow
            icon="bar-chart-outline"
            label="Attendance Reports"
            sub="Per-student stats with % badge"
            colors={colors}
            onPress={() => router.push('/(app)/attendance/reports' as never)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ExportRow
            icon="warning-outline"
            label="Unpaid Students"
            sub="Quick payment recording"
            colors={colors}
            onPress={() => router.push('/(app)/payments/unpaid' as never)}
          />
        </View>

      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MonthlyIncomeStrip({
  rows,
  colors,
}: {
  rows: { month: string; label: string; cents: number }[];
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.cents), 0);
  const total = rows.reduce((a, b) => a + b.cents, 0);
  const avg = rows.length ? total / rows.length : 0;
  return (
    <View style={[stripStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={stripStyles.barRow}>
        {rows.map((r) => {
          const h = max > 0 ? Math.max(2, Math.round((r.cents / max) * 56)) : 2;
          return (
            <View key={r.month} style={stripStyles.barCol}>
              <View style={[stripStyles.bar, { height: h, backgroundColor: colors.primary }]} />
              <Text style={[stripStyles.barLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {r.label.split(' ')[0]}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={[stripStyles.footer, { borderTopColor: colors.border }]}>
        <View>
          <Text style={[stripStyles.footLabel, { color: colors.textMuted }]}>12M TOTAL</Text>
          <Text style={[stripStyles.footValue, { color: colors.text }]}>
            LKR {(total / 100).toLocaleString('en-LK', { minimumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[stripStyles.footLabel, { color: colors.textMuted }]}>AVG / MONTH</Text>
          <Text style={[stripStyles.footValue, { color: colors.text }]}>
            LKR {(avg / 100).toLocaleString('en-LK', { minimumFractionDigits: 0 })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const stripStyles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, marginBottom: 16 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 72 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '70%', borderRadius: 3, minHeight: 2 },
  barLabel: { fontSize: 9, fontWeight: '600' },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  footLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  footValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
});

function StatCard({
  icon, label, value, accent, accentBg, colors, style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent: string;
  accentBg: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  style?: object;
}) {
  const iconBg = colors.bg === '#f8fafc' || colors.bg === '#f3f4f6' ? accentBg : accent + '22';
  return (
    <View style={[{ backgroundColor: colors.surface, borderColor: colors.border }, cardStyles.card, style]}>
      <View style={[cardStyles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={[cardStyles.value, { color: colors.text }]}>{value}</Text>
      <Text style={[cardStyles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-start',
    gap: 6,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
});

function ExportRow({
  icon, label, sub, colors, onPress, badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        exportRowStyles.row,
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.primary} style={{ marginRight: 4 }} />
      <View style={{ flex: 1 }}>
        <Text style={[exportRowStyles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[exportRowStyles.sub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      {badge && (
        <View style={[exportRowStyles.badge, { backgroundColor: '#059669' + '18', borderColor: '#059669' + '40' }]}>
          <Text style={[exportRowStyles.badgeText, { color: '#059669' }]}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const exportRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 56,
  },
  label: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 1 },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
});

function Chip({
  label, active, onPress, colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.chip,
        { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[chipStyles.label, { color: active ? colors.primaryText : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: '500' },
});

// ── Page styles ───────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 52,
      paddingBottom: 12,
      backgroundColor: colors.bg,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    monthArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    monthLabel: { fontSize: 15, fontWeight: '700' },
    scroll: { paddingHorizontal: 16, paddingBottom: 48 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 10,
      paddingLeft: 2,
    },
    cardRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    loadingBox: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
    },
    exportCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 16,
    },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  });
}
