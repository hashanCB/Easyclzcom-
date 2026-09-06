// Income breakdowns (U43) — class-wise / grade-wise / batch-wise / assistant.
// Each tab sums payments along its axis for the selected month, biggest first.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import {
  useIncomeBreakdown,
  buildBreakdownPdfHtml,
  type BreakdownAxis,
  type BreakdownRow,
} from '../../../lib/reports/hooks';
import { fetchAssistants, type Assistant } from '../../../lib/api/assistants';
import { useScreenTitle } from '../../../lib/ui/header';

const AXES: { key: BreakdownAxis; label: string; icon: keyof typeof Ionicons.glyphMap; title: string }[] = [
  { key: 'class',     label: 'Class',     icon: 'school-outline',    title: 'Class-wise Income' },
  { key: 'grade',     label: 'Grade',     icon: 'layers-outline',    title: 'Grade-wise Income' },
  { key: 'batch',     label: 'Batch',     icon: 'people-outline',    title: 'Batch-wise Income' },
  { key: 'assistant', label: 'Assistant', icon: 'briefcase-outline', title: 'Assistant Collections' },
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y!, (m! - 1) + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMoney(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function getPrint() {
  if (Platform.OS === 'web') return null;
  try { return require('expo-print') as typeof import('expo-print'); }
  catch { return null; }
}

export default function BreakdownsScreen() {
  useScreenTitle('Income Breakdowns');
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';

  const [axis, setAxis] = useState<BreakdownAxis>('class');
  const [month, setMonth] = useState<string>(currentMonth());

  // Assistants — looked up once per session for the names map.
  const [assistantsById, setAssistantsById] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!session?.access_token) return;
    fetchAssistants(session.access_token).then((rows: Assistant[]) => {
      setAssistantsById(new Map(rows.map((a) => [a.id, a.name])));
    }).catch(() => { /* offline OK */ });
  }, [session?.access_token]);

  const { rows, loading, refresh } = useIncomeBreakdown(teacherId, month, axis, assistantsById);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const total = useMemo(() => rows.reduce((a, b) => a + b.cents, 0), [rows]);
  const max = useMemo(() => rows.reduce((m, r) => Math.max(m, r.cents), 0), [rows]);
  const activeAxis = AXES.find((a) => a.key === axis)!;

  async function exportPdf() {
    const print = getPrint();
    if (!print) { Alert.alert('Not supported', 'PDF export is not available on web.'); return; }
    try {
      const html = buildBreakdownPdfHtml({ title: activeAxis.title, month, rows });
      await print.printAsync({ html });
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <Pressable onPress={exportPdf} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="print-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Axis tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {AXES.map((a) => {
            const active = a.key === axis;
            return (
              <Pressable
                key={a.key}
                onPress={() => setAxis(a.key)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons name={a.icon} size={14} color={active ? '#fff' : colors.text} />
                <Text style={[styles.tabText, { color: active ? '#fff' : colors.text }]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Month picker */}
      <View style={[styles.monthRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel(month)}</Text>
        <Pressable
          onPress={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= currentMonth()}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-forward" size={20} color={month >= currentMonth() ? colors.textMuted : colors.text} />
        </Pressable>
      </View>

      {/* Total strip */}
      <View style={[styles.totalStrip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.textMuted }]}>TOTAL · {activeAxis.title.toUpperCase()}</Text>
        <Text style={[styles.totalValue, { color: colors.text }]}>{fmtMoney(total)}</Text>
        <Text style={[styles.totalSub, { color: colors.textMuted }]}>{rows.length} {rows.length === 1 ? 'row' : 'rows'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {axis === 'assistant'
                ? 'No assistant collections this month.'
                : 'No payments recorded this month.'}
            </Text>
          </View>
        ) : (
          rows.map((r, i) => <BreakdownRowCard key={r.key} index={i + 1} row={r} max={max} colors={colors} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BreakdownRowCard({
  index, row, max, colors,
}: {
  index: number;
  row: BreakdownRow;
  max: number;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  const pct = max > 0 ? Math.round((row.cents / max) * 100) : 0;
  return (
    <View style={[rowStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={rowStyles.head}>
        <Text style={[rowStyles.index, { color: colors.textMuted }]}>#{index}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[rowStyles.label, { color: colors.text }]} numberOfLines={1}>{row.label}</Text>
          {row.meta ? <Text style={[rowStyles.meta, { color: colors.textMuted }]}>{row.meta}</Text> : null}
        </View>
        <Text style={[rowStyles.amount, { color: colors.text }]}>{fmtMoney(row.cents)}</Text>
      </View>
      <View style={[rowStyles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[rowStyles.barFill, { backgroundColor: colors.primary, width: `${pct}%` }]} />
      </View>
      <View style={rowStyles.footRow}>
        <Text style={[rowStyles.foot, { color: colors.textMuted }]}>{row.studentCount} students</Text>
        <Text style={[rowStyles.foot, { color: colors.textMuted }]}>{row.paymentCount} payments</Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8, gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  index: { fontSize: 11, fontWeight: '700', width: 24 },
  label: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 1 },
  amount: { fontSize: 14, fontWeight: '700' },
  barTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between' },
  foot: { fontSize: 11, fontWeight: '600' },
});

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 56 },

    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    tabRow: { borderBottomWidth: StyleSheet.hairlineWidth },
    tabScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    tab: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
    },
    tabText: { fontSize: 12, fontWeight: '600' },

    monthRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 8, height: 48, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    monthLabel: { fontSize: 14, fontWeight: '700' },

    totalStrip: {
      marginHorizontal: 16, marginTop: 14, marginBottom: 4,
      paddingHorizontal: 14, paddingVertical: 12,
      borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    },
    totalLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    totalValue: { fontSize: 22, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 },
    totalSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },

    scroll: { padding: 16, paddingBottom: 56 },
    empty: { alignItems: 'center', paddingVertical: 56, gap: 12 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 260 },
  });
}
