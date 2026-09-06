// Question Bank — the per-class pool of questions a teacher reuses to build
// online exams (phase 1). Pick a class, then add/edit MCQ / True-False questions.
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { useQuestionBank } from '../../../lib/quiz/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { useScreenTitle } from '../../../lib/ui/header';

function correctAnswer(optionsJson: string, idx: number): string {
  try {
    const opts = JSON.parse(optionsJson);
    return Array.isArray(opts) ? String(opts[idx] ?? '') : '';
  } catch {
    return '';
  }
}

export default function QuestionBankScreen() {
  useScreenTitle('Question Bank');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? 'local');
  const classOptions = useClassOptions(teacherId);

  const [classId, setClassId] = useState<string | undefined>(undefined);
  const { questions, refresh } = useQuestionBank({ teacherId, classId });

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const styles = buildStyles(colors);
  const canAdd = !!classId;

  return (
    <SafeAreaView style={styles.safe}>

      {/* Class picker */}
      {classOptions.length > 0 && (
        <View style={[styles.filterWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <ClassPicker classes={classOptions} value={classId} onChange={setClassId} colors={colors} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!classId ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={44} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Pick a class above to see and add its questions.
            </Text>
          </View>
        ) : questions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="help-circle-outline" size={44} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No questions in this class yet. Tap "Add Question" to start your bank.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {questions.length} {questions.length === 1 ? 'question' : 'questions'}
            </Text>
            {questions.map((q) => (
              <Pressable
                key={q.id}
                onPress={() => router.push({ pathname: '/(app)/quiz/question', params: { id: q.id, classId } })}
                style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.typeBadge, { backgroundColor: '#eef2ff' }]}>
                    <Text style={styles.typeBadgeText}>
                      {q.questionType === 'true_false' ? 'T/F' : 'MCQ'}
                    </Text>
                  </View>
                  <Text style={[styles.marks, { color: colors.textMuted }]}>{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</Text>
                </View>
                <Text style={[styles.qText, { color: colors.text }]} numberOfLines={2}>{q.questionText}</Text>
                <View style={styles.answerRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#059669" />
                  <Text style={[styles.answerText, { color: '#059669' }]} numberOfLines={1}>
                    {correctAnswer(q.options, q.correctIndex)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* Add button */}
      {canAdd && (
        <Pressable
          onPress={() => router.push({ pathname: '/(app)/quiz/question', params: { id: 'new', classId } })}
          style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary }, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="add" size={22} color={colors.primaryText} />
          <Text style={styles.fabText}>Add Question</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },

    filterWrap: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },

    scroll: { padding: 12, paddingBottom: 96 },
    count: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
    empty: { alignItems: 'center', paddingVertical: 64, gap: 14, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },

    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    typeBadgeText: { fontSize: 11, fontWeight: '800', color: '#4f46e5' },
    marks: { fontSize: 12, fontWeight: '600' },
    qText: { fontSize: 14.5, fontWeight: '600', lineHeight: 20 },
    answerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    answerText: { fontSize: 13, fontWeight: '600', flex: 1 },

    fab: {
      position: 'absolute', right: 16, bottom: 24,
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 18, paddingVertical: 14, borderRadius: 999,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
    },
    fabText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
