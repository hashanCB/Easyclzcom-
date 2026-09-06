// Shared create/edit form for exams (U40). The class selection drives the
// exam's grade/batch/subject/language so an exam always belongs to one class.
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useThemeStore } from '../lib/theme/store';
import { useClassOptions } from '../lib/students/hooks';

export interface ExamFormValues {
  title: string;
  classId: string;
  grade: string;
  batch: string;
  subject: string;
  language: string;
  examDate: string;
  totalMarks: number;
  remark: string | null;
}

interface Props {
  teacherId: string;
  initial?: Partial<ExamFormValues>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: ExamFormValues) => void;
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

export function ExamForm({ teacherId, initial, submitting, submitLabel, onSubmit }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const classOptions = useClassOptions(teacherId);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [classId, setClassId] = useState(initial?.classId ?? '');
  const [examDate, setExamDate] = useState(initial?.examDate ?? new Date().toISOString().slice(0, 10));
  const [totalMarks, setTotalMarks] = useState(
    initial?.totalMarks != null ? String(initial.totalMarks) : '100',
  );
  const [remark, setRemark] = useState(initial?.remark ?? '');

  function handleSubmit() {
    if (!title.trim()) return Alert.alert('Validation', 'Exam title is required.');
    if (!classId) return Alert.alert('Validation', 'Please select a class.');
    if (!isValidDate(examDate)) return Alert.alert('Validation', 'Exam date must be YYYY-MM-DD.');
    const marks = parseInt(totalMarks, 10);
    if (!marks || marks <= 0) return Alert.alert('Validation', 'Total marks must be greater than 0.');

    const cls = classOptions.find((c) => c.id === classId);
    if (!cls) return Alert.alert('Validation', 'Selected class is no longer available.');

    onSubmit({
      title: title.trim(),
      classId,
      grade: cls.grade,
      batch: cls.batch,
      subject: cls.subject,
      language: cls.language,
      examDate,
      totalMarks: marks,
      remark: remark.trim() || null,
    });
  }

  const styles = buildStyles(colors);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets>
      <Text style={[styles.label, { color: colors.textMuted }]}>EXAM TITLE</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        placeholder="e.g. Data Communication — Mid Term"
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>CLASS</Text>
      {classOptions.length === 0 ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>No active classes — add a class first.</Text>
      ) : (
        <View style={styles.chipWrap}>
          {classOptions.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setClassId(c.id)}
              style={[styles.chip, { backgroundColor: classId === c.id ? colors.primary : colors.surfaceAlt, borderColor: classId === c.id ? colors.primary : colors.border }]}
            >
              <Text style={[styles.chipText, { color: classId === c.id ? '#fff' : colors.text }]}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>EXAM DATE</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={examDate}
            onChangeText={setExamDate}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.rowItem}>
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>TOTAL MARKS</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="100"
            placeholderTextColor={colors.textMuted}
            value={totalMarks}
            onChangeText={(t) => setTotalMarks(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />
        </View>
      </View>

      <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>REMARK (OPTIONAL)</Text>
      <TextInput
        style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        placeholder="Any notes about this exam…"
        placeholderTextColor={colors.textMuted}
        value={remark}
        onChangeText={setRemark}
        multiline
        textAlignVertical="top"
      />

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.primary, opacity: pressed || submitting ? 0.85 : 1 }]}
      >
        <Text style={styles.submitText}>{submitting ? 'Saving…' : submitLabel}</Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 120 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
    hint: { fontSize: 13, fontStyle: 'italic' },
    input: {
      borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
    },
    multiline: { minHeight: 80, paddingTop: 11 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    row: { flexDirection: 'row', gap: 12 },
    rowItem: { flex: 1 },
    submitBtn: { borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
