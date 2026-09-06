// Daily session summary — shows attendance breakdown + payments collected today for this class.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAssistantStore } from '../../lib/assistant/store';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../../lib/theme/store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';
import { hydrateWorkingSet } from '../../lib/assistant/workingSet';
import { readCashSummary, writeCashSummary, type CashSummary } from '../../lib/assistant/cashCache';
import { useOutboxStore } from '../../lib/assistant/outbox';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AttendanceRow {
  student_id: string;
  status: 'present' | 'late' | 'absent';
  name: string;
  student_code: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMoney(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function statusColor(status: string): { bg: string; text: string; icon: string } {
  if (status === 'present') return { bg: '#d1fae5', text: '#059669', icon: 'checkmark-circle' };
  if (status === 'late') return { bg: '#fef3c7', text: '#d97706', icon: 'time' };
  return { bg: '#fee2e2', text: '#dc2626', icon: 'close-circle' };
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SummaryScreen() {
  const { classId, teacherId } = useLocalSearchParams<{ classId: string; teacherId: string }>();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { session, permissions } = useAssistantStore(useShallow((s) => ({
    session: s.session,
    permissions: s.permissions,
  })));

  const token = session?.access_token ?? '';
  const me = session?.user?.id ?? '';
  const perm = permissions.find((p) => p.class_id === classId);
  const canPayment = perm?.permission === 'payment' || perm?.permission === 'both';
  const outboxItems = useOutboxStore((s) => s.items);

  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [cash, setCash] = useState<CashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const today = todayIso();

    // Attendance + student names come from the working set, which is offline-safe
    // (hydrate refreshes from the server when online, else returns the last sync).
    try {
      const ws = await hydrateWorkingSet(classId, token);
      const rows: AttendanceRow[] = ws.students
        .filter((s) => ws.attendance[s.id])
        .map((s) => ({ student_id: s.id, status: ws.attendance[s.id], name: s.name, student_code: s.student_code }));
      setAttendance(rows);
      setOffline(ws.syncedAt == null);
    } catch {
      /* keep whatever we showed */
    }

    // Cash: pending vs confirmed for today. Fetch + cache when online; fall back
    // to the cache offline. Either way add still-queued offline collections.
    if (canPayment) {
      let summary: CashSummary = readCashSummary(classId) ?? {
        date: today, pendingCents: 0, pendingCount: 0, confirmedCents: 0, confirmedCount: 0,
      };
      if (summary.date !== today) {
        summary = { date: today, pendingCents: 0, pendingCount: 0, confirmedCents: 0, confirmedCount: 0 };
      }
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/payment_collections?class_id=eq.${classId}&created_by_assistant_id=eq.${me}&collected_at=gte.${today}T00:00:00&select=status,amount_cents`,
          { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } },
        );
        if (res.ok) {
          const rows = (await res.json().catch(() => [])) as { status: string; amount_cents: number }[];
          const fresh: CashSummary = { date: today, pendingCents: 0, pendingCount: 0, confirmedCents: 0, confirmedCount: 0 };
          for (const r of rows) {
            if (r.status === 'pending') { fresh.pendingCents += r.amount_cents; fresh.pendingCount += 1; }
            else if (r.status === 'confirmed') { fresh.confirmedCents += r.amount_cents; fresh.confirmedCount += 1; }
          }
          writeCashSummary(classId, fresh);
          summary = fresh;
        }
      } catch {
        /* offline — keep the cached summary */
      }
      setCash(summary);
    }

    setLoading(false);
    setRefreshing(false);
  }, [classId, token, canPayment, me]);

  useEffect(() => { useOutboxStore.getState().hydrate(); load(); }, [load]);

  function onRefresh() { setRefreshing(true); load(); }

  // Collections still queued offline (not yet on the server) for this class today.
  const queuedToday = useMemo(() => {
    const today = todayIso();
    let cents = 0; let count = 0;
    for (const e of outboxItems) {
      if (e.kind !== 'payment') continue;
      const b = e.body as Record<string, unknown>;
      if (b?.class_id === classId && typeof b?.collected_at === 'string' && (b.collected_at as string).startsWith(today)) {
        cents += Number(b.amount_cents ?? 0); count += 1;
      }
    }
    return { cents, count };
  }, [outboxItems, classId]);

  const pendingCents = (cash?.pendingCents ?? 0) + queuedToday.cents;
  const pendingCount = (cash?.pendingCount ?? 0) + queuedToday.count;
  const confirmedCents = cash?.confirmedCents ?? 0;

  const present = attendance.filter((r) => r.status === 'present').length;
  const late = attendance.filter((r) => r.status === 'late').length;
  const absent = attendance.filter((r) => r.status === 'absent').length;

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Day Summary</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Stat strip */}
          <View style={[styles.statRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <StatCell icon="checkmark-circle" iconColor="#059669" bg="#d1fae5" label="Present" value={present} colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatCell icon="time" iconColor="#d97706" bg="#fef3c7" label="Late" value={late} colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatCell icon="close-circle" iconColor="#dc2626" bg="#fee2e2" label="Absent" value={absent} colors={colors} />
          </View>

          {offline && (
            <View style={styles.offlineNote}>
              <Ionicons name="cloud-offline-outline" size={14} color="#92400e" />
              <Text style={styles.offlineNoteText}>Offline — showing last synced data.</Text>
            </View>
          )}

          {/* Cash summary — split into waiting-for-teacher vs confirmed */}
          {canPayment && (
            <View style={styles.cashRow}>
              <View style={[styles.cashCard, { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }]}>
                <Text style={[styles.cashLabel, { color: '#b45309' }]}>WAITING FOR TEACHER</Text>
                <Text style={[styles.cashValue, { color: '#92400e' }]}>{fmtMoney(pendingCents)}</Text>
                <Text style={[styles.cashSub, { color: '#b45309' }]}>{pendingCount} payment{pendingCount === 1 ? '' : 's'} to hand over</Text>
              </View>
              <View style={[styles.cashCard, { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }]}>
                <Text style={[styles.cashLabel, { color: '#047857' }]}>CONFIRMED BY TEACHER</Text>
                <Text style={[styles.cashValue, { color: '#065f46' }]}>{fmtMoney(confirmedCents)}</Text>
                <Text style={[styles.cashSub, { color: '#047857' }]}>{cash?.confirmedCount ?? 0} payment{(cash?.confirmedCount ?? 0) === 1 ? '' : 's'}</Text>
              </View>
            </View>
          )}

          {/* Attendance list */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            ATTENDANCE — {todayIso()} ({attendance.length} marked)
          </Text>

          {attendance.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No attendance recorded yet.{'\n'}Scan student QR cards to mark attendance.
              </Text>
            </View>
          ) : (
            attendance.map((row, i) => {
              const sc = statusColor(row.status);
              return (
                <View
                  key={`${row.student_id}-${i}`}
                  style={[styles.attRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.attIconBox, { backgroundColor: sc.bg }]}>
                    <Ionicons name={sc.icon as never} size={18} color={sc.text} />
                  </View>
                  <View style={styles.attInfo}>
                    <Text style={[styles.attName, { color: colors.text }]}>
                      {row.name || row.student_id}
                    </Text>
                    <Text style={[styles.attCode, { color: colors.textMuted }]}>
                      {row.student_code}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>
                      {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          {/* Done button */}
          <Pressable
            onPress={() => router.replace('/(assistant)')}
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="checkmark-done" size={20} color="#fff" />
            <Text style={styles.doneBtnText}>Done for Today</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCell({
  icon, iconColor, bg, label, value, colors,
}: {
  icon: string; iconColor: string; bg: string; label: string; value: number;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Ionicons name={icon as never} size={18} color={iconColor} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: iconColor }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, height: 56,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },

    scroll: { padding: 16, paddingBottom: 48 },

    statRow: {
      flexDirection: 'row', borderWidth: 1, borderRadius: 16,
      marginBottom: 16, overflow: 'hidden',
    },
    statDivider: { width: StyleSheet.hairlineWidth },

    offlineNote: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#fef3c7', borderRadius: 10, padding: 8, marginBottom: 12,
    },
    offlineNoteText: { fontSize: 12, fontWeight: '600', color: '#92400e' },
    cashRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    cashCard: { flex: 1, borderWidth: 1.5, borderRadius: 14, padding: 14 },
    cashLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
    cashValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
    cashSub: { fontSize: 11, marginTop: 3 },

    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 10,
    },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 14 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

    attRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
      padding: 12, marginBottom: 8,
    },
    attIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    attInfo: { flex: 1 },
    attName: { fontSize: 14, fontWeight: '600' },
    attCode: { fontSize: 12, marginTop: 1 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },

    doneBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: '#059669', borderRadius: 14, height: 52, marginTop: 24,
    },
    doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
