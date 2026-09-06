// Send Message — a simple 3-step flow for non-technical teachers:
//   1. Who?    pick a class (texts that class's parents)
//   2. What?   pick a ready message (shown as the FINAL words, no {variables})
//   3. Send    confirm the count, then send (chunked: the API caps at 20/call)
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore, type ThemeColors } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassesList } from '../../../lib/classes/hooks';
import { useStudentsList } from '../../../lib/students/hooks';
import { sendSms, type SmsRecipient } from '../../../lib/messages/sms';
import { DEFAULT_BODIES, renderTemplate, type TemplateType } from '../../../lib/messages/templates';
import { useScreenTitle } from '../../../lib/ui/header';
import { effectiveFeeCents } from '../../../lib/payments/fee';
import type { Class } from '../../../db/schema/classes';
import type { Student } from '../../../db/schema/students';

const SEND_CHUNK = 20; // send_sms edge function caps recipients per call

type Step = 'who' | 'what' | 'review' | 'done';

// The plain-language choices a teacher sees. Each maps to a template type.
const MESSAGE_CHOICES: {
  key: TemplateType;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  freeText?: boolean;
}[] = [
  { key: 'payment_reminder', label: 'Fee reminder', hint: 'Reminds parents the monthly fee is due.', icon: 'card-outline' },
  { key: 'class_cancel', label: 'Class cancelled / Holiday', hint: 'Tells parents there is no class.', icon: 'calendar-outline' },
  { key: 'custom', label: 'Write my own', hint: 'Type any message, in any language.', icon: 'create-outline', freeText: true },
];

function currentMonthLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function monthEndLabel(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function phoneOf(s: Student): string {
  return (s.parentMobile?.trim() || s.studentPhone?.trim() || '');
}

export default function SendMessageScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const teacher = useAuthStore((s) => s.teacher);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const teacherId = teacher?.id ?? '';
  const teacherName = teacher?.username ?? 'Your teacher';

  const { classes } = useClassesList();
  const activeClasses = useMemo(() => classes.filter((c) => c.isActive), [classes]);

  const [step, setStep] = useState<Step>('who');
  useScreenTitle(
    step === 'done' ? 'Message sent'
      : step === 'who' ? 'Who to message?'
      : step === 'what' ? 'What to send?'
      : 'Check & send',
  );
  const [classId, setClassId] = useState('');
  const [choice, setChoice] = useState<TemplateType | null>(null);
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState('');

  const selectedClass: Class | undefined = activeClasses.find((c) => c.id === classId);
  // Only confirmed, active students with a phone can be texted.
  const { students } = useStudentsList(
    useMemo(() => ({ teacherId, classId: classId || undefined, status: 'active' as const }), [teacherId, classId]),
  );
  const recipients = useMemo(() => students.filter((s) => phoneOf(s)), [students]);

  // Render the chosen message for ONE student, filling the names/amounts so the
  // teacher only ever sees real words.
  function bodyFor(s: Student): string {
    if (choice === 'custom') return customText.trim();
    const cls = selectedClass;
    const feeCents = cls ? effectiveFeeCents(s, cls.monthlyFeeCents) : 0;
    const vars: Record<string, string> = {
      student_name: s.name,
      parent_name: s.parentName?.trim() || 'Parent',
      class_name: cls ? `${cls.subject} ${cls.grade} ${cls.batch}`.trim() : '',
      grade: cls?.grade ?? '',
      batch: cls?.batch ?? '',
      subject: cls?.subject ?? '',
      language: cls?.language ?? '',
      teacher_name: teacherName,
      month: currentMonthLabel(),
      amount: `Rs ${Math.round(feeCents / 100).toLocaleString()}`,
      due_date: monthEndLabel(),
    };
    return renderTemplate(DEFAULT_BODIES[choice ?? 'custom'], vars);
  }

  // Preview = the real text the FIRST parent will receive.
  const preview = recipients.length > 0 && choice ? bodyFor(recipients[0]) : '';

  async function handleSend() {
    if (!choice || sending) return;
    if (choice === 'custom' && !customText.trim()) { setError('Please type your message first.'); return; }
    if (recipients.length === 0) { setError('No students with a phone number in this class.'); return; }
    setError('');
    setSending(true);
    try {
      const all: SmsRecipient[] = recipients.map((s) => ({
        recipient_phone: phoneOf(s),
        body: bodyFor(s),
        student_id: s.id,
        class_id: classId,
      }));
      let sent = 0, failed = 0;
      for (let i = 0; i < all.length; i += SEND_CHUNK) {
        const r = await sendSms(choice, all.slice(i, i + SEND_CHUNK), token);
        sent += r.sent ?? 0;
        failed += r.failed ?? 0;
      }
      setResult({ sent, failed });
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => router.back()} colors={colors} />
        <View style={styles.doneWrap}>
          <View style={[styles.doneCircle, { backgroundColor: '#05966918' }]}>
            <Ionicons name="checkmark-circle" size={64} color="#059669" />
          </View>
          <Text style={[styles.doneBig, { color: colors.text }]}>
            Sent to {result.sent} {result.sent === 1 ? 'parent' : 'parents'}
          </Text>
          {result.failed > 0 ? (
            <Text style={[styles.doneSub, { color: colors.danger }]}>
              {result.failed} could not be sent — check Messages → Not sent to retry.
            </Text>
          ) : (
            <Text style={[styles.doneSub, { color: colors.textMuted }]}>Everyone was messaged.</Text>
          )}
          <Pressable onPress={() => router.back()} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        onBack={() => {
          if (step === 'what') setStep('who');
          else if (step === 'review') setStep('what');
          else router.back();
        }}
        colors={colors}
      />

      {/* Step dots */}
      <View style={styles.dots}>
        {(['who', 'what', 'review'] as Step[]).map((s, i) => {
          const idx = ['who', 'what', 'review'].indexOf(step);
          const done = i <= idx;
          return <View key={s} style={[styles.dot, { backgroundColor: done ? colors.primary : colors.border }]} />;
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* ── Step 1: WHO ──────────────────────────────────────────────── */}
        {step === 'who' && (
          <>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              Pick a class. The message goes to every parent in it.
            </Text>
            {activeClasses.length === 0 ? (
              <Text style={[styles.help, { color: colors.textMuted }]}>No active classes yet.</Text>
            ) : (
              activeClasses.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => { setClassId(c.id); setError(''); setStep('what'); }}
                  style={({ pressed }) => [styles.rowCard, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: '#4f46e518' }]}>
                    <Ionicons name="school-outline" size={20} color="#4f46e5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                      {c.subject}{c.location ? ` - ${c.location}` : ''}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
                      Grade {c.grade} · {c.batch}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── Step 2: WHAT ─────────────────────────────────────────────── */}
        {step === 'what' && (
          <>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              {selectedClass ? `${selectedClass.subject} · Grade ${selectedClass.grade} ${selectedClass.batch}` : ''}
              {'  ·  '}{recipients.length} {recipients.length === 1 ? 'parent' : 'parents'}
            </Text>
            {MESSAGE_CHOICES.map((m) => {
              const active = choice === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => { setChoice(m.key); setError(''); }}
                  style={({ pressed }) => [
                    styles.rowCard,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '0d' : colors.surface },
                    pressed && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: active ? colors.primary + '22' : colors.surfaceAlt }]}>
                    <Ionicons name={m.icon} size={20} color={active ? colors.primary : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{m.label}</Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>{m.hint}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}

            {choice === 'custom' && (
              <TextInput
                value={customText}
                onChangeText={setCustomText}
                placeholder="Type your message here…"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            )}

            {/* Live preview of the actual words a parent receives */}
            {choice && preview ? (
              <View style={[styles.previewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Parents will see:</Text>
                <Text style={[styles.previewText, { color: colors.text }]}>{preview}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={!choice || (choice === 'custom' && !customText.trim())}
              onPress={() => setStep('review')}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !choice || (choice === 'custom' && !customText.trim()) ? 0.5 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primaryText} />
            </Pressable>
          </>
        )}

        {/* ── Step 3: REVIEW ───────────────────────────────────────────── */}
        {step === 'review' && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SummaryRow icon="school-outline" label="Class" value={selectedClass ? `${selectedClass.subject} · ${selectedClass.batch}` : ''} colors={colors} />
              <SummaryRow icon="people-outline" label="Parents" value={`${recipients.length}`} colors={colors} />
              <SummaryRow icon="chatbubble-ellipses-outline" label="SMS" value={`${recipients.length}`} colors={colors} last />
            </View>

            {preview ? (
              <View style={[styles.previewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Message:</Text>
                <Text style={[styles.previewText, { color: colors.text }]}>{preview}</Text>
              </View>
            ) : null}

            <Text style={[styles.help, { color: colors.textMuted }]}>
              This will text {recipients.length} {recipients.length === 1 ? 'parent' : 'parents'}.
            </Text>

            <Pressable
              disabled={sending}
              onPress={handleSend}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]}
            >
              {sending ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <>
                  <Ionicons name="send" size={17} color={colors.primaryText} />
                  <Text style={styles.primaryBtnText}>Send to {recipients.length}</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, colors }: { onBack: () => void; colors: ThemeColors }) {
  return (
    <View style={hs.actions}>
      <Pressable onPress={onBack} hitSlop={8} style={hs.backLink}>
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
        <Text style={[hs.backText, { color: colors.primary }]}>Back</Text>
      </Pressable>
    </View>
  );
}

function SummaryRow({ icon, label, value, colors, last }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: ThemeColors; last?: boolean;
}) {
  return (
    <View style={[srs.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={[srs.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[srs.value, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const hs = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
  backLink: { flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 4 },
  backText: { fontSize: 15, fontWeight: '600' },
});

const srs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  label: { flex: 1, fontSize: 14 },
  value: { fontSize: 15, fontWeight: '700', maxWidth: '55%' },
});

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    dot: { width: 28, height: 5, borderRadius: 3 },
    scroll: { padding: 16, paddingBottom: 48 },
    help: { fontSize: 13.5, lineHeight: 19, marginBottom: 12 },

    errorBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.surface, padding: 12, borderRadius: 10,
      borderLeftWidth: 3, borderLeftColor: colors.danger, marginBottom: 12,
    },
    errorText: { fontSize: 13, flex: 1 },

    rowCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10,
    },
    rowIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    rowSub: { fontSize: 12.5, lineHeight: 17 },

    input: {
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14,
      minHeight: 110, fontSize: 15, textAlignVertical: 'top', marginBottom: 12,
    },

    previewBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, marginBottom: 16, gap: 6 },
    previewLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
    previewText: { fontSize: 14, lineHeight: 20 },

    summaryCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, marginBottom: 16 },

    primaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 14, paddingVertical: 15, marginTop: 8, minHeight: 52,
    },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    doneCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    doneBig: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
    doneSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  });
}
