// Pending-uploads list — lets an assistant see exactly which marks/payments are
// still saved on the phone and haven't reached the teacher yet. Everything here
// uploads automatically on reconnect; this screen just makes the queue visible
// (and offers a manual "Sync now").
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../lib/theme/store';
import { useOutboxStore, isFailed, type OutboxEntry } from '../../lib/assistant/outbox';
import { readWorkingSet } from '../../lib/assistant/workingSet';

// ─── Display model ──────────────────────────────────────────────────────────
interface QueueRow {
  entryId: string;
  kind: 'attendance' | 'payment' | 'student';
  title: string;       // student name (or a batch summary)
  detail: string;      // "Marked present", "Paid LKR 1,500", …
  createdAt: string;
  attempts: number;
  failed: boolean;     // exhausted retries — needs attention
  error?: string;      // the server's reason, when failed
}

interface AttendanceBody {
  student_id?: string;
  class_id?: string;
  status?: string;
}
interface PaymentBody {
  student_id?: string;
  class_id?: string;
  amount_cents?: number;
  status?: string;
}

function nameFor(classId: string | undefined, studentId: string | undefined): string {
  if (!classId || !studentId) return 'Student';
  const ws = readWorkingSet(classId);
  const s = ws?.students.find((st) => st.id === studentId);
  return s ? `${s.name} · ${s.student_code}` : 'Student';
}

function statusVerb(status?: string): string {
  switch (status) {
    case 'present': return 'Marked present';
    case 'late': return 'Marked late';
    case 'absent': return 'Marked absent';
    default: return 'Attendance';
  }
}

function money(cents?: number, status?: string): string {
  if (!cents) return 'Payment';
  const amount = `LKR ${Math.round(cents / 100).toLocaleString()}`;
  // A partial collection isn't the full fee — say "Collected" so the queue
  // doesn't imply the month is settled.
  return `${status === 'partial' ? 'Collected' : 'Paid'} ${amount}`;
}

