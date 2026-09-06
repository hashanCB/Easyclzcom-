// Chat thread list (U37) — one row per student conversation, with unread
// badges, a broadcast entry point, and a student picker to start new chats.
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useStudentsList } from '../../../lib/students/hooks';
import { fetchThreads, ensureThread, type ChatThread } from '../../../lib/chat';
import { useScreenTitle } from '../../../lib/ui/header';

function relTime(iso: string | null): string {
  if (!iso) return 'No messages yet';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function ChatListScreen() {
  useScreenTitle('Chat');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? '');
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const { students } = useStudentsList({ teacherId, status: 'active' });

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setThreads(await fetchThreads(teacherId, token));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teacherId, token]);

  // Reload on focus + poll every 10s while the screen is open.
  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
    pollRef.current = setInterval(load, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]));

  async function startChat(studentId: string) {
    setStarting(true);
    try {
      const threadId = await ensureThread(teacherId, studentId, token);
      setPickerOpen(false);
      setSearch('');
      router.push({ pathname: '/(app)/chat/[id]', params: { id: threadId } });
    } catch {
      // surfaced minimally — keep picker open for retry
    } finally {
      setStarting(false);
    }
  }

  const filteredStudents = students.filter((s) =>
    !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {threads.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={44} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No conversations yet. Start a chat with a student or send a broadcast.
              </Text>
            </View>
          ) : (
            threads.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/(app)/chat/[id]', params: { id: t.id } })}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: '#db277718' }]}>
                  <Text style={[styles.avatarText, { color: '#db2777' }]}>
                    {initials(t.students?.name ?? '?')}
                  </Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {t.students?.name ?? 'Student'}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
                    {t.students ? `${t.students.grade} · ${t.students.batch}` : ''}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowTime, { color: colors.textMuted }]}>
                    {relTime(t.last_message_at)}
                  </Text>
                  {t.unread_for_teacher > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{t.unread_for_teacher}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {/* Broadcast FAB */}
      <Pressable
        onPress={() => router.push('/(app)/chat/broadcast')}
        style={({ pressed }) => [styles.broadcastFab, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="megaphone-outline" size={22} color={colors.primary} />
      </Pressable>

      {/* New chat FAB */}
      <Pressable
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="create-outline" size={24} color="#fff" />
      </Pressable>

      {/* Student picker modal */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Start a Chat</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              placeholder="Search students…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {filteredStudents.length === 0 ? (
                <Text style={[styles.pickerEmpty, { color: colors.textMuted }]}>No students found.</Text>
              ) : (
                filteredStudents.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => startChat(s.id)}
                    disabled={starting}
                    style={({ pressed }) => [styles.pickerRow, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={[styles.avatar, { backgroundColor: '#db277718', width: 36, height: 36 }]}>
                      <Text style={[styles.avatarText, { color: '#db2777', fontSize: 13 }]}>{initials(s.name)}</Text>
                    </View>
                    <Text style={[styles.pickerName, { color: colors.text }]}>{s.name}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable
              onPress={() => { setPickerOpen(false); setSearch(''); }}
              style={[styles.modalClose, { backgroundColor: colors.surfaceAlt }]}
            >
              <Text style={[styles.modalCloseText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    scroll: { padding: 12, paddingBottom: 96 },
    empty: { alignItems: 'center', paddingVertical: 64, gap: 14 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 15, fontWeight: '700' },
    rowMain: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: '700' },
    rowSub: { fontSize: 12, marginTop: 2 },
    rowRight: { alignItems: 'flex-end', gap: 6 },
    rowTime: { fontSize: 11 },
    unreadBadge: {
      minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#db2777',
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
    },
    unreadText: { fontSize: 11, fontWeight: '700', color: '#fff' },

    fab: {
      position: 'absolute', right: 20, bottom: 28,
      width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5,
    },
    broadcastFab: {
      position: 'absolute', right: 20, bottom: 96,
      width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
    },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '80%' },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#9ca3af', alignSelf: 'center', marginBottom: 16, opacity: 0.4 },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
    searchInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
    pickerList: { maxHeight: 360 },
    pickerEmpty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
    pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    pickerName: { fontSize: 15, fontWeight: '600' },
    modalClose: { marginTop: 12, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
    modalCloseText: { fontSize: 14, fontWeight: '700' },
  });
}
