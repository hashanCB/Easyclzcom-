// Reusable "Marked Today" correction sheet for the assistant app.
//
// Lets an assistant fix a wrong attendance mark WITHOUT re-scanning the card —
// useful when the student has already left the doorway. It re-uses the same
// natural-key (student, class, day) attendance upsert as a normal mark, so a
// correction overwrites the existing row (no duplicate, no extra "marked"
// count) and is logged server-side via the audit_attendance_change trigger.
//
// It reads the marked list from the local working-set snapshot, so it works
// offline; corrections queue in the outbox and upload when the signal returns.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../lib/theme/store';
import { useOutboxStore } from '../lib/assistant/outbox';
import { newId } from '../lib/uuid';
import {
  readWorkingSet,
  applyLocalAttendance,
  type AttendanceStatus,
} from '../lib/assistant/workingSet';

const STATUS_COLORS: Record<AttendanceStatus, { fg: string; bg: string }> = {
  present: { fg: '#059669', bg: '#d1fae5' },
  late: { fg: '#d97706', bg: '#fef3c7' },
  absent: { fg: '#dc2626', bg: '#fee2e2' },
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface MarkedStudent {
  id: string;
  name: string;
  student_code: string;
  status: AttendanceStatus;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  classId: string;
  teacherId: string;
  /** auth user id of the assistant — stored as marked_by_user_id. */
  markedById: string | undefined;
  /** Access token used to flush the correction to the server (best-effort). */
  token: string;
  /** Optional: called after any correction so the parent can refresh counts. */
  onChanged?: () => void;
}

export function AttendanceFixSheet({ visible, onClose, classId, teacherId, markedById, token, onChanged }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const enqueue = useOutboxStore((s) => s.enqueue);
  const flush = useOutboxStore((s) => s.flush);

  const [markedList, setMarkedList] = useState<MarkedStudent[]>([]);

  // Seed the list from the local snapshot each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const ws = readWorkingSet(classId);
    const today = todayIso();
    if (!ws || ws.date !== today) {
      setMarkedList([]);
      return;
    }
    setMarkedList(
      ws.students
        .filter((s) => ws.attendance[s.id])
        .map((s) => ({
          id: s.id,
          name: s.name,
          student_code: s.student_code,
          status: ws.attendance[s.id] as AttendanceStatus,
        })),
    );
  }, [visible, classId]);

  function changeAttendance(studentId: string, status: AttendanceStatus) {
    const now = new Date().toISOString();
    enqueue('attendance', {
      id: newId(),
      teacher_id: teacherId,
      student_id: studentId,
      class_id: classId,
      date: todayIso(),
      status,
      sms_intent: false,
      marked_by_user_id: markedById,
      marked_by_role: 'assistant',
      created_at: now,
      updated_at: now,
      client_updated_at: now,
    });
    applyLocalAttendance(classId, studentId, status);
    setMarkedList((prev) => prev.map((m) => (m.id === studentId ? { ...m, status } : m)));
    if (token) void flush(token);
    onChanged?.();
  }

  const styles = buildStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>Marked Today</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Tap a status to correct a wrong mark. Changes are saved and logged.
          </Text>

          {markedList.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={28} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No students marked yet today.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {markedList.map((m) => (
                <View key={m.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={[styles.rowCode, { color: colors.textMuted }]}>{m.student_code}</Text>
                  </View>
                  <View style={styles.segments}>
                    {(['present', 'late', 'absent'] as AttendanceStatus[]).map((st) => {
                      const active = m.status === st;
                      const c = STATUS_COLORS[st];
                      return (
                        <Pressable
                          key={st}
                          onPress={() => { if (!active) changeAttendance(m.id, st); }}
                          style={[
                            styles.seg,
                            { borderColor: active ? c.fg : colors.border, backgroundColor: active ? c.bg : 'transparent' },
                          ]}
                        >
                          <Text style={[styles.segText, { color: active ? c.fg : colors.textMuted }]}>
                            {st === 'present' ? 'Present' : st === 'late' ? 'Late' : 'Absent'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingBottom: 32, maxHeight: '80%',
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 18, fontWeight: '700' },
    sub: { fontSize: 13, marginTop: 4, marginBottom: 8 },
    scroll: { marginTop: 4 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowInfo: { flex: 1, minWidth: 0 },
    rowName: { fontSize: 14, fontWeight: '700' },
    rowCode: { fontSize: 12, marginTop: 1 },
    segments: { flexDirection: 'row', gap: 6 },
    seg: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    segText: { fontSize: 11, fontWeight: '700' },
    empty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 36 },
    emptyText: { fontSize: 14, fontWeight: '500' },
  });
}
