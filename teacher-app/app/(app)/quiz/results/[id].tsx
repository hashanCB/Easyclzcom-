// Online-exam results — per-student score plus anti-cheat flags ("left the
// screen N times"), and close/delete controls for the exam.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../../lib/theme/store';
import { useAuthStore } from '../../../../lib/auth/store';
import {
  getOnlineExam, getExamResults, setExamStatus, setResultsPublished, deleteOnlineExam,
  type OnlineExam, type ExamAttemptRow,
} from '../../../../lib/onlineExam/api';
import { useScreenTitle } from '../../../../lib/ui/header';

export default function ExamResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Results');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);
  const token = useAuthStore((s) => s.session?.access_token ?? '');

  const [exam, setExam] = useState<OnlineExam | null>(null);
  const [rows, setRows] = useState<ExamAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    Promise.all([getOnlineExam(token, id as string), getExamResults(token, id as string)])
      .then(([e, r]) => { setExam(e); setRows(r); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [token, id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  async function shareCode() {
    if (!exam) return;
    try {
      await Share.share({ message: `Exam "${exam.title}" — code: ${exam.join_code} (${exam.duration_minutes} min)` });
    } catch { /* cancelled */ }
  }

  function toggleStatus() {
    if (!exam) return;
    const next = exam.status === 'published' ? 'closed' : 'published';
    setExamStatus(token, exam.id, next).then(load).catch((e) => Alert.alert('Failed', e.message));
  }

  function togglePublishResults() {
    if (!exam) return;
    const publish = !exam.results_published;
    const proceed = () =>
      setResultsPublished(token, exam.id, publish).then(load).catch((e) => Alert.alert('Failed', e.message));
    if (publish) {
      Alert.alert('Publish results?', 'Each student will be able to see their own marks. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: proceed },
      ]);
    } else {
      proceed();
    }
  }

  function remove() {
    Alert.alert('Delete exam', 'Delete this exam and its results? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteOnlineExam(token, id as string).then(() => router.back()).catch((e) => Alert.alert('Failed', e.message)) },
    ]);
  }

  const done = rows.filter((r) => r.status === 'submitted');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <Pressable onPress={remove} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !exam ? (
        <View style={styles.center}><Text style={{ color: colors.textMuted }}>Exam not found.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Exam summary + code */}
          <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.examTitle, { color: colors.text }]}>{exam.title}</Text>
            <Text style={[styles.examSub, { color: colors.textMuted }]}>
              {exam.question_count} Q · {exam.duration_minutes} min · {exam.total_marks} marks
            </Text>
            <View style={styles.codeRow}>
              <View style={[styles.codePill, { borderColor: colors.primary }]}>
                <Ionicons name="key-outline" size={14} color={colors.primary} />
                <Text style={[styles.codePillText, { color: colors.primary }]}>{exam.join_code}</Text>
              </View>
              <Pressable onPress={shareCode} style={styles.smallBtn}>
                <Ionicons name="share-outline" size={15} color={colors.primary} />
                <Text style={[styles.smallBtnText, { color: colors.primary }]}>Share</Text>
              </Pressable>
              <Pressable onPress={toggleStatus} style={styles.smallBtn}>
                <Ionicons name={exam.status === 'published' ? 'lock-closed-outline' : 'lock-open-outline'} size={15} color={colors.text} />
                <Text style={[styles.smallBtnText, { color: colors.text }]}>{exam.status === 'published' ? 'Close' : 'Re-open'}</Text>
              </Pressable>
            </View>

            {/* Publish results — students see their own marks only after this. */}
            <Pressable
              onPress={togglePublishResults}
              style={[styles.publishBtn, exam.results_published
                ? { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }
                : { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <Ionicons
                name={exam.results_published ? 'checkmark-circle' : 'megaphone-outline'}
                size={16}
                color={exam.results_published ? '#059669' : colors.primaryText}
              />
              <Text style={[styles.publishText, { color: exam.results_published ? '#059669' : colors.primaryText }]}>
                {exam.results_published ? 'Results published — tap to hide' : 'Publish results to students'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.count, { color: colors.textMuted }]}>
            {done.length} finished · {rows.length - done.length} in progress
          </Text>

          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="hourglass-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No one has started yet. Share the code: {exam.join_code}
              </Text>
            </View>
          ) : (
            rows.map((r) => {
              const submitted = r.status === 'submitted';
              const flagged = r.focus_lost_count > 0;
              const pct = submitted && r.total ? Math.round(((r.score ?? 0) / r.total) * 100) : null;
              return (
                <View key={r.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: flagged ? '#fca5a5' : colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                      {r.students?.name ?? 'Student'}
                    </Text>
                    <Text style={[styles.rowCode, { color: colors.textMuted }]}>{r.students?.student_code ?? ''}</Text>
                    {flagged ? (
                      <View style={styles.flagRow}>
                        <Ionicons name="warning-outline" size={13} color="#dc2626" />
                        <Text style={styles.flagText}>
                          Left the screen {r.focus_lost_count} {r.focus_lost_count === 1 ? 'time' : 'times'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.scoreBox}>
                    {submitted ? (
                      <>
                        <Text style={[styles.score, { color: colors.text }]}>{r.score}/{r.total}</Text>
                        <Text style={[styles.scorePct, { color: (pct ?? 0) >= 50 ? '#059669' : '#dc2626' }]}>{pct}%</Text>
                      </>
                    ) : (
                      <Text style={[styles.inProgress, { color: colors.textMuted }]}>Doing…</Text>
                    )}
                  </View>
                </View>
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

    summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, marginBottom: 12 },
    examTitle: { fontSize: 16, fontWeight: '800' },
    examSub: { fontSize: 12.5, marginTop: 3 },
    codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    codePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    codePillText: { fontSize: 16, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' },
    smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
    smallBtnText: { fontSize: 13, fontWeight: '700' },
    publishBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginTop: 12, minHeight: 46,
    },
    publishText: { fontSize: 14, fontWeight: '700' },

    count: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
    empty: { alignItems: 'center', paddingVertical: 56, gap: 14, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
    rowName: { fontSize: 14.5, fontWeight: '700' },
    rowCode: { fontSize: 12, marginTop: 1 },
    flagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
    flagText: { fontSize: 12, fontWeight: '600', color: '#dc2626' },
    scoreBox: { alignItems: 'flex-end' },
    score: { fontSize: 17, fontWeight: '800' },
    scorePct: { fontSize: 12, fontWeight: '700', marginTop: 1 },
    inProgress: { fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  });
}
