// Messages — simple version for non-technical teachers.
//   • A big "Send Message" button (opens the 3-step send flow).
//   • Two plain views: "Sent" and "Not sent" (failed, with a Retry button).
//   • One small free-SMS line. No 6 tabs, no filter pop-up, no per-row cost.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore, type ThemeColors } from '../../../lib/theme/store';
import { useIsPro } from '../../../lib/subscription/store';
import { fetchSmsCostSummary } from '../../../lib/messages/sms';
import { fetchMessages, resendMessage, type MessageRow } from '../../../lib/messages/center';
import { useScreenTitle } from '../../../lib/ui/header';

const FREE_SMS_QUOTA = 10;

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

type View2 = 'sent' | 'failed';

export default function MessagesScreen() {
  useScreenTitle('Messages');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? '');
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const isPro = useIsPro();

  const [view, setView] = useState<View2>('sent');
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [usedThisMonth, setUsedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchMessages(teacherId, token, view, {});
      setMessages(rows);
      // Keep the "Not sent" badge fresh regardless of which view is open.
      const failed = view === 'failed' ? rows : await fetchMessages(teacherId, token, 'failed', {});
      setFailedCount(failed.length);
      if (!isPro && token) {
        const summary = await fetchSmsCostSummary(token, currentMonthKey());
        setUsedThisMonth(summary.sent + summary.queued);
      }
    } catch {
      Alert.alert('Error', 'Could not load messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teacherId, token, view, isPro]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  async function handleResend(msg: MessageRow) {
    setResendingId(msg.id);
    try {
      await resendMessage(msg, token);
      Alert.alert('Sent again', 'The message has been sent again.');
      load();
    } catch (e) {
      Alert.alert('Still not sent', e instanceof Error ? e.message : 'Could not send. Try again later.');
    } finally {
      setResendingId(null);
    }
  }

  const remaining = Math.max(0, FREE_SMS_QUOTA - usedThisMonth);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Actions */}
      <View style={styles.actions}>
        <Pressable onPress={() => router.push('/(app)/messages/templates')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="bookmark-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Big send button */}
      <Pressable
        onPress={() => router.push('/(app)/messages/send')}
        style={({ pressed }) => [styles.sendBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.9 }]}
      >
        <Ionicons name="send" size={18} color={colors.primaryText} />
        <Text style={styles.sendBtnText}>Send Message</Text>
      </Pressable>

      {/* Free SMS line */}
      {!isPro && (
        <Pressable onPress={() => router.push('/(app)/subscription')} style={styles.quotaLine}>
          <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.quotaText, { color: colors.textMuted }]}>
            Free SMS left this month: {remaining} of {FREE_SMS_QUOTA}
          </Text>
          <Text style={[styles.quotaUpgrade, { color: colors.primary }]}>Upgrade</Text>
        </Pressable>
      )}

      {/* Two simple views */}
      <View style={styles.segmentRow}>
        <Segment label="Sent" active={view === 'sent'} onPress={() => { setView('sent'); setLoading(true); }} colors={colors} />
        <Segment
          label={failedCount > 0 ? `Not sent (${failedCount})` : 'Not sent'}
          active={view === 'failed'}
          danger={failedCount > 0}
          onPress={() => { setView('failed'); setLoading(true); }}
          colors={colors}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name={view === 'failed' ? 'checkmark-circle-outline' : 'chatbubbles-outline'} size={42} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {view === 'failed' ? 'Nothing failed — all your messages went through.' : 'No messages yet. Tap "Send Message" to text parents.'}
              </Text>
            </View>
          ) : (
            messages.map((m) => {
              const failed = m.status === 'failed';
              return (
                <View key={m.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.recipient, { color: colors.text }]} numberOfLines={1}>
                      {m.students?.name ?? m.recipient_phone}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: failed ? '#fee2e2' : '#d1fae5' }]}>
                      <Ionicons name={failed ? 'close' : 'checkmark'} size={11} color={failed ? '#dc2626' : '#059669'} />
                      <Text style={[styles.badgeText, { color: failed ? '#dc2626' : '#059669' }]}>
                        {failed ? 'Not sent' : 'Sent'}
                      </Text>
                    </View>
                  </View>
                  {m.students?.name ? (
                    <Text style={[styles.phone, { color: colors.textMuted }]}>{m.recipient_phone}</Text>
                  ) : null}
                  <Text style={[styles.body, { color: colors.text }]} numberOfLines={3}>{m.body}</Text>
                  <Text style={[styles.time, { color: colors.textMuted }]}>
                    {fmtTime(m.sent_at ?? m.created_at)}
                  </Text>

                  {failed && (
                    <Pressable
                      onPress={() => handleResend(m)}
                      disabled={resendingId === m.id}
                      style={({ pressed }) => [styles.retryBtn, { borderColor: colors.primary }, pressed && { opacity: 0.7 }]}
                    >
                      {resendingId === m.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={15} color={colors.primary} />
                          <Text style={[styles.retryText, { color: colors.primary }]}>Send again</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Segment({ label, active, danger, onPress, colors }: {
  label: string; active: boolean; danger?: boolean; onPress: () => void; colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        segStyles.seg,
        { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : 'transparent' },
      ]}
    >
      <Text style={[segStyles.segText, { color: active ? colors.primaryText : (danger ? '#dc2626' : colors.text) }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const segStyles = StyleSheet.create({
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  segText: { fontSize: 14, fontWeight: '700' },
});

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    sendBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 14, borderRadius: 14, paddingVertical: 15, minHeight: 52,
    },
    sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    quotaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10 },
    quotaText: { flex: 1, fontSize: 12.5 },
    quotaUpgrade: { fontSize: 12.5, fontWeight: '700' },

    segmentRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },

    scroll: { padding: 12, paddingBottom: 48 },
    empty: { alignItems: 'center', paddingVertical: 56, gap: 14, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 20 },

    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recipient: { flex: 1, fontSize: 14, fontWeight: '700' },
    phone: { fontSize: 12, marginTop: 1 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 14 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    body: { fontSize: 13, lineHeight: 18, marginTop: 6 },
    time: { fontSize: 11, fontWeight: '500', marginTop: 8 },

    retryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderWidth: 1.5, borderRadius: 8, paddingVertical: 9, marginTop: 10,
    },
    retryText: { fontSize: 13, fontWeight: '700' },
  });
}