// Turn one queued entry (which may be a single row or a batch array) into one
// display row. A batch (e.g. "mark remaining absent") is summarised.
function toRow(entry: OutboxEntry): QueueRow {
  const attempts = entry.attempts ?? 0;
  const failed = isFailed(entry);
  const error = entry.lastError;
  if (Array.isArray(entry.body)) {
    // A batch (e.g. "mark remaining absent") — summarise rather than list each.
    const rows = entry.body as AttendanceBody[];
    return {
      entryId: entry.id,
      kind: entry.kind,
      title: `${rows.length} student${rows.length > 1 ? 's' : ''}`,
      detail: entry.kind === 'attendance' ? statusVerb(rows[0]?.status) : 'Payments',
      createdAt: entry.createdAt,
      attempts,
      failed,
      error,
    };
  }

  if (entry.kind === 'payment') {
    const b = entry.body as PaymentBody;
    return {
      entryId: entry.id,
      kind: 'payment',
      title: nameFor(b.class_id, b.student_id),
      detail: money(b.amount_cents, b.status),
      createdAt: entry.createdAt,
      attempts,
      failed,
      error,
    };
  }

  if (entry.kind === 'student') {
    const b = entry.body as { name?: string };
    return {
      entryId: entry.id,
      kind: 'student',
      title: b.name ?? 'New student',
      detail: 'New student — ID assigned on upload',
      createdAt: entry.createdAt,
      attempts,
      failed,
      error,
    };
  }

  const b = entry.body as AttendanceBody;
  return {
    entryId: entry.id,
    kind: 'attendance',
    title: nameFor(b.class_id, b.student_id),
    detail: statusVerb(b.status),
    createdAt: entry.createdAt,
    attempts,
    failed,
    error,
  };
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function QueueScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);

  const items = useOutboxStore((s) => s.items);
  const flushing = useOutboxStore((s) => s.flushing);
  const removeEntry = useOutboxStore((s) => s.remove);

  const confirmRemove = (row: QueueRow) => {
    Alert.alert(
      'Remove this item?',
      `“${row.title} — ${row.detail}” couldn’t be saved by your teacher’s system. Show your teacher first; removing it clears it from this phone for good.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeEntry(row.entryId) },
      ],
    );
  };

  const rows = items.map(toRow);
  const failedCount = rows.filter((r) => r.failed).length;
  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Pending Uploads</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Explanation banner — turns red if any write has failed to upload. */}
      <View
        style={[
          styles.banner,
          {
            backgroundColor: failedCount ? '#fef2f2' : rows.length ? '#fffbeb' : '#ecfdf5',
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Ionicons
          name={
            failedCount
              ? 'alert-circle-outline'
              : rows.length
                ? 'cloud-upload-outline'
                : 'checkmark-done-circle-outline'
          }
          size={18}
          color={failedCount ? '#dc2626' : rows.length ? '#d97706' : '#059669'}
        />
        <Text
          style={[
            styles.bannerText,
            { color: failedCount ? '#991b1b' : rows.length ? '#92400e' : '#065f46' },
          ]}
        >
          {failedCount
            ? `${failedCount} change${failedCount > 1 ? 's' : ''} couldn't be saved by your teacher's system. Show this screen to your teacher.`
            : rows.length
              ? `${rows.length} change${rows.length > 1 ? 's' : ''} saved on this phone, waiting to reach your teacher. They upload automatically when you're online.`
              : 'All caught up — everything has been sent to your teacher.'}
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.entryId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              {
                backgroundColor: colors.surface,
                borderColor: item.failed ? '#fecaca' : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.rowIcon,
                {
                  backgroundColor: item.failed
                    ? '#fef2f2'
                    : item.kind === 'payment'
                      ? '#f5f3ff'
                      : item.kind === 'student'
                        ? '#fffbeb'
                        : '#eff6ff',
                },
              ]}
            >
              <Ionicons
                name={
                  item.failed
                    ? 'alert-circle-outline'
                    : item.kind === 'payment'
                      ? 'card-outline'
                      : item.kind === 'student'
                        ? 'person-add-outline'
                        : 'checkmark-circle-outline'
                }
                size={20}
                color={
                  item.failed
                    ? '#dc2626'
                    : item.kind === 'payment'
                      ? '#7c3aed'
                      : item.kind === 'student'
                        ? '#f59e0b'
                        : '#2563eb'
                }
              />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={1}>
                {item.detail} · {timeAgo(item.createdAt)}
              </Text>
              {item.failed && item.error ? (
                <Text style={[styles.rowError, { color: '#b91c1c' }]} numberOfLines={2}>
                  {item.error}
                </Text>
              ) : null}
              {item.failed ? (
                <Pressable onPress={() => confirmRemove(item)} hitSlop={6} style={styles.removeBtn}>
                  <Ionicons name="trash-outline" size={13} color="#b91c1c" />
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: item.failed
                    ? '#fee2e2'
                    : item.attempts > 0
                      ? '#fef3c7'
                      : colors.surfaceAlt,
                },
              ]}
            >
              <Ionicons
                name={
                  item.failed
                    ? 'close-circle-outline'
                    : item.attempts > 0
                      ? 'refresh-outline'
                      : 'time-outline'
                }
                size={12}
                color={item.failed ? '#dc2626' : item.attempts > 0 ? '#d97706' : colors.textMuted}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: item.failed ? '#dc2626' : item.attempts > 0 ? '#d97706' : colors.textMuted },
                ]}
              >
                {item.failed ? 'Failed' : item.attempts > 0 ? 'Retrying' : 'Waiting'}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cloud-done-outline" size={44} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Nothing waiting. New marks and payments will appear here until they reach the teacher.
            </Text>
          </View>
        }
      />

      {/* Passive auto-sync status — no button: uploading is automatic. */}
      {rows.length > 0 && (
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          {flushing ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size={16} color="#059669" />
              <Text style={[styles.statusLine, { color: '#059669' }]}>Uploading to your teacher…</Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.statusLine, { color: colors.textMuted }]}>
                Waiting for a connection — these send automatically.
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, height: 56,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },

    banner: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    bannerText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '500' },

    list: { padding: 12, gap: 8, flexGrow: 1 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12,
    },
    rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 14, fontWeight: '700' },
    rowDetail: { fontSize: 12, marginTop: 2 },
    rowError: { fontSize: 11, marginTop: 4, lineHeight: 15, fontWeight: '500' },
    removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
    removeText: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
    statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },

    empty: { alignItems: 'center', paddingVertical: 80, gap: 16, paddingHorizontal: 40 },
    emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 20 },

    footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    statusLine: { fontSize: 13, fontWeight: '600' },
  });
}
