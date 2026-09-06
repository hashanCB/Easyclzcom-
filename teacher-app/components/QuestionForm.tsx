// Add / edit one question-bank item (MCQ or True/False).
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
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore, type ThemeColors } from '../lib/theme/store';
import { ExamImagePicker } from './ExamImagePicker';

export type QuestionType = 'mcq' | 'true_false';

export interface QuestionFormValues {
  questionType: QuestionType;
  questionText: string;
  options: string[];
  correctIndex: number;
  marks: number;
  questionImage: string | null;       // R2 key, or null
  optionImages: (string | null)[];    // R2 key per option (aligned to options)
}

interface Props {
  initial?: Partial<QuestionFormValues>;
  submitting?: boolean;
  submitLabel: string;
  /** Supabase token for R2 uploads. */
  accessToken: string;
  /** Build the R2 key for an image slot ('q' for question, 'o0','o1',… for options). */
  keyForSlot: (slot: string) => string;
  onSubmit: (values: QuestionFormValues) => void;
}

const MAX_OPTIONS = 5;

export function QuestionForm({ initial, submitting, submitLabel, accessToken, keyForSlot, onSubmit }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);

  const [type, setType] = useState<QuestionType>(initial?.questionType ?? 'mcq');
  const [text, setText] = useState(initial?.questionText ?? '');
  const [options, setOptions] = useState<string[]>(
    initial?.questionType === 'true_false'
      ? ['True', 'False']
      : (initial?.options && initial.options.length >= 2 ? initial.options : ['', '']),
  );
  const [correct, setCorrect] = useState(initial?.correctIndex ?? 0);
  const [marks, setMarks] = useState(initial?.marks != null ? String(initial.marks) : '1');
  const [qImage, setQImage] = useState<string | null>(initial?.questionImage ?? null);
  const [optImages, setOptImages] = useState<(string | null)[]>(() => {
    const base = initial?.optionImages ?? [];
    const len = initial?.questionType === 'true_false' ? 2 : (initial?.options?.length ?? 2);
    return Array.from({ length: len }, (_, i) => base[i] ?? null);
  });

  function switchType(t: QuestionType) {
    setType(t);
    if (t === 'true_false') {
      setOptions(['True', 'False']);
      setOptImages((p) => [p[0] ?? null, p[1] ?? null]);
      setCorrect((c) => (c > 1 ? 0 : c));
    } else {
      setOptions((prev) => (prev[0] === 'True' && prev[1] === 'False' ? ['', ''] : prev));
    }
  }

  function setOption(i: number, v: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
    setOptImages((prev) => [...prev, null]);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setOptImages((prev) => prev.filter((_, idx) => idx !== i));
    setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
  }

  function handleSubmit() {
    if (!text.trim() && !qImage) return Alert.alert('Missing', 'Add the question — type it or add an image.');
    const opts = options.map((o) => o.trim());
    if (type === 'mcq') {
      // Each option must have text OR an image.
      const missing = opts.some((o, i) => !o && !optImages[i]);
      if (opts.length < 2 || missing) {
        return Alert.alert('Missing', 'Every answer choice needs text or an image (at least 2).');
      }
    }
    const m = parseInt(marks, 10);
    if (!m || m <= 0) return Alert.alert('Missing', 'Marks must be greater than 0.');
    if (correct < 0 || correct >= opts.length) return Alert.alert('Missing', 'Choose the correct answer.');

    onSubmit({
      questionType: type, questionText: text.trim(), options: opts, correctIndex: correct, marks: m,
      questionImage: qImage, optionImages: optImages,
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={88}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Type */}
        <Text style={styles.label}>QUESTION TYPE</Text>
        <View style={styles.typeRow}>
          <TypeChip label="Multiple choice" active={type === 'mcq'} onPress={() => switchType('mcq')} colors={colors} />
          <TypeChip label="True / False" active={type === 'true_false'} onPress={() => switchType('true_false')} colors={colors} />
        </View>

        {/* Question */}
        <Text style={[styles.label, { marginTop: 18 }]}>QUESTION</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="e.g. What is 2 + 2?"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
        />
        <View style={{ marginTop: 8 }}>
          <ExamImagePicker
            r2Key={qImage}
            onUploaded={setQImage}
            onRemove={() => setQImage(null)}
            accessToken={accessToken}
            r2KeyBuilder={() => keyForSlot('q')}
            label="Add question image (optional)"
            height={150}
          />
        </View>

        {/* Answers — tap the circle to mark the correct one */}
        <Text style={[styles.label, { marginTop: 18 }]}>
          ANSWERS · tap the circle to mark the correct one
        </Text>
        {options.map((opt, i) => {
          const isCorrect = correct === i;
          const editable = type === 'mcq';
          return (
            <View key={i} style={{ marginBottom: 8 }}>
              <View style={[styles.optRow, { borderColor: isCorrect ? '#059669' : colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}>
                <Pressable onPress={() => setCorrect(i)} hitSlop={8} style={styles.radio}>
                  <Ionicons
                    name={isCorrect ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={isCorrect ? '#059669' : colors.textMuted}
                  />
                </Pressable>
                {editable ? (
                  <TextInput
                    style={[styles.optInput, { color: colors.text }]}
                    placeholder={`Choice ${i + 1} (or add image)`}
                    placeholderTextColor={colors.textMuted}
                    value={opt}
                    onChangeText={(v) => setOption(i, v)}
                  />
                ) : (
                  <Text style={[styles.optInput, { color: colors.text, fontWeight: '700' }]}>{opt}</Text>
                )}
                {editable && options.length > 2 ? (
                  <Pressable onPress={() => removeOption(i)} hitSlop={8} style={styles.removeBtn}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              {editable ? (
                <View style={{ marginLeft: 36, marginTop: 6 }}>
                  <ExamImagePicker
                    r2Key={optImages[i] ?? null}
                    onUploaded={(k) => setOptImages((p) => p.map((x, idx) => (idx === i ? k : x)))}
                    onRemove={() => setOptImages((p) => p.map((x, idx) => (idx === i ? null : x)))}
                    accessToken={accessToken}
                    r2KeyBuilder={() => keyForSlot(`o${i}`)}
                    label={`Image for choice ${i + 1} (optional)`}
                    height={90}
                  />
                </View>
              ) : null}
            </View>
          );
        })}

        {type === 'mcq' && options.length < MAX_OPTIONS ? (
          <Pressable onPress={addOption} style={[styles.addOpt, { borderColor: colors.border }]}>
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={[styles.addOptText, { color: colors.primary }]}>Add another choice</Text>
          </Pressable>
        ) : null}

        {/* Marks */}
        <Text style={[styles.label, { marginTop: 18 }]}>MARKS FOR THIS QUESTION</Text>
        <TextInput
          style={[styles.input, { width: 100, color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          value={marks}
          onChangeText={(t) => setMarks(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={colors.textMuted}
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

function TypeChip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: ThemeColors }) {
  return (
    <Pressable
      onPress={onPress}
      style={[qs.chip, { backgroundColor: active ? colors.primary : colors.surfaceAlt, borderColor: active ? colors.primary : colors.border }]}
    >
      <Text style={[qs.chipText, { color: active ? '#fff' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const qs = StyleSheet.create({
  chip: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '700' },
});

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 120 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, color: colors.textMuted },
    typeRow: { flexDirection: 'row', gap: 10 },
    input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
    multiline: { minHeight: 70, paddingTop: 11 },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
    radio: { padding: 4 },
    optInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
    removeBtn: { padding: 6 },
    addOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, marginTop: 2 },
    addOptText: { fontSize: 14, fontWeight: '700' },
    submitBtn: { borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
