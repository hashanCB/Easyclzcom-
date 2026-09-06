// Chat thread view (U37) — message history with a 3s poll for near-realtime
// delivery, plus a composer. Teacher messages render right, student left.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../lib/constants';
import { fetchMessages, sendMessage, markThreadRead, type ChatMessage } from '../../../lib/chat';
import { useScreenTitle } from '../../../lib/ui/header';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ChatThreadScreen() {
  const { id: threadId } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? '');
  const token = useAuthStore((s) => s.session?.access_token ?? '');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [studentName, setStudentName] = useState('Student');
  useScreenTitle(studentName);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchMessages(threadId, token);
    setMessages(rows);
    setLoading(false);
  }, [threadId, token]);

  // Header info: fetch the thread's student name once.
  useEffect(() => {
    fetch(
      `${SUPABASE_URL}/rest/v1/chat_threads?id=eq.${threadId}&select=students(name)`,
      { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } },
    )
      .then((r) => r.json())
      .then((rows) => { if (Array.isArray(rows) && rows[0]?.students?.name) setStudentName(rows[0].students.name); })
      .catch(() => {});
  }, [threadId, token]);

  // Initial load + mark read + 3s poll.
  useEffect(() => {
    load();
    markThreadRead(threadId, token);
    pollRef.current = setInterval(load, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load, threadId, token]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await sendMessage(threadId, teacherId, text, token);
      await load();
    } catch {
      setDraft(text); // restore on failure
    } finally {
      setSending(false);
    }
  }

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No messages yet. Say hello to {studentName}.
                </Text>
              </View>
            ) : (
              messages.map((m) => {
                const mine = m.sender_role === 'teacher';
                return (
                  <View
                    key={m.id}
                    style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        mine
                          ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
                          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
                      ]}
                    >
                      <Text style={[styles.bubbleText, { color: mine ? '#fff' : colors.text }]}>{m.body}</Text>
                      <Text style={[styles.bubbleTime, { color: mine ? 'rgba(255,255,255,0.7)' : colors.textMuted }]}>
                        {fmtTime(m.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* Composer */}
        <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: draft.trim() ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    messages: { padding: 12, paddingBottom: 16, flexGrow: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 14 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 240, lineHeight: 20 },

    bubbleRow: { flexDirection: 'row', marginBottom: 8 },
    bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleText: { fontSize: 14, lineHeight: 19 },
    bubbleTime: { fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },

    composer: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      padding: 8, borderTopWidth: StyleSheet.hairlineWidth,
    },
    input: {
      flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14,
      paddingTop: 9, paddingBottom: 9, fontSize: 14, maxHeight: 110,
    },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  });
}
