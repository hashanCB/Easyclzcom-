// Teacher reviews join requests sent by students from the portal (class code
// flow). Accept → server creates the student record + links the portal account
// (or links a student the teacher already added manually); Reject → declines.
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { uiAlert } from '../../../lib/uiAlert';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useScreenTitle } from '../../../lib/ui/header';
import { useClassOptions, useStudentsList } from '../../../lib/students/hooks';
import {
  usePendingJoinRequests,
  respondJoinRequest,
  type JoinRequest,
} from '../../../lib/students/joinRequests';

function findLocalPhoneMatch(classId: string, phone: string) {
  try {
    const repo = require('../../../db/repositories/studentsRepo').studentsRepo;
    return repo.findByPhoneInClass(classId, phone) ?? null;
  } catch {
    return null;
  }
}

export default function JoinRequestsScreen() {
  useScreenTitle('Join Requests');
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const teacherId = teacher?.id ?? '';

  const { items, loading, refresh, setItems } = usePendingJoinRequests(teacherId, token);
  const classOptions = useClassOptions(teacherId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Request whose "link to existing student" picker is open.
  const [linkingRequest, setLinkingRequest] = useState<JoinRequest | null>(null);

  function classLabel(classId: string) {
    const c = classOptions.find((o) => o.id === classId);
    return c ? c.label : 'Class';
  }

  async function doAccept(req: JoinRequest, existingStudentId?: string) {
    setBusyId(req.id);
    try {
      await respondJoinRequest(req.id, 'accept', token, existingStudentId);
      setItems((prev) => prev.filter((r) => r.id !== req.id));
      uiAlert(
        'Student added',
        existingStudentId
          ? `${req.student_name}'s account is now linked to your existing student record.`
          : `${req.student_name} is now in your roster. They appear in your list after the next sync.`,
      );
    } catch (e) {
      uiAlert('Could not accept', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  // Accept: check local DB for a student with the same phone in the same class.
  // If found, suggest linking instead of creating a duplicate.
  function onAccept(req: JoinRequest) {
    const match = findLocalPhoneMatch(req.class_id, req.student_phone);

    if (match) {
      Alert.alert(
        `Phone matches existing student`,
        `${req.student_phone} is already saved as "${match.name}" (${match.studentCode}) in this class. Link this account to that record, or add as a new student.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add as new', onPress: () => void doAccept(req) },
          {
            text: `Link to ${match.name}`,
            onPress: () => void doAccept(req, match.id),
          },
        ],
      );
    } else {
      Alert.alert(
        `Add ${req.student_name}?`,
        'Is this a new student, or someone already in your student list?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Already in my list…', onPress: () => setLinkingRequest(req) },
          { text: 'Add as new student', onPress: () => void doAccept(req) },
        ],
      );
    }
  }

  function onReject(req: JoinRequest) {
    Alert.alert(
      'Reject this request?',
      `${req.student_name} will not be added to ${classLabel(req.class_id)}. They can request again with the class code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setBusyId(req.id);
            try {
              await respondJoinRequest(req.id, 'reject', token);
              setItems((prev) => prev.filter((r) => r.id !== req.id));
            } catch (e) {
              uiAlert('Could not reject', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-outline" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No pending requests. Students who enter your class code will appear here for approval.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}
            />
          }
        >
          {items.map((req) => {
            const busy = busyId === req.id;
            const phoneMatch = findLocalPhoneMatch(req.class_id, req.student_phone);
            return (
              <View key={req.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.name, { color: colors.text }]}>{req.student_name}</Text>
                <Text style={[styles.cls, { color: colors.textMuted }]}>{classLabel(req.class_id)}</Text>

                {phoneMatch && (
                  <View style={[styles.matchBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                    <Ionicons name="link-outline" size={13} color={colors.primary} />
                    <Text style={[styles.matchText, { color: colors.primary }]}>
                      Phone matches "{phoneMatch.name}" ({phoneMatch.studentCode}) in your roster
                    </Text>
                  </View>
                )}

                <View style={styles.details}>
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.detailText, { color: colors.text }]}>{req.student_phone}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.detailText, { color: colors.text }]}>
                      Requested {new Date(req.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    disabled={busy}
                    onPress={() => onReject(req)}
                    style={({ pressed }) => [styles.btn, styles.rejectBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[styles.btnText, { color: '#dc2626' }]}>Reject</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => onAccept(req)}
                    style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={[styles.btnText, { color: '#fff' }]}>Accept</Text>}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {linkingRequest && (
        <LinkExistingPicker
          request={linkingRequest}
          teacherId={teacherId}
          classLabel={classLabel(linkingRequest.class_id)}
          colors={colors}
          onClose={() => setLinkingRequest(null)}
          onPick={(studentId) => {
            const req = linkingRequest;
            setLinkingRequest(null);
            void doAccept(req, studentId);
          }}
        />
      )}
    </View>
  );
}

// Modal list of the teacher's existing students in the requested class, so the
// portal account can be linked to a record that was added manually.
function LinkExistingPicker({
  request,
  teacherId,
  classLabel,
  colors,
  onClose,
  onPick,
}: {
  request: JoinRequest;
  teacherId: string;
  classLabel: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onClose: () => void;
  onPick: (studentId: string) => void;
}) {
  const filter = useMemo(
    () => ({ teacherId, classId: request.class_id, status: 'active' as const, search: '' }),
    [teacherId, request.class_id],
  );
  const { students, loading } = useStudentsList(filter);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.backdrop}>
        <View style={[pickerStyles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[pickerStyles.title, { color: colors.text }]}>
            Link {request.student_name} to…
          </Text>
          <Text style={[pickerStyles.subtitle, { color: colors.textMuted }]}>
            Pick the existing record in {classLabel}. Their account joins that record — payments and attendance history stay together.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : students.length === 0 ? (
            <Text style={[pickerStyles.empty, { color: colors.textMuted }]}>
              No students in this class yet. Use “Add as new student” instead.
            </Text>
          ) : (
            <FlatList
              data={students}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onPick(item.id)}
                  style={({ pressed }) => [
                    pickerStyles.row,
                    { borderBottomColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[pickerStyles.rowName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[pickerStyles.rowCode, { color: colors.textMuted }]}>{item.studentCode}</Text>
                  </View>
                  <Ionicons name="link-outline" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            />
          )}

          <Pressable onPress={onClose} style={[pickerStyles.cancelBtn, { borderColor: colors.border }]}>
            <Text style={[pickerStyles.cancelText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 32 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowCode: { fontSize: 12, marginTop: 2 },
  cancelBtn: {
    marginTop: 14, height: 46, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
});

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    scroll: { padding: 16, paddingBottom: 64, gap: 12 },
    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, gap: 4 },
    name: { fontSize: 16, fontWeight: '700' },
    cls: { fontSize: 13 },
    matchBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: 4,
    },
    matchText: { fontSize: 12, flex: 1, lineHeight: 16 },
    details: { gap: 6, marginTop: 8 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailText: { fontSize: 13 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    btn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rejectBtn: { borderWidth: 1, backgroundColor: 'transparent' },
    btnText: { fontSize: 15, fontWeight: '700' },
  });
}
