// Manual marks entry (U41) — fast per-student mark entry for one exam.
// Each row saves on blur; marks above the exam total are rejected inline.
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../../lib/theme/store';
import { useScreenTitle } from '../../../../lib/ui/header';
import { useExam } from '../../../../lib/exams/hooks';
import { useStudentsList } from '../../../../lib/students/hooks';
import { useExamMarks, upsertMark } from '../../../../lib/marks/hooks';
import { newId } from '../../../../lib/uuid';

export default function MarksEntryScreen() {
  const { id: examId } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Enter Marks');
  const colors = useThemeStore((s) => s.colors);

  const { exam, loading: examLoading } = useExam(examId);
  const { students } = useStudentsList({
    teacherId: exam?.teacherId,
    classId: exam?.classId,
    status: 'active',
  });
  const { marks, loading: marksLoading, refresh } = useExamMarks(examId);

  const [search, setSearch] = useState('');
  // Local edit buffer: studentId -> typed text. Seeded from saved marks lazily.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  const total = exam?.totalMarks ?? 0;

  function valueFor(studentId: string): string {
    if (studentId in drafts) return drafts[studentId];
    const saved = marks.get(studentId);
    return saved ? String(saved.mark) : '';
  }

  function onChange(studentId: string, text: string) {
    // digits + single dot only
    const cleaned = text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setDrafts((d) => ({ ...d, [studentId]: cleaned }));
  }

  function onBlur(studentId: string) {
    const raw = valueFor(studentId).trim();
    if (raw === '') return; // nothing typed — leave as-is
    const num = parseFloat(raw);
    const bad = isNaN(num) || num < 0 || num > total;
    setInvalid((s) => {
      const next = new Set(s);
      if (bad) next.add(studentId); else next.delete(studentId);
      return next;
    });
    if (bad || !exam) return;

    const now = new Date().toISOString();
    const existing = marks.get(studentId);
    upsertMark({
      id: existing?.id ?? newId(),
      teacherId: exam.teacherId,
      examId: exam.id,
      studentId,
      mark: num,
      remark: existing?.remark ?? null,
      deletedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      clientUpdatedAt: now,
      syncedAt: null,
    });
    refresh();
  }

  const filtered = useMemo(
    () =>
      students.filter(
        (s) =>
          !search.trim() ||
          s.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          s.studentCode.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [students, search],
  );

  const enteredCount = students.filter((s) => marks.has(s.id)).length;
  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>

      {examLoading || marksLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !exam ? (
        <View style={styles.center}><Text style={{ color: colors.textMuted }}>Exam not found.</Text></View>
      ) : (
        <>
          {/* Exam summary strip */}
          <View style={[styles.summary, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[styles.examTitle, { color: colors.text }]} numberOfLines={1}>{exam.title}</Text>
            <View style={styles.summaryMeta}>
              <Text style={[styles.summaryText, { color: colors.textMuted }]}>
                Out of {exam.totalMarks}
              </Text>
              <Text style={[styles.summaryText, { color: colors.primary }]}>
                {enteredCount}/{students.length} entered
              </Text>
            </View>
          </View>

          {/* Search */}
          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name or student ID…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={40} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {students.length === 0 ? 'No students in this class.' : 'No students match your search.'}
                </Text>
              </View>
            ) : (
              filtered.map((s) => {
                const isInvalid = invalid.has(s.id);
                const saved = marks.has(s.id);
                return (
                  <View
                    key={s.id}
                    style={[styles.row, { backgroundColor: colors.surface, borderColor: isInvalid ? colors.danger : colors.border }]}
                  >
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{s.name}</Text>
                      <Text style={[styles.rowCode, { color: colors.textMuted }]}>{s.studentCode}</Text>
                      {isInvalid && (
                        <Text style={[styles.invalidText, { color: colors.danger }]}>
                          Must be 0–{total}
                        </Text>
                      )}
                    </View>
                    <View style={styles.markBox}>
                      <TextInput
                        style={[
                          styles.markInput,
                          { color: colors.text, borderColor: isInvalid ? colors.danger : colors.border, backgroundColor: colors.surfaceAlt },
                        ]}
                        value={valueFor(s.id)}
                        onChangeText={(t) => onChange(s.id, t)}
                        onEndEditing={() => onBlur(s.id)}
                        onBlur={() => onBlur(s.id)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={colors.textMuted}
                        returnKeyType="next"
                        selectTextOnFocus
                      />
                      <Text style={[styles.outOf, { color: colors.textMuted }]}>/{total}</Text>
                      {saved && !isInvalid && (
                        <Ionicons name="checkmark-circle" size={16} color="#059669" />
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, height: 56,
    },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },

    summary: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    examTitle: { fontSize: 15, fontWeight: '700' },
    summaryMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
    summaryText: { fontSize: 12, fontWeight: '600' },

    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 4 },

    scroll: { padding: 12, paddingBottom: 64 },
    empty: { alignItems: 'center', paddingVertical: 64, gap: 14 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 240 },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8,
    },
    rowMain: { flex: 1 },
    rowName: { fontSize: 14, fontWeight: '600' },
    rowCode: { fontSize: 12, marginTop: 1 },
    invalidText: { fontSize: 11, marginTop: 3, fontWeight: '600' },

    markBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    markInput: {
      width: 64, borderWidth: 1.5, borderRadius: 8,
      paddingVertical: 8, paddingHorizontal: 8, fontSize: 16, fontWeight: '700', textAlign: 'center',
    },
    outOf: { fontSize: 13, fontWeight: '600' },
  });
}
