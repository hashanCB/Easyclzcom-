// Add or edit one question in the bank. Params: classId (required), id ('new' or
// a question id).
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { QuestionForm, type QuestionFormValues } from '../../../components/QuestionForm';
import { useQuestion, saveQuestion, deleteQuestion } from '../../../lib/quiz/hooks';
import { newId } from '../../../lib/uuid';
import { useScreenTitle } from '../../../lib/ui/header';
import { R2Paths } from '../../../lib/r2/paths';
import type { NewQuestionBankItem } from '../../../db/schema';

export default function QuestionEditorScreen() {
  const { id, classId } = useLocalSearchParams<{ id: string; classId: string }>();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? 'local');
  const accessToken = useAuthStore((s) => s.session?.access_token ?? '');
  const isNew = !id || id === 'new';
  useScreenTitle(isNew ? 'New Question' : 'Edit Question');
  const { question, loading } = useQuestion(id);
  const [saving, setSaving] = useState(false);
  // Stable question id so image R2 keys are consistent across uploads this session.
  const [questionId] = useState(() => (isNew ? newId() : (id as string)));

  function handleSubmit(v: QuestionFormValues) {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload: NewQuestionBankItem = {
        id: questionId,
        teacherId,
        classId: classId as string,
        questionType: v.questionType,
        questionText: v.questionText,
        options: JSON.stringify(v.options),
        correctIndex: v.correctIndex,
        marks: v.marks,
        questionImage: v.questionImage ?? null,
        optionImages: JSON.stringify(v.optionImages),
        isActive: true,
        deletedAt: null,
        createdAt: question?.createdAt ?? now,
        updatedAt: now,
        clientUpdatedAt: now,
        syncedAt: null,
      };
      saveQuestion(payload, isNew ? undefined : (id as string));
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    }
  }

  function handleDelete() {
    Alert.alert('Delete question', 'Remove this question from the bank?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteQuestion(id as string); router.back(); } },
    ]);
  }

  const initial = !isNew && question
    ? {
        questionType: question.questionType as QuestionFormValues['questionType'],
        questionText: question.questionText,
        options: safeParse(question.options),
        correctIndex: question.correctIndex,
        marks: question.marks,
        questionImage: question.questionImage ?? null,
        optionImages: safeParse(question.optionImages ?? '[]').map((x) => x || null),
      }
    : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {!isNew && (
        <View style={styles.actions}>
          <Pressable onPress={handleDelete} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        </View>
      )}

      {!isNew && loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <QuestionForm
          initial={initial}
          submitting={saving}
          submitLabel={isNew ? 'Add to bank' : 'Save changes'}
          accessToken={accessToken}
          keyForSlot={(slot) => R2Paths.questionImage(teacherId, questionId, slot)}
          onSubmit={handleSubmit}
        />
      )}
    </SafeAreaView>
  );
}

function safeParse(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
