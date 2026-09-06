// Assistant — extra classes for the classes this assistant has access to.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../../lib/theme/store';
import { useAssistantStore } from '../../lib/assistant/store';
import { readCachedClasses } from '../../lib/assistant/classCache';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';

interface ExtraRow {
  id: string; class_id: string; topic: string | null; date: string;
  start_time: string | null; end_time: string | null; fee_mode: string;
}
const FEE_LABEL: Record<string, string> = { free: 'Free', monthly: 'Monthly fee', custom: 'Special fee' };

export default function AssistantExtraClassesScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);
  const { permissions, session } = useAssistantStore(useShallow((s) => ({ permissions: s.permissions, session: s.session })));
  const token = session?.access_token ?? '';
  const classIds = permissions.map((p) => p.class_id);
  const classNames = new Map(readCachedClasses().map((c) => [c.id, `${c.subject} · ${c.batch} (Grade ${c.grade})`]));

  const [items, setItems] = useState<ExtraRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token || classIds.length === 0) { setItems([]); setLoading(false); return; }
    const inList = classIds.join(',');
    fetch(`${SUPABASE_URL}/rest/v1/extra_classes?class_id=in.(${inList})&is_active=eq.true&deleted_at=is.null&order=date.desc&select=id,class_id,topic,date,start_time,end_time,fee_mode`,
      { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } })
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, classIds.join(',')]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Extra Classes</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={42} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No extra classes for your classes.</Text>
            </View>
          ) : (
            items.map((e) => (
              <Pressable key={e.id} onPress={() => router.push({ pathname: '/(assistant)/extra-class/[id]', params: { id: e.id } })}
                style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
                <View style={[styles.icon, { backgroundColor: '#d9770618' }]}><Ionicons name="flash-outline" size={20} color="#d97706" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{e.topic || 'Extra class'}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>{classNames.get(e.class_id) ?? ''}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{e.date}{e.start_time ? ` · ${e.start_time}${e.end_time ? `–${e.end_time}` : ''}` : ''} · {FEE_LABEL[e.fee_mode] ?? e.fee_mode}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    scroll: { padding: 12, paddingBottom: 40 },
    empty: { alignItems: 'center', paddingVertical: 64, gap: 14, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 260 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8 },
    icon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15, fontWeight: '700' },
    cardSub: { fontSize: 12, marginTop: 2 },
    cardMeta: { fontSize: 12, marginTop: 3 },
  });
}
