// Create a one-off extra class. On save it is announced to students by SMS +
// class chat (handled in lib/extraClass/notify).
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore, type ThemeColors } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { saveExtraClass } from '../../../lib/extraClass/hooks';
import { notifyExtraClass } from '../../../lib/extraClass/notify';
import { newId } from '../../../lib/uuid';
import { useScreenTitle } from '../../../lib/ui/header';
import type { NewExtraClass } from '../../../db/schema';

type FeeMode = 'free' | 'monthly' | 'custom';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewExtraClassScreen() {
  useScreenTitle('New Extra Class');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';
  const classOptions = useClassOptions(teacherId);

  const [classId, setClassId] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [feeMode, setFeeMode] = useState<FeeMode>('free');
  const [customAmount, setCustomAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pickClass(id: string) {
    setClassId(id);
    setError('');
    const cls = classOptions.find((c) => c.id === id);
    if (cls && !location.trim()) setLocation(cls.location ?? '');
  }

  async function handleSave() {
    if (!classId) { setError('Pick a class.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Date must be YYYY-MM-DD.'); return; }
    if (startTime && endTime && startTime >= endTime) { setError('Start time must be before end time.'); return; }
    if (feeMode === 'custom') {
      const n = Number(customAmount);
      if (!customAmount.trim() || isNaN(n) || n <= 0) { setError('Enter a valid amount for the extra class.'); return; }
    }
    setError('');
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const id = newId();
      const payload: NewExtraClass = {
        id,
        teacherId,
        classId,
        topic: topic.trim() || null,
        date,
        startTime: startTime.trim() || null,
        endTime: endTime.trim() || null,
        location: location.trim() || null,
        feeMode,
        customFeeCents: feeMode === 'custom' ? Math.round(Number(customAmount) * 100) : null,
        remark: remark.trim() || null,
        isActive: true,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        clientUpdatedAt: now,
        syncedAt: null,
      };
      saveExtraClass(payload);
      // Announce to students (SMS + class chat). Best-effort — never blocks save.
      const cls = classOptions.find((c) => c.id === classId);
      void notifyExtraClass({
        token: session?.access_token ?? '',
        teacherId,
        teacherName: teacher?.username ?? 'Your teacher',
        classId,
        className: cls?.label ?? 'your class',
        extra: payload,
      }).catch(() => {});
      router.replace({ pathname: '/(app)/extra-class/[id]', params: { id } });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Could not create the extra class.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={88}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>CLASS</Text>
          <ClassPicker classes={classOptions} value={classId || undefined} onChange={(id) => pickClass(id ?? '')} colors={colors} allowAll={false} placeholder="Select a class" title="Select a class" />

          <Text style={[styles.label, { marginTop: 18 }]}>TOPIC (OPTIONAL)</Text>
          <Input value={topic} onChangeText={setTopic} placeholder="e.g. Revision — Unit 3" colors={colors} />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { marginTop: 18 }]}>DATE</Text>
              <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" colors={colors} />
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { marginTop: 18 }]}>LOCATION</Text>
              <Input value={location} onChangeText={setLocation} placeholder="e.g. Main Hall" colors={colors} />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { marginTop: 18 }]}>START (HH:MM)</Text>
              <Input value={startTime} onChangeText={setStartTime} placeholder="14:00" keyboardType="numbers-and-punctuation" colors={colors} />
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { marginTop: 18 }]}>END (HH:MM)</Text>
              <Input value={endTime} onChangeText={setEndTime} placeholder="16:00" keyboardType="numbers-and-punctuation" colors={colors} />
            </View>
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>FEE FOR THIS EXTRA CLASS</Text>
          <View style={styles.chipWrap}>
            {([['free', 'Free'], ['monthly', 'Monthly amount'], ['custom', 'Special amount']] as [FeeMode, string][]).map(([m, lbl]) => (
              <Pressable key={m} onPress={() => setFeeMode(m)} style={[styles.chip, { backgroundColor: feeMode === m ? colors.primary : colors.surfaceAlt, borderColor: feeMode === m ? colors.primary : colors.border }]}>
                <Text style={[styles.chipText, { color: feeMode === m ? '#fff' : colors.text }]}>{lbl}</Text>
              </Pressable>
            ))}
          </View>
          {feeMode === 'custom' ? (
            <Input value={customAmount} onChangeText={(v) => setCustomAmount(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="Amount (Rs)" colors={colors} style={{ marginTop: 8 }} />
          ) : null}
          <Text style={styles.hint}>
            {feeMode === 'free' ? 'No charge. Just attendance.'
              : feeMode === 'monthly' ? 'Each student who attends pays their normal monthly fee. Free-card students stay free.'
              : 'Each student who attends pays this amount. Free-card students stay free.'}
          </Text>

          <Text style={[styles.label, { marginTop: 18 }]}>REMARK (OPTIONAL)</Text>
          <Input value={remark} onChangeText={setRemark} placeholder="Any note…" multiline colors={colors} style={{ minHeight: 70, textAlignVertical: 'top' }} />

          <View style={styles.notifyNote}>
            <Ionicons name="megaphone-outline" size={15} color={colors.primary} />
            <Text style={[styles.notifyText, { color: colors.textMuted }]}>Students will be notified by SMS and class chat.</Text>
          </View>

          <Pressable disabled={busy} onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.primaryText} /> : (
              <><Ionicons name="add-circle-outline" size={18} color={colors.primaryText} /><Text style={styles.saveText}>Create extra class</Text></>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Input(props: React.ComponentProps<typeof TextInput> & { colors: ThemeColors }) {
  const { colors, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...rest}
      style={[{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 }, style]}
    />
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    scroll: { padding: 16, paddingBottom: 60 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, color: colors.textMuted },
    hint: { fontSize: 12.5, lineHeight: 17, color: colors.textMuted, marginTop: 8 },
    row: { flexDirection: 'row', gap: 12 },
    rowItem: { flex: 1 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: colors.danger, marginBottom: 12 },
    errorText: { fontSize: 13, flex: 1 },
    notifyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, padding: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    notifyText: { fontSize: 12.5, flex: 1 },
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 24, minHeight: 52 },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
