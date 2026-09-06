// Assistant "Add Student" — register a student offline-first. The row is queued
// in the outbox and replayed to the cloud when online; the server assigns the
// per-teacher STU-#### code on insert (see migration 20260608140000).
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StudentForm } from '../../components/StudentForm';
import { useAssistantStore } from '../../lib/assistant/store';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../../lib/theme/store';
import { useOutboxStore } from '../../lib/assistant/outbox';
import { readCachedClasses } from '../../lib/assistant/classCache';
import { rowToApi } from '../../lib/sync/client';
import { uiAlert } from '../../lib/uiAlert';

export default function AssistantAddStudentScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { profile, permissions } = useAssistantStore(
    useShallow((s) => ({ profile: s.profile, permissions: s.permissions })),
  );
  const enqueue = useOutboxStore((s) => s.enqueue);

  const teacherId = profile?.teacher_id ?? '';
  const assistantId = profile?.id ?? '';

  // Classes this assistant may add students to = cached class metadata ∩ the
  // can_add_student permission set. Metadata gives grade/batch/subject/language
  // to auto-fill the (NOT NULL) student fields.
  const classOptions = useMemo(() => {
    const allowed = new Set(
      permissions.filter((p) => p.can_add_student).map((p) => p.class_id),
    );
    return readCachedClasses()
      .filter((c) => allowed.has(c.id))
      .map((c) => ({
        id: c.id,
        label: `${c.grade} · ${c.batch} · ${c.subject}`,
        grade: c.grade,
        batch: c.batch,
        subject: c.subject,
        language: c.language,
      }));
  }, [permissions]);

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Add Student</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.note, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={[styles.noteText, { color: colors.textMuted }]}>
          The student is added to the class right away — no review needed. The
          Student ID is assigned automatically. You can add students offline —
          they upload when you reconnect.
        </Text>
      </View>

      {classOptions.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No classes available to add students to. Open the home screen while online to
            load your classes, or ask your teacher for the "Add students" permission.
          </Text>
        </View>
      ) : (
        <StudentForm
          teacherId={teacherId}
          classOptions={classOptions}
          hidePhoto
          allowWelcomeSms={false}
          onCancel={() => router.back()}
          onSubmit={(data) => {
            if (Platform.OS === 'web') {
              uiAlert('Not available', 'Adding students works in the mobile app.');
              return;
            }
            // Insert a REAL student straight into the live roster — no teacher
            // review. RLS allows assistants with can_add_student; the DB trigger
            // assigns the STU-#### code (we omit student_code). rowToApi gives us
            // the same cloud-ready, enum-normalized shape the teacher sync uses.
            const now = new Date().toISOString();
            const row = rowToApi(
              {
                ...data,
                studentCode: undefined, // trigger assigns server-side
                createdByAssistantId: assistantId,
                joinStatus: 'confirmed',
                isActive: true,
                createdAt: data.createdAt ?? now,
                updatedAt: now,
                clientUpdatedAt: now,
              },
              'students',
            );
            enqueue('student', row);
            uiAlert('Student added', `${data.name} is now in the class. The ID is assigned automatically.`);
            router.back();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    note: {
      flexDirection: 'row', gap: 8, alignItems: 'flex-start',
      margin: 12, padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    },
    noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
    empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 16 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  });
}
