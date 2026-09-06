// Exam list (U40) — exams grouped under their class, with a class filter.
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback } from 'react';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { useExamsList } from '../../../lib/exams/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { useScreenTitle } from '../../../lib/ui/header';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ExamsListScreen() {
  useScreenTitle('Exams');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? 'local');
  const classOptions = useClassOptions(teacherId);

  const [classId, setClassId] = useState<string | undefined>(undefined);
  const { exams, refresh } = useExamsList({ teacherId, classId });

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Online-exam system entry points. */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ONLINE EXAM SYSTEM</Text>
      <Pressable
        onPress={() => router.push('/(app)/quiz/bank')}
        style={({ pressed }) => [styles.bankBtn, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.iconBox, { backgroundColor: '#4f46e518' }]}>
          <Ionicons name="albums-outline" size={20} color="#4f46e5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bankTitle, { color: colors.text }]}>Question Bank</Text>
          <Text style={[styles.bankSub, { color: colors.textMuted }]}>Build MCQ / True-False questions per class</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/(app)/quiz/exams')}
        style={({ pressed }) => [styles.bankBtn, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 8 }, pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.iconBox, { backgroundColor: '#05966918' }]}>
          <Ionicons name="rocket-outline" size={20} color="#059669" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bankTitle, { color: colors.text }]}>Online Exams</Text>
          <Text style={[styles.bankSub, { color: colors.textMuted }]}>Publish a timed exam with a join code</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {/* Paper exams — header + add button */}
      <View style={styles.examsHeaderRow}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 0, marginBottom: 0 }]}>EXAMS</Text>
        <Pressable
          onPress={() => router.push('/(app)/exams/new')}
          style={({ pressed }) => [styles.newExamBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.newExamText}>New</Text>
        </Pressable>
      </View>

      {/* Class filter */}
      {classOptions.length > 0 && (
        <View style={styles.filterWrap}>
          <ClassPicker
            classes={classOptions}
            value={classId}
            onChange={setClassId}
            colors={colors}
          />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {exams.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="school-outline" size={44} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No exams yet. Tap + to create one.
            </Text>
          </View>
        ) : (
          exams.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => router.push({ pathname: '/(app)/exams/[id]', params: { id: e.id } })}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: '#eef2ff' }]}>
                <Ionicons name="document-text-outline" size={20} color="#4f46e5" />
              </View>
              <View style={styles.cardMain}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{e.title}</Text>
                <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {e.grade} · {e.batch} · {e.subject}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                  {fmtDate(e.examDate)}  ·  Out of {e.totalMarks}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    filterWrap: { paddingHorizontal: 16, paddingBottom: 4 },

    // Shared section label for the two groups (Online Exam System / Exams).
    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
      marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    },

    bankBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: 16, marginTop: 0,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12,
    },
    bankTitle: { fontSize: 14, fontWeight: '700' },
    bankSub: { fontSize: 12, marginTop: 1 },

    // One consistent icon box used by both the entry buttons and the exam cards.
    iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    examsHeaderRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: 16, marginTop: 20, marginBottom: 8,
    },
    newExamBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 12, height: 32, borderRadius: 8,
    },
    newExamText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    scroll: { paddingHorizontal: 16, paddingBottom: 48 },
    empty: { alignItems: 'center', paddingVertical: 72, gap: 14 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 240, lineHeight: 20 },

    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8,
    },
    cardMain: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: '700' },
    cardSub: { fontSize: 12, marginTop: 2 },
    cardMeta: { fontSize: 12, marginTop: 3 },
  });
}
