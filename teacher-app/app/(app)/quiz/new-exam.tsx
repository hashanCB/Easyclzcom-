// Create + publish an online exam from a class's question bank, then show the
// join code the teacher gives to students.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore, type ThemeColors } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { useQuestionBank } from '../../../lib/quiz/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { createOnlineExam, type OnlineExam } from '../../../lib/onlineExam/api';
import { useScreenTitle } from '../../../lib/ui/header';

export default function NewOnlineExamScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const teacher = useAuthStore((s) => s.teacher);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const teacherId = teacher?.id ?? 'local';

  const classOptions = useClassOptions(teacherId);
  const [classId, setClassId] = useState('');
  const { questions } = useQuestionBank({ teacherId, classId });
  const bankCount = questions.length;

  const [title, setTitle] = useState('');
  const [count, setCount] = useState('10');
  const [duration, setDuration] = useState('15');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<OnlineExam | null>(null);
  useScreenTitle(created ? 'Exam published' : 'New Online Exam');

  async function handleCreate() {
    if (!classId) { setError('Pick a class first.'); return; }
    if (!title.trim()) { setError('Give the exam a title.'); return; }
    const n = parseInt(count, 10);
    const d = parseInt(duration, 10);
    if (!n || n <= 0) { setError('How many questions?'); return; }
    if (bankCount === 0) { setError('This class has no questions in the bank yet.'); return; }
    if (!d || d <= 0) { setError('Set a time limit (minutes).'); return; }
    setError('');
    setBusy(true);
    try {
      const exam = await createOnlineExam(token, {
        classId,
        title: title.trim(),
        questionCount: Math.min(n, bankCount),
        durationMinutes: d,
      });
      setCreated(exam);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the exam.');
    } finally {
      setBusy(false);
    }
  }

  async function shareCode() {
    if (!created) return;
    try {
      await Share.share({
        message: `Join my exam "${created.title}" on the Easyclz student app.\nExam code: ${created.join_code}\nTime: ${created.duration_minutes} min · ${created.question_count} questions`,
      });
    } catch { /* cancelled */ }
  }

  // ── Success screen: show the join code ──────────────────────────────────────
  if (created) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.doneScroll}>
          <View style={[styles.codeCircle, { backgroundColor: '#05966918' }]}>
            <Ionicons name="checkmark-circle" size={56} color="#059669" />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>{created.title}</Text>
          <Text style={[styles.doneSub, { color: colors.textMuted }]}>
            {created.question_count} questions · {created.duration_minutes} min · {created.total_marks} marks
          </Text>

          <Text style={[styles.codeLabel, { color: colors.textMuted }]}>EXAM CODE — give this to students</Text>
          <View style={[styles.codeBox, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
            <Text style={[styles.codeText, { color: colors.primary }]}>{created.join_code}</Text>
          </View>

          <Pressable onPress={shareCode} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="share-outline" size={18} color={colors.primaryText} />
            <Text style={styles.primaryBtnText}>Share code</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace({ pathname: '/(app)/quiz/results/[id]', params: { id: created.id } })}
            style={[styles.ghostBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.ghostBtnText, { color: colors.text }]}>See who has done it</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.linkBtn}>
            <Text style={[styles.linkText, { color: colors.textMuted }]}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>CLASS</Text>
        <ClassPicker
          classes={classOptions}
          value={classId || undefined}
          onChange={(id) => { setClassId(id ?? ''); setError(''); }}
          colors={colors}
          allowAll={false}
          placeholder="Select a class"
          title="Select a class"
        />
        {classId ? (
          <Text style={[styles.hint, { color: bankCount === 0 ? colors.danger : colors.textMuted }]}>
            {bankCount === 0 ? 'No questions in this class’s bank — add some first.' : `${bankCount} questions available in the bank`}
          </Text>
        ) : null}

        <Text style={[styles.label, { marginTop: 18 }]}>EXAM TITLE</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="e.g. ICT Unit 3 Quiz"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { marginTop: 18 }]}>HOW MANY QUESTIONS</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={count}
              onChangeText={(t) => setCount(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { marginTop: 18 }]}>TIME LIMIT (MIN)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={duration}
              onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>
        <Text style={[styles.hint, { color: colors.textMuted, marginTop: 8 }]}>
          Questions are picked at random from the bank, so each student can get a different set.
        </Text>

        <Pressable
          disabled={busy}
          onPress={handleCreate}
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 28, opacity: busy ? 0.7 : 1 }]}
        >
          {busy ? <ActivityIndicator color={colors.primaryText} /> : (
            <>
              <Ionicons name="rocket-outline" size={18} color={colors.primaryText} />
              <Text style={styles.primaryBtnText}>Publish exam</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 16, paddingBottom: 60 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, color: colors.textMuted },
    hint: { fontSize: 12.5, lineHeight: 17 },
    input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    row: { flexDirection: 'row', gap: 12 },
    rowItem: { flex: 1 },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: colors.danger, marginBottom: 12 },
    errorText: { fontSize: 13, flex: 1 },
    primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, minHeight: 52 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    doneScroll: { padding: 24, alignItems: 'center' },
    codeCircle: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 10 },
    doneTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
    doneSub: { fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 24 },
    codeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    codeBox: { borderWidth: 2, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 36, marginTop: 10, marginBottom: 24 },
    codeText: { fontSize: 40, fontWeight: '900', letterSpacing: 6, fontFamily: 'monospace' },
    ghostBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', alignSelf: 'stretch', marginTop: 12 },
    ghostBtnText: { fontSize: 15, fontWeight: '700' },
    linkBtn: { paddingVertical: 14, marginTop: 4 },
    linkText: { fontSize: 14, fontWeight: '600' },
  });
}
