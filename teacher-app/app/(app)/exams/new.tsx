// Create a new exam (U40).
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { saveExam } from '../../../lib/exams/hooks';
import { ExamForm, type ExamFormValues } from '../../../components/ExamForm';
import { newId } from '../../../lib/uuid';
import { useScreenTitle } from '../../../lib/ui/header';

export default function NewExamScreen() {
  useScreenTitle('New Exam');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? 'local');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(values: ExamFormValues) {
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      saveExam({
        id: newId(),
        teacherId,
        classId: values.classId,
        title: values.title,
        grade: values.grade,
        batch: values.batch,
        subject: values.subject,
        language: values.language,
        examDate: values.examDate,
        totalMarks: values.totalMarks,
        remark: values.remark,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        clientUpdatedAt: now,
        syncedAt: null,
      });
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ExamForm
        teacherId={teacherId}
        submitting={submitting}
        submitLabel="Create Exam"
        onSubmit={handleSubmit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, height: 56,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
});
