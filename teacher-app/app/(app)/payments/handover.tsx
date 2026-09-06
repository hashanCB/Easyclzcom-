// Cash handover reconciliation. The assistant collected cash (saved as pending
// collections); here the teacher counts the physical money and confirms it.
// Smart matching: tick the students you actually received cash for — the ticked
// total must equal the cash you counted before you can confirm. If everything
// matches, it's a single tap.
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { uiAlert } from '../../../lib/uiAlert';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useScreenTitle } from '../../../lib/ui/header';
import { useClassOptions } from '../../../lib/students/hooks';
import { fetchAssistants } from '../../../lib/api/assistants';
import {
  usePendingCollections,
  confirmCollection,
  rejectCollection,
  type PaymentCollection,
} from '../../../lib/payments/collections';

function money(cents: number): string {
  return `Rs ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

export default function CashHandoverScreen() {
  useScreenTitle('Cash Handover');
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const teacherId = teacher?.id ?? '';

  const { items, loading, refresh, setItems } = usePendingCollections(teacherId, token);
  const classOptions = useClassOptions(teacherId);

  // Which collections are ticked (received). Default: everything ticked.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [counted, setCounted] = useState('');     // cash counted, in rupees
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Assistant names so each cash pile is clearly labelled (id → name).
  const [assistantNames, setAssistantNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!token) return;
    fetchAssistants(token)
      .then((list) => setAssistantNames(Object.fromEntries(list.map((a) => [a.id, a.name]))))
      .catch(() => {});
  }, [token]);

  const assistantLabel = (id: string | null) =>
    (id && assistantNames[id]) || 'Unknown assistant';

  // A collection is ticked unless explicitly turned off.
  const isTicked = (id: string) => ticked[id] !== false;

  function classLabel(classId: string) {
    return classOptions.find((c) => c.id === classId)?.label ?? 'Class';
  }

  // Each assistant hands over their own cash, so we reconcile per assistant.
  // Group the pending collections by who collected them.
  const groups = useMemo(() => {
    const map = new Map<string, { assistantId: string | null; items: PaymentCollection[]; total: number }>();
    for (const c of items) {
      const key = c.created_by_assistant_id ?? 'none';
      const g = map.get(key) ?? { assistantId: c.created_by_assistant_id, items: [], total: 0 };
      g.items.push(c);
      g.total += c.amount_cents;
      map.set(key, g);
    }
    return Array.from(map.entries()).map(([key, g]) => ({ key, ...g }));
  }, [items]);

  // Which assistant's cash we're counting right now.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => {
    // Keep a valid selection: default to the first group; re-point if it cleared.
    if (groups.length === 0) { setSelectedKey(null); return; }
    if (!selectedKey || !groups.some((g) => g.key === selectedKey)) {
      setSelectedKey(groups[0].key);
      setCounted('');
    }
  }, [groups, selectedKey]);

  // Only the selected assistant's collections drive the totals / count / confirm.
  const groupItems = useMemo(
    () => groups.find((g) => g.key === selectedKey)?.items ?? [],
    [groups, selectedKey],
  );

  const expectedCents = useMemo(() => groupItems.reduce((s, c) => s + c.amount_cents, 0), [groupItems]);
  const selectedCents = useMemo(
    () => groupItems.filter((c) => isTicked(c.id)).reduce((s, c) => s + c.amount_cents, 0),
    [groupItems, ticked],
  );
  const countedCents = useMemo(() => {
    const n = parseFloat(counted.replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }, [counted]);

  const selectedCount = groupItems.filter((c) => isTicked(c.id)).length;
  // Matches when the cash counted equals the ticked total (and at least one row).
  const matches = countedCents !== null && countedCents === selectedCents && selectedCount > 0;
  const diffCents = countedCents === null ? null : countedCents - selectedCents;

  async function onConfirm() {
    const toConfirm = groupItems.filter((c) => isTicked(c.id));
    if (toConfirm.length === 0) return;
    setWorking(true);
    const failed: string[] = [];
    for (const col of toConfirm) {
      try {
        await confirmCollection(col, token);
        setItems((prev) => prev.filter((c) => c.id !== col.id));
      } catch {
        failed.push(col.student_name);
      }
    }
    setWorking(false);
    setCounted('');
    if (failed.length === 0) {
      const who = assistantLabel(groupItems[0]?.created_by_assistant_id ?? null);
      uiAlert('Cash confirmed', `${toConfirm.length} payment${toConfirm.length > 1 ? 's' : ''} from ${who} recorded.`);
    } else {
      uiAlert('Some not recorded', `Failed: ${failed.join(', ')}. Please try again.`);
    }
  }

  function onReject(col: PaymentCollection) {
    Alert.alert(
      'Flag a problem?',
      `Mark ${col.student_name}'s ${money(col.amount_cents)} as a problem. It won't be recorded and the assistant will see it was not accepted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Flag',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            try {
              await rejectCollection(col, token);
              setItems((prev) => prev.filter((c) => c.id !== col.id));
            } catch (e) {
              uiAlert('Could not flag', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setWorking(false);
            }
          },
        },
      ],
    );
  }

  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cash-outline" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No cash to confirm. Money your assistants collect will appear here for you to count and confirm.
          </Text>
        </View>
      ) : (
        <>
          {/* Each assistant hands over their own cash — pick whose pile you're
              counting so two assistants' money never gets mixed. */}
          {groups.length > 1 && (
            <View style={[styles.assistantBar, { borderBottomColor: colors.border }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.assistantBarScroll}
                keyboardShouldPersistTaps="handled"
              >
                {groups.map((g) => {
                  const active = g.key === selectedKey;
                  return (
                    <Pressable
                      key={g.key}
                      onPress={() => { setSelectedKey(g.key); setCounted(''); }}
                      style={[
                        styles.assistantChip,
                        { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '12' : colors.surface },
                      ]}
                    >
                      <Text style={[styles.assistantChipName, { color: active ? colors.primary : colors.text }]} numberOfLines={1}>
                        {assistantLabel(g.assistantId)}
                      </Text>
                      <Text style={[styles.assistantChipMeta, { color: active ? colors.primary : colors.textMuted }]}>
                        {g.items.length} · {money(g.total)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} />
            }
          >
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {groups.length > 1 ? 'Counting ' : 'Cash from '}
              <Text style={{ fontWeight: '700', color: colors.text }}>
                {assistantLabel(groupItems[0]?.created_by_assistant_id ?? null)}
              </Text>
              . Count their cash, type it below, and tick the students you received money for.
            </Text>

            {groupItems.map((col) => {
              const on = isTicked(col.id);
              return (
                <View key={col.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: on ? colors.primary : colors.border }]}>
                  <Pressable
                    onPress={() => setTicked((p) => ({ ...p, [col.id]: !on }))}
                    style={styles.rowMain}
                    hitSlop={6}
                  >
                    <View style={[styles.check, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}>
                      {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.text }]}>{col.student_name}</Text>
                      <Text style={[styles.sub, { color: colors.textMuted }]}>{classLabel(col.class_id)} · {col.month}</Text>
                    </View>
                    <Text style={[styles.amount, { color: on ? colors.text : colors.textMuted }]}>{money(col.amount_cents)}</Text>
                  </Pressable>
                  <Pressable onPress={() => onReject(col)} hitSlop={6} style={styles.flagBtn}>
                    <Ionicons name="flag-outline" size={18} color="#dc2626" />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          {/* Reconciliation footer */}
          <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, { color: colors.textMuted }]}>
                Ticked total ({selectedCount})
              </Text>
              <Text style={[styles.totalsValue, { color: colors.text }]}>{money(selectedCents)}</Text>
            </View>
            {selectedCents !== expectedCents && (
              <View style={styles.totalsRow}>
                <Text style={[styles.totalsLabel, { color: colors.textMuted }]}>All pending</Text>
                <Text style={[styles.totalsValueMuted, { color: colors.textMuted }]}>{money(expectedCents)}</Text>
              </View>
            )}

            <View style={[styles.countBox, { borderColor: colors.border }]}>
              <Text style={[styles.countLabel, { color: colors.textMuted }]}>Cash you counted (Rs)</Text>
              <TextInput
                value={counted}
                onChangeText={setCounted}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={[styles.countInput, { color: colors.text }]}
              />
            </View>

            {countedCents !== null && diffCents !== null && diffCents !== 0 && (
              <Text style={[styles.diff, { color: diffCents < 0 ? '#dc2626' : '#d97706' }]}>
                {diffCents < 0
                  ? `Short by ${money(-diffCents)} — untick who didn't pay, or flag a problem.`
                  : `Over by ${money(diffCents)} — tick more students or check the amounts.`}
              </Text>
            )}
            {matches && (
              <Text style={[styles.diff, { color: '#059669' }]}>Cash matches the ticked students.</Text>
            )}

            <Pressable
              disabled={!matches || working}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: matches ? colors.primary : colors.border },
                pressed && { opacity: 0.85 },
              ]}
            >
              {working
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.confirmText}>
                    {selectedCount === groupItems.length ? `Confirm all (${selectedCount})` : `Confirm ${selectedCount} selected`}
                  </Text>}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    scroll: { padding: 16, paddingBottom: 24, gap: 10 },
    hint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
    assistantBar: { borderBottomWidth: StyleSheet.hairlineWidth },
    assistantBarScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    assistantChip: {
      minWidth: 120, borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
    },
    assistantChipName: { fontSize: 14, fontWeight: '700' },
    assistantChipMeta: { fontSize: 12, marginTop: 2, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingRight: 6 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 15, fontWeight: '600' },
    sub: { fontSize: 12, marginTop: 2 },
    amount: { fontSize: 15, fontWeight: '700' },
    flagBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalsLabel: { fontSize: 13 },
    totalsValue: { fontSize: 18, fontWeight: '700' },
    totalsValueMuted: { fontSize: 14, fontWeight: '600' },
    countBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
    countLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    countInput: { fontSize: 20, fontWeight: '700', paddingVertical: 2 },
    diff: { fontSize: 13, fontWeight: '600' },
    confirmBtn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
