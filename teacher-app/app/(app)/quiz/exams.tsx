// Online Exams — list of exams the teacher has published, with their join code
// and status. Tap one to see results; "+" to publish a new one.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { listOnlineExams, type OnlineExam } from '../../../lib/onlineExam/api';
import { useScreenTitle } from '../../../lib/ui/header';

const STATUS: Record<OnlineExam['status'], { label: string; bg: string; fg: string }> = {
  published: { label: 'Open', bg: '#d1fae5', fg: '#059669' },
  closed:    { label: 'Closed', bg: '#f3f4f6', fg: '#6b7280' },
  draft:     { label: 'Draft', bg: '#fef3c7', fg: '#d97706' },
};

export default function OnlineExamsScreen() {
  useScreenTitle('Online Exams');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? 'local');
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const classOptions = useClassOptions(teacherId);

  const [exams, setExams] = useState<OnlineExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    listOnlineExams(token)
      .then(setExams)
      .catch(() => setExams([]))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [token]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  function classLabel(id: string): string {
    return classOptions.find((c) => c.id === id)?.label ?? '';
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <Pressable onPress={() => router.push('/(app)/quiz/new-exam')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {exams.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="rocket-outline" size={44} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No online exams yet. Tap + to publish one from your question bank.
              </Text>
            </View>
          ) : (
            exams.map((e) => {
              const st = STATUS[e.status];
              return (
                <Pressable
                  key={e.id}
                  onPress={() => router.push({ pathname: '/(app)/quiz/results/[id]', params: { id: e.id } })}
                  style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{e.title}</Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                    {classLabel(e.class_id)}
                  </Text>
                  <View style={styles.cardMetaRow}>
                    <View style={[styles.codePill, { borderColor: colors.primary }]}>
                      <Ionicons name="key-outline" size={13} color={colors.primary} />
                      <Text style={[styles.codePillText, { color: colors.primary }]}>{e.join_code}</Text>
                    </View>
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                      {e.question_count} Q · {e.duration_minutes} min · {e.total_marks} marks
                    </Text>
                  </View>
                </Pressable>
              );
            })
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
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 12, paddingBottom: 48 },
    empty: { alignItems: 'center', paddingVertical: 64, gap: 14, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 270, lineHeight: 20 },
    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    cardSub: { fontSize: 12.5, marginTop: 2 },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    codePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    codePillText: { fontSize: 14, fontWeight: '800', letterSpacing: 1, fontFamily: 'monospace' },
    cardMeta: { fontSize: 11.5, fontWeight: '500' },
  });
}
