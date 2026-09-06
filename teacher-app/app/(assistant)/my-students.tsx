// Read-only summary of students this assistant added. Assistant adds go STRAIGHT
// to the live roster now (no teacher review), so this lists the real students
// they created plus any still queued offline in the outbox ("Waiting to upload").
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAssistantStore } from '../../lib/assistant/store';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../../lib/theme/store';
import { useOutboxStore } from '../../lib/assistant/outbox';
import { readCachedClasses } from '../../lib/assistant/classCache';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';

interface ServerStudent {
  id: string;
  name: string;
  class_id: string;
  student_code: string | null;
  created_at: string;
}

// state = 'queued' (still in the offline outbox) | 'added' (live on the server).
type RowState = 'queued' | 'added';

interface Row {
  id: string;
  name: string;
  classId: string;
  state: RowState;
  createdAt: string;
}

export default function AssistantMyStudentsScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { profile, session } = useAssistantStore(
    useShallow((s) => ({ profile: s.profile, session: s.session })),
  );
  const outboxItems = useOutboxStore((s) => s.items);

  const token = session?.access_token ?? '';
  const assistantId = profile?.id ?? '';

  const [server, setServer] = useState<ServerStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const classLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of readCachedClasses()) map.set(c.id, `${c.grade} · ${c.batch} · ${c.subject}`);
    return map;
  }, []);

  const load = useCallback(async () => {
    if (!token || !assistantId) { setLoading(false); return; }
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/students?created_by_assistant_id=eq.${assistantId}&deleted_at=is.null&select=id,name,class_id,student_code,created_at&order=created_at.desc`,
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } },
      );
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) setServer(data);
    } catch {
      /* offline — we still show queued rows below */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, assistantId]);

  useEffect(() => { useOutboxStore.getState().hydrate(); load(); }, [load]);

  // "queued" = submissions still in the offline outbox, not yet uploaded.
  const rows: Row[] = useMemo(() => {
    const syncedIds = new Set(server.map((s) => s.id));
    const queued: Row[] = outboxItems
      .filter((e) => e.kind === 'student')
      .map((e) => e.body as Record<string, unknown>)
      .filter((b) => typeof b?.id === 'string' && !syncedIds.has(b.id as string))
      .map((b) => ({
        id: b.id as string,
        name: (b.name as string) ?? 'Unnamed',
        classId: (b.class_id as string) ?? '',
        state: 'queued' as RowState,
        createdAt: (b.created_at as string) ?? new Date().toISOString(),
      }));
    const synced: Row[] = server.map((s) => ({
      id: s.id, name: s.name, classId: s.class_id, state: 'added' as RowState, createdAt: s.created_at,
    }));
    return [...queued, ...synced];
  }, [server, outboxItems]);

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Students I Added</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            You haven't added any students yet.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {rows.map((r) => (
            <View key={r.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{r.name}</Text>
                <Text style={[styles.sub, { color: colors.textMuted }]}>
                  {classLabels.get(r.classId) ?? 'Class'}
                </Text>
              </View>
              <StatusPill state={r.state} colors={colors} />
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Maps each row state to a coloured pill (icon + label).
function StatusPill({ state, colors }: { state: RowState; colors: ReturnType<typeof useThemeStore.getState>['colors'] }) {
  const map: Record<RowState, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
    queued: { bg: '#e0e7ff', fg: '#4f46e5', icon: 'cloud-upload-outline', label: 'Waiting to upload' },
    added: { bg: '#d1fae5', fg: '#059669', icon: 'checkmark-circle-outline', label: 'Added' },
  };
  const s = map[state];
  return (
    <View style={[pillStyles.pill, { backgroundColor: s.bg }]}>
      <Ionicons name={s.icon} size={12} color={s.fg} />
      <Text style={[pillStyles.text, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  text: { fontSize: 11, fontWeight: '700' },
});

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    scroll: { padding: 16, paddingBottom: 64, gap: 10 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14,
    },
    name: { fontSize: 15, fontWeight: '600' },
    sub: { fontSize: 12, marginTop: 2 },
    codePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
    codeText: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  });
}
