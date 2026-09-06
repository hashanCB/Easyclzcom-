// Teacher's per-assistant activity report. Pick a date range; see cash collected
// (confirmed / pending / flagged), students registered, and attendance marked.
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useScreenTitle } from '../../../lib/ui/header';
import { MonthPickerModal } from '../../../components/MonthPickerModal';
import { fetchAssistantActivity, type AssistantActivity } from '../../../lib/api/assistantActivity';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// First day of a YYYY-MM month.
function monthStartDate(ym: string): string {
  return `${ym}-01`;
}
// Last day of a YYYY-MM month (handles 28/29/30/31).
function monthEndDate(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, '0')}`;
}

function money(cents: number): string {
  return `Rs ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

export default function AssistantActivityScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  useScreenTitle(name || 'Activity');
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token ?? '');

  const thisMonth = currentMonth();
  const [fromMonth, setFromMonth] = useState(thisMonth);
  const [toMonth, setToMonth] = useState(thisMonth);
  const [data, setData] = useState<AssistantActivity | null>(null);
  const [loading, setLoading] = useState(true);

  const from = useMemo(() => monthStartDate(fromMonth), [fromMonth]);
  const to = useMemo(() => monthEndDate(toMonth), [toMonth]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchAssistantActivity(id ?? '', token, from, to).then((r) => {
      if (live) { setData(r); setLoading(false); }
    });
    return () => { live = false; };
  }, [id, token, from, to]);

  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>
      {/* Date range (From / To month pickers — same as Payments) */}
      <View style={styles.rangeFields}>
        <View style={{ flex: 1 }}>
          <MonthPickerModal
            label="From"
            value={fromMonth}
            onChange={(ym) => { setFromMonth(ym); if (ym > toMonth) setToMonth(ym); }}
            maxMonth={thisMonth}
          />
        </View>
        <View style={styles.rangeArrow}>
          <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <MonthPickerModal
            label="To"
            value={toMonth}
            onChange={(ym) => { setToMonth(ym); if (ym < fromMonth) setFromMonth(ym); }}
            minMonth={fromMonth}
            maxMonth={thisMonth}
          />
        </View>
      </View>

      {loading || !data ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Cash */}
          <Text style={[styles.section, { color: colors.textMuted }]}>CASH COLLECTED</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Big label="Confirmed (in your books)" value={money(data.cashConfirmedCents)} sub={`${data.cashConfirmedCount} payment${data.cashConfirmedCount === 1 ? '' : 's'}`} accent="#059669" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row label="Pending hand-over" value={money(data.cashPendingCents)} hint={`${data.cashPendingCount}`} colors={colors} />
            {data.cashRejectedCents > 0 && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Row label="Flagged (not recorded)" value={money(data.cashRejectedCents)} colors={colors} danger />
              </>
            )}
          </View>

          {/* Students */}
          <Text style={[styles.section, { color: colors.textMuted }]}>STUDENTS REGISTERED</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Big label="Added to roster" value={String(data.studentsAdded)} accent={colors.primary} colors={colors} />
          </View>

          {/* Attendance */}
          <Text style={[styles.section, { color: colors.textMuted }]}>ATTENDANCE MARKED</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Big label="Total marked" value={String(data.attendanceTotal)} accent="#0ea5e9" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row label="Present" value={String(data.attendancePresent)} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row label="Late" value={String(data.attendanceLate)} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row label="Absent" value={String(data.attendanceAbsent)} colors={colors} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Big({ label, value, sub, accent, colors }: { label: string; value: string; sub?: string; accent: string; colors: ReturnType<typeof useThemeStore.getState>['colors'] }) {
  return (
    <View style={s.bigWrap}>
      <Text style={[s.bigLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.bigValue, { color: accent }]}>{value}</Text>
      {!!sub && <Text style={[s.bigSub, { color: colors.textMuted }]}>{sub}</Text>}
    </View>
  );
}
function Row({ label, value, hint, danger, colors }: { label: string; value: string; hint?: string; danger?: boolean; colors: ReturnType<typeof useThemeStore.getState>['colors'] }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: danger ? '#dc2626' : colors.text }]}>{label}</Text>
      <Text style={[s.rowValue, { color: danger ? '#dc2626' : colors.text }]}>{value}{hint ? `  (${hint})` : ''}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bigWrap: { padding: 16 },
  bigLabel: { fontSize: 12, fontWeight: '600' },
  bigValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  bigSub: { fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 15, fontWeight: '700' },
});

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    rangeFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    rangeArrow: { paddingBottom: 10 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    scroll: { padding: 16, paddingBottom: 64 },
    section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginTop: 6 },
    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginBottom: 18, overflow: 'hidden' },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  });
}
