// Group chat broadcast / announcement composer (U37, SRS §15.1, §15.3).
// Simple flow: 1) pick a class  2) choose All / Paid / Unpaid  3) type & send.
// broadcast_chat fans the message out to each matching student's private thread.
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useClassesList } from '../../../lib/classes/hooks';
import { broadcastChat } from '../../../lib/chat';
import { ClassPicker } from '../../../components/ClassPicker';
import { useScreenTitle } from '../../../lib/ui/header';

// Who in the chosen class should get the message.
type Audience = 'all' | 'unpaid' | 'paid';

const AUDIENCES: { key: Audience; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'all',    label: 'All students',    sub: 'Everyone in this class',        icon: 'people',         color: '#2563EB' },
  { key: 'unpaid', label: 'Not paid yet',    sub: 'Only those who owe this month', icon: 'alert-circle',   color: '#DC2626' },
  { key: 'paid',   label: 'Already paid',    sub: 'Only those paid this month',    icon: 'checkmark-circle', color: '#059669' },
];

export default function BroadcastScreen() {
  useScreenTitle('New Broadcast');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const { classes } = useClassesList();

  const [classId, setClassId] = useState<string | undefined>(undefined);
  const [audience, setAudience] = useState<Audience>('all');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Active classes as dropdown items, using the same picker as the rest of the app.
  const classItems = useMemo(
    () =>
      classes
        .filter((c) => c.isActive)
        .map((c) => {
          const head = `${c.subject}${c.location ? ` · ${c.location}` : ''}`;
          return { id: c.id, label: `${head} (${c.grade} ${c.batch})` };
        }),
    [classes],
  );

  async function handleSend() {
    if (!classId) return Alert.alert('Pick a class', 'Choose which class to message first.');
    if (!body.trim()) return Alert.alert('Message required', 'Type a message to send.');

    setSending(true);
    try {
      // kind='class' scoped to the chosen class; payment sub-filter for paid/unpaid.
      const payment = audience === 'all' ? undefined : audience;
      const result = await broadcastChat('class', classId, body.trim(), token, payment);
      if (result.recipients === 0) {
        Alert.alert('No students', 'No students matched. Try “All students”.');
      } else {
        Alert.alert(
          'Message sent',
          `Sent to ${result.recipients} student${result.recipients === 1 ? '' : 's'}.`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      }
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Step 1 — class */}
          <Text style={[styles.step, { color: colors.primary }]}>STEP 1</Text>
          <Text style={[styles.label, { color: colors.textMuted }]}>Pick a class</Text>
          <ClassPicker
            classes={classItems}
            value={classId}
            onChange={setClassId}
            colors={colors}
            allowAll={false}
            placeholder="Select a class"
            title="Select a class"
          />

          {/* Step 2 — audience (only after a class is chosen) */}
          {classId ? (
            <>
              <Text style={[styles.step, { color: colors.primary, marginTop: 24 }]}>STEP 2</Text>
              <Text style={[styles.label, { color: colors.textMuted }]}>Who should get it?</Text>
              <View style={{ gap: 10 }}>
                {AUDIENCES.map((a) => {
                  const active = audience === a.key;
                  return (
                    <Pressable
                      key={a.key}
                      onPress={() => setAudience(a.key)}
                      style={[
                        styles.audienceRow,
                        { borderColor: active ? a.color : colors.border, backgroundColor: active ? a.color + '12' : colors.surface },
                      ]}
                    >
                      <View style={[styles.audienceIcon, { backgroundColor: a.color + '1a' }]}>
                        <Ionicons name={a.icon} size={20} color={a.color} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={[styles.audienceLabel, { color: colors.text }]}>{a.label}</Text>
                        <Text style={[styles.audienceSub, { color: colors.textMuted }]}>{a.sub}</Text>
                      </View>
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={active ? a.color : colors.textMuted}
                      />
                    </Pressable>
                  );
                })}
              </View>

              {/* Step 3 — message */}
              <Text style={[styles.step, { color: colors.primary, marginTop: 24 }]}>STEP 3</Text>
              <Text style={[styles.label, { color: colors.textMuted }]}>Your message</Text>
              <TextInput
                style={[styles.bodyInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="Type your announcement…"
                placeholderTextColor={colors.textMuted}
                value={body}
                onChangeText={setBody}
                multiline
                textAlignVertical="top"
              />

              <View style={[styles.infoBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.infoText, { color: colors.textMuted }]}>
                  Each student receives this in their own private chat — they cannot see each other.
                </Text>
              </View>

              <Pressable
                onPress={handleSend}
                disabled={sending}
                style={({ pressed }) => [styles.sendBtn, { backgroundColor: colors.primary, opacity: pressed || sending ? 0.85 : 1 }]}
              >
                {sending
                  ? <ActivityIndicator color="#fff" />
                  : (
                    <>
                      <Ionicons name="megaphone" size={18} color="#fff" />
                      <Text style={styles.sendBtnText}>Send Broadcast</Text>
                    </>
                  )}
              </Pressable>
            </>
          ) : (
            <Text style={[styles.waitHint, { color: colors.textMuted }]}>
              Choose a class above to continue.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },

    scroll: { padding: 16, paddingBottom: 48 },
    step: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
    waitHint: { fontSize: 13, fontStyle: 'italic', marginTop: 20, textAlign: 'center' },

    audienceRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1.5, borderRadius: 14, padding: 12,
    },
    audienceIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    audienceLabel: { fontSize: 15, fontWeight: '700' },
    audienceSub: { fontSize: 12, marginTop: 1 },

    bodyInput: {
      borderWidth: 1.5, borderRadius: 12, padding: 14,
      fontSize: 14, lineHeight: 20, minHeight: 130,
    },

    infoBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, marginTop: 16,
    },
    infoText: { flex: 1, fontSize: 12, lineHeight: 17 },

    sendBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 14, height: 52, marginTop: 22,
    },
    sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
