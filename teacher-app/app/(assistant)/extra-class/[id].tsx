// Assistant — run one extra class: mark attendance, and collect the fee from
// students who attended (queued as a pending cash collection the teacher confirms).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore, type ThemeColors } from '../../../lib/theme/store';
import { useAssistantStore } from '../../../lib/assistant/store';
import { useOutboxStore } from '../../../lib/assistant/outbox';
import { hydrateWorkingSet, type WsStudent } from '../../../lib/assistant/workingSet';
import { extraChargeCents } from '../../../lib/extraClass/charge';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../lib/constants';
import { newId } from '../../../lib/uuid';

interface ExtraInfo {
  id: string; class_id: string; topic: string | null; date: string; location: string | null;
  fee_mode: string; custom_fee_cents: number | null;
}
function lkr(c: number): string { return `Rs ${Math.round(c / 100).toLocaleString()}`; }

export default function AssistantExtraClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);
  const { profile, session, permissions } = useAssistantStore(useShallow((s) => ({ profile: s.profile, session: s.session, permissions: s.permissions })));
  const enqueue = useOutboxStore((s) => s.enqueue);
  const flush = useOutboxStore((s) => s.flush);
  const token = session?.access_token ?? '';
  const flushNow = useCallback(() => { if (token) void flush(token); }, [flush, token]);

  const [extra, setExtra] = useState<ExtraInfo | null>(null);
  const [students, setStudents] = useState<WsStudent[]>([]);
  const [classFee, setClassFee] = useState(0);
  const [marks, setMarks] = useState<Record<string, 'present' | 'absent'>>({});
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const perm = useMemo(() => permissions.find((p) => p.class_id === extra?.class_id), [permissions, extra]);
  const canPayment = !!perm && (perm.permission === 'payment' || perm.permission === 'both');

  const load = useCallback(async () => {
    if (!token || !id) { setLoading(false); return; }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/extra_classes?id=eq.${id}&deleted_at=is.null&select=id,class_id,topic,date,location,fee_mode,custom_fee_cents&limit=1`,
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } });
      const rows = res.ok ? await res.json() : [];
      const ex: ExtraInfo | null = Array.isArray(rows) && rows.length ? rows[0] : null;
      setExtra(ex);
      if (!ex) { setLoading(false); return; }

      const ws = await hydrateWorkingSet(ex.class_id, token);
      setStudents(ws.students.filter((s) => s.join_status !== 'pending_payment'));
      setClassFee(ws.feeCents ?? 0);

      // Existing extra-class attendance so re-marks show.
      const aRes = await fetch(`${SUPABASE_URL}/rest/v1/attendance?extra_class_id=eq.${id}&deleted_at=is.null&select=student_id,status`,
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } });
      const aRows = aRes.ok ? await aRes.json() : [];
      const m: Record<string, 'present' | 'absent'> = {};
      for (const a of Array.isArray(aRows) ? aRows : []) {
        if (a.status === 'present' || a.status === 'late') m[a.student_id] = 'present';
        else if (a.status === 'absent') m[a.student_id] = 'absent';
      }
      setMarks(m);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  function chargeFor(s: WsStudent): number {
    if (!extra) return 0;
    return extraChargeCents(extra.fee_mode, extra.custom_fee_cents, { feeType: s.fee_type, customFeeCents: s.custom_fee_cents }, classFee);
  }

  function mark(studentId: string, status: 'present' | 'absent') {
    if (!extra || !profile) return;
    const now = new Date().toISOString();
    enqueue('attendance', {
      id: newId(),
      teacher_id: profile.teacher_id,
      student_id: studentId,
      class_id: extra.class_id,
      extra_class_id: extra.id,
      date: extra.date,
      status,
      sms_intent: false,
      marked_by_user_id: profile.id,
      marked_by_role: 'assistant',
      created_at: now,
      updated_at: now,
      client_updated_at: now,
    });
    setMarks((p) => ({ ...p, [studentId]: status }));
    void flushNow();
  }

  function collect(s: WsStudent) {
    if (!extra || !profile) return;
    const amount = chargeFor(s);
    if (amount <= 0) return;
    Alert.alert('Collect payment', `Collect ${lkr(amount)} from ${s.name} for this extra class?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Collect',
        onPress: () => {
          const now = new Date().toISOString();
          const payId = newId();
          const month = extra.date.slice(0, 7);
          const payload = {
            id: payId,
            teacherId: profile.teacher_id,
            studentId: s.id,
            classId: extra.class_id,
            extraClassId: extra.id,
            month,
            amountCents: amount,
            status: 'paid',
            method: 'cash',
            location: extra.location ?? null,
            remark: extra.topic ? `Extra class: ${extra.topic}` : 'Extra class',
            collectedByUserId: profile.id,
            collectedByRole: 'assistant',
            collectedAt: now,
            createdAt: now,
            updatedAt: now,
            clientUpdatedAt: now,
          };
          enqueue('payment', {
            id: payId,
            teacher_id: profile.teacher_id,
            class_id: extra.class_id,
            created_by_assistant_id: profile.id,
            student_id: s.id,
            student_name: s.name,
            month,
            amount_cents: amount,
            payload,
            status: 'pending',
            collected_at: now,
            created_at: now,
          });
          setCollected((p) => new Set(p).add(s.id));
          void flushNow();
        },
      },
    ]);
  }

  const isPaid = extra && extra.fee_mode !== 'free';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>Extra Class</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !extra ? (
        <View style={styles.center}><Text style={{ color: colors.textMuted }}>Not found.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sumTitle, { color: colors.text }]}>{extra.topic || 'Extra class'}</Text>
            <Text style={[styles.sumSub, { color: colors.textMuted }]}>{extra.date}{extra.location ? ` · ${extra.location}` : ''}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>Mark who attended{isPaid && canPayment ? ', then collect from those present.' : '.'}</Text>

          {students.map((s) => {
            const status = marks[s.id];
            const present = status === 'present';
            const amount = chargeFor(s);
            const done = collected.has(s.id);
            return (
              <View key={s.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[styles.code, { color: colors.textMuted }]}>{s.student_code}</Text>
                </View>
                <View style={styles.attBtns}>
                  <Pressable onPress={() => mark(s.id, 'present')} style={[styles.attBtn, { borderColor: present ? '#6ee7b7' : colors.border }, present && { backgroundColor: '#d1fae5' }]}>
                    <Text style={[styles.attText, { color: present ? '#059669' : colors.textMuted }]}>P</Text>
                  </Pressable>
                  <Pressable onPress={() => mark(s.id, 'absent')} style={[styles.attBtn, { borderColor: status === 'absent' ? '#fca5a5' : colors.border }, status === 'absent' && { backgroundColor: '#fee2e2' }]}>
                    <Text style={[styles.attText, { color: status === 'absent' ? '#dc2626' : colors.textMuted }]}>A</Text>
                  </Pressable>
                </View>
                {isPaid && canPayment && present && amount > 0 ? (
                  done ? <Ionicons name="checkmark-circle" size={22} color="#059669" />
                    : <Pressable onPress={() => collect(s)} style={[styles.collectBtn, { backgroundColor: colors.primary }]}><Text style={styles.collectText}>{lkr(amount)}</Text></Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    scroll: { padding: 12, paddingBottom: 40 },
    summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, marginBottom: 10 },
    sumTitle: { fontSize: 16, fontWeight: '800' },
    sumSub: { fontSize: 12.5, marginTop: 3 },
    hint: { fontSize: 12.5, marginBottom: 8, marginLeft: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
    name: { fontSize: 14.5, fontWeight: '700' },
    code: { fontSize: 12, marginTop: 1 },
    attBtns: { flexDirection: 'row', gap: 6 },
    attBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    attText: { fontSize: 14, fontWeight: '800' },
    collectBtn: { paddingHorizontal: 12, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
    collectText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  });
}
