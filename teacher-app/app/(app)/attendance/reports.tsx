import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { useAttendanceReport } from '../../../lib/attendance/hooks';
import type { ReportSort } from '../../../lib/attendance/hooks';
import { useScreenTitle } from '../../../lib/ui/header';
import { ClassPicker } from '../../../components/ClassPicker';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
}

function buildMonthOptions(): string[] {
  const result: string[] = [];
  const now = new Date();
  // Step months with integer counters, not date.setMonth(): on the 31st of a
  // month, setMonth() rolls "April 31" forward to May 1, producing a duplicate
  // month key (and a duplicate-React-key crash).
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-11
  for (let i = 0; i < 6; i++) {
    result.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    if (--month < 0) { month = 11; year -= 1; }
  }
  return result;
}

const SORT_OPTS: { key: ReportSort; label: string }[] = [
  { key: 'az',   label: 'A → Z' },
  { key: 'za',   label: 'Z → A' },
  { key: 'high', label: 'High %' },
  { key: 'low',  label: 'Low %' },
];

function pctColor(pct: number, colors: ReturnType<typeof useThemeStore.getState>['colors']): string {
  if (pct >= 80) return '#065f46';
  if (pct >= 50) return '#92400e';
  return colors.danger;
}

export default function AttendanceReportsScreen() {
  useScreenTitle('Attendance Reports');
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';

  const classOptions = useClassOptions(teacherId);
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const [classId, setClassId] = useState('');
  const [month, setMonth]     = useState(currentMonth());
  const [sort, setSort]       = useState<ReportSort>('az');
  const [minAbsentStr, setMinAbsentStr] = useState('');

  const minAbsent = parseInt(minAbsentStr, 10) || 0;

  const filter = useMemo(
    () => ({ classId, month, sort, minAbsent }),
    [classId, month, sort, minAbsent],
  );

  const { stats, loading, refresh } = useAttendanceReport(filter);

  useFocusEffect(React.useCallback(() => { refresh(); }, [refresh]));

  const styles = useMemo(() => buildStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filters}>
        {/* Class */}
        <SectionLabel text="Class" colors={colors} />
        {classOptions.length === 0 ? (
          <Text style={styles.hint}>No active classes found.</Text>
        ) : (
          <View style={{ marginBottom: 12 }}>
            <ClassPicker
              classes={classOptions}
              value={classId || undefined}
              onChange={(id) => setClassId(id ?? '')}
              colors={colors}
              allowAll={false}
              placeholder="Select a class"
              title="Select a class"
            />
          </View>
        )}

        {/* Month */}
        <SectionLabel text="Month" colors={colors} />
        <View style={{ marginBottom: 12 }}>
          <ClassPicker
            classes={monthOptions.map((m) => ({ id: m, label: monthLabel(m) }))}
            value={month}
            onChange={(id) => setMonth(id ?? currentMonth())}
            colors={colors}
            allowAll={false}
            placeholder="Select a month"
            title="Select a month"
          />
        </View>

        {/* Sort + Min absent */}
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <SectionLabel text="Sort by" colors={colors} />
            <View style={styles.chipRow}>
              {SORT_OPTS.map((o) => (
                <Pressable
                  key={o.key}
                  onPress={() => setSort(o.key)}
                  style={({ pressed }) => [styles.chip, sort === o.key && styles.chipActive, pressed && { opacity: 0.85 }]}
                >
                  <Text style={[styles.chipText, sort === o.key && styles.chipTextActive]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.minAbsentBox}>
            <Text style={[styles.minAbsentLabel, { color: colors.textMuted }]}>Min absent</Text>
            <TextInput
              value={minAbsentStr}
              onChangeText={(v) => setMinAbsentStr(v.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={[styles.minAbsentInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
          </View>
        </View>
      </View>

      {/* Results */}
      {!classId ? (
        <View style={styles.emptyState}>
          <Ionicons name="school-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Select a class</Text>
          <Text style={[styles.empty, { color: colors.textMuted }]}>Choose a class above to view the report.</Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyState}>
          <Text style={[styles.empty, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      ) : stats.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-outline" size={48} color={colors.border} />
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {minAbsent > 0
              ? `No students with ${minAbsent}+ absent days in ${monthLabel(month)}.`
              : `No attendance data for ${monthLabel(month)}.`}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.resultHeader}>
            <Text style={[styles.resultCount, { color: colors.text }]}>
              {stats.length} student{stats.length !== 1 ? 's' : ''}
            </Text>
            {stats[0]?.total > 0 && (
              <Text style={[styles.resultCount, { color: colors.textMuted }]}>
                {stats[0].total} session{stats[0].total !== 1 ? 's' : ''} in {monthLabel(month)}
              </Text>
            )}
          </View>
          <FlatList
            data={stats}
            keyExtractor={(s) => s.student.id}
            contentContainerStyle={{ paddingBottom: 32 }}
            renderItem={({ item }) => {
              const pct = item.percentage;
              const clr = pctColor(pct, colors);
              return (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.student.name}</Text>
                      <Text style={[styles.cardCode, { color: colors.textMuted }]}>{item.student.studentCode}</Text>
                    </View>
                    <View style={[styles.pctBadge, { backgroundColor: clr + '18', borderColor: clr }]}>
                      <Text style={[styles.pctText, { color: clr }]}>{pct}%</Text>
                    </View>
                  </View>
                  <View style={styles.statRow}>
                    <StatChip label="Present" count={item.present} color="#065f46" bg="#d1fae5" />
                    <StatChip label="Late"    count={item.late}    color="#92400e" bg="#fef3c7" />
                    <StatChip label="Absent"  count={item.absent}  color="#991b1b" bg="#fee2e2" />
                    {item.total > 0 && (
                      <StatChip
                        label="Unmarked"
                        count={Math.max(0, item.total - item.present - item.late - item.absent)}
                        color={colors.textMuted}
                        bg={colors.surfaceAlt}
                      />
                    )}
                  </View>
                </View>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

function SectionLabel({ text, colors }: { text: string; colors: ReturnType<typeof useThemeStore.getState>['colors'] }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
      {text}
    </Text>
  );
}

function StatChip({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: bg }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color }}>{count}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color, textTransform: 'uppercase', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

    filters: { paddingHorizontal: 16, paddingTop: 14 },
    hint: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10, gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    chipText: { fontSize: 12, color: colors.text },
    chipTextActive: { color: colors.primaryText, fontWeight: '600' },

    filterRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
    minAbsentBox: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10, paddingLeft: 8 },
    minAbsentLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    minAbsentInput: {
      width: 64,
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
    },

    resultHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    resultCount: { fontSize: 13, fontWeight: '600' },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 64 },
    emptyTitle: { fontSize: 16, fontWeight: '700' },
    empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, paddingHorizontal: 32 },

    card: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 14,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    cardName: { fontSize: 15, fontWeight: '700' },
    cardCode: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
    pctBadge: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
    pctText: { fontSize: 15, fontWeight: '800' },
    statRow: { flexDirection: 'row', gap: 8 },
  });
}
