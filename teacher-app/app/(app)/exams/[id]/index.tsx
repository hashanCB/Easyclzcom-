// Edit / delete an exam (U40).
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../../lib/theme/store';
import { useExam, updateExam, deleteExam } from '../../../../lib/exams/hooks';
import { ExamForm, type ExamFormValues } from '../../../../components/ExamForm';
import { useScreenTitle } from '../../../../lib/ui/header';

export default function EditExamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Edit Exam');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { exam, loading } = useExam(id);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(values: ExamFormValues) {
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      updateExam(id, {
        classId: values.classId,
        title: values.title,
        grade: values.grade,
        batch: values.batch,
        subject: values.subject,
        language: values.language,
        examDate: values.examDate,
        totalMarks: values.totalMarks,
        remark: values.remark,
        updatedAt: now,
        clientUpdatedAt: now,
      });
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    Alert.alert('Delete Exam', 'Delete this exam? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => { deleteExam(id, new Date().toISOString()); router.back(); },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.actions}>
        <Pressable onPress={handleDelete} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !exam ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textMuted }}>Exam not found.</Text>
        </View>
      ) : (
        <>
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/exams/[id]/marks', params: { id } })}
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Enter Marks</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/exams/[id]/report', params: { id } })}
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnGhost, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="podium-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>View Report</Text>
            </Pressable>
          </View>
          <ExamForm
            teacherId={exam.teacherId}
            initial={{
              title: exam.title,
              classId: exam.classId,
              grade: exam.grade,
              batch: exam.batch,
              subject: exam.subject,
              language: exam.language,
              examDate: exam.examDate,
              totalMarks: exam.totalMarks,
              remark: exam.remark,
            }}
            submitting={submitting}
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingHorizontal: 8, paddingTop: 4,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionsRow: {
    flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 12,
  },
  actionBtnGhost: { backgroundColor: 'transparent', borderWidth: 1.5 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
