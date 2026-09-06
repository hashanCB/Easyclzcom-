import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { cloudRestore, localIsEmpty, markPulledFromCloud, type RestoreProgress } from '../../lib/restore';
import { pushAll } from '../../lib/sync/push';
import { logAudit } from '../../lib/api/audit';
import { useIsPro } from '../../lib/subscription/store';
import { ProBlockScreen } from '../../components/ProBlockScreen';
import { useScreenTitle } from '../../lib/ui/header';

type Step = 'choose' | 'restoring' | 'done';

const EMPTY_PROGRESS: RestoreProgress = {
  step: 'Starting…',
  classes: 0, students: 0, payments: 0, corrections: 0, attendance: 0,
  exams: 0, marks: 0, notes: 0, noteFiles: 0,
};

export default function RestoreScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const session = useAuthStore((s) => s.session);
  const teacher = useAuthStore((s) => s.teacher);
  const pro = useIsPro();

  const [step, setStep] = useState<Step>('choose');
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  useScreenTitle('Restore from Cloud');

  // Cloud restore needs the cloud — Pro only.
  if (!pro) {
    return <ProBlockScreen feature="Cloud Restore" description="Cloud Restore brings your data back from the cloud onto this phone." />;
  }

  async function handleCloudRestore() {
    if (!session?.access_token || !teacher) return;
    setStep('restoring');
    try {
      // Safety for the "added data on a new phone, then pulled old data" case:
      // push any local changes up FIRST so nothing the teacher created on this
      // device can be lost. The pull itself is a non-destructive merge by id,
      // but pushing first guarantees the union is complete. On a brand-new
      // device (empty DB) this is skipped — there is nothing to push.
      if (!localIsEmpty(teacher.id)) {
        setProgress((p) => ({ ...(p ?? EMPTY_PROGRESS), step: 'Saving your changes…' }));
        await pushAll(teacher.id, session.access_token);
      }

      const result = await cloudRestore(teacher.id, session.access_token, (p) => {
        setProgress({ ...p });
      });
      setProgress(result);
      // Remember that this device has pulled, so the manual button hides.
      await markPulledFromCloud(teacher.id);
      setStep('done');
      // SRS §24.4: audit the restore (best-effort, never blocks the flow).
      void logAudit(
        { action: 'backup.restore', entityType: 'backup', newValue: result },
        session.access_token,
      );
    } catch (e: unknown) {
      Alert.alert('Restore failed', (e as Error).message);
      setStep('choose');
    }
  }

  function goHome() {
    router.replace('/(app)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerBlock}>
          <View style={[styles.iconCircle, { backgroundColor: '#2563eb18' }]}>
            <Ionicons name="cloud-download-outline" size={32} color="#2563eb" />
          </View>
          <Text style={[styles.heading, { color: colors.text }]}>Welcome back</Text>
          <Text style={[styles.subheading, { color: colors.textMuted }]}>
            We found this account on a new device. Choose how you want to set up your data.
          </Text>
        </View>

        {step === 'choose' && (
          <View style={styles.options}>
            <OptionCard
              icon="cloud-download-outline"
              accent="#2563eb"
              title="Restore from cloud"
              description="Pull all your classes, students, payments, and attendance from your cloud account."
              colors={colors}
              onPress={handleCloudRestore}
            />
            <OptionCard
              icon="document-attach-outline"
              accent="#7c3aed"
              title="Upload backup file"
              description="Restore from an encrypted backup file you saved earlier."
              colors={colors}
              onPress={() => router.replace('/(app)/backup')}
            />
            <OptionCard
              icon="add-circle-outline"
              accent="#059669"
              title="Start as new"
              description="Skip restore and begin with an empty app. Your cloud data stays safe."
              colors={colors}
              onPress={() =>
                Alert.alert(
                  'Start fresh?',
                  'Your cloud data will not be downloaded now. You can sync it later from the home screen.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Start as new', onPress: goHome },
                  ],
                )
              }
            />
          </View>
        )}

        {step === 'restoring' && (
          <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusStep, { color: colors.text }]}>
              {progress?.step ?? 'Restoring…'}
            </Text>
            <Text style={[styles.statusHint, { color: colors.textMuted }]}>
              Please keep the app open until restore completes.
            </Text>
          </View>
        )}

        {step === 'done' && progress && (
          <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.iconCircle, { backgroundColor: '#05966918' }]}>
              <Ionicons name="checkmark-circle-outline" size={32} color="#059669" />
            </View>
            <Text style={[styles.statusStep, { color: colors.text }]}>Restore complete</Text>
            <View style={styles.summary}>
              <SummaryRow icon="school-outline" label="Classes" value={progress.classes} colors={colors} />
              <SummaryRow icon="people-outline" label="Students" value={progress.students} colors={colors} />
              <SummaryRow icon="card-outline" label="Payments" value={progress.payments} colors={colors} />
              <SummaryRow icon="swap-horizontal-outline" label="Corrections" value={progress.corrections} colors={colors} />
              <SummaryRow icon="checkbox-outline" label="Attendance" value={progress.attendance} colors={colors} />
              <SummaryRow icon="document-text-outline" label="Exams" value={progress.exams} colors={colors} />
              <SummaryRow icon="create-outline" label="Marks" value={progress.marks} colors={colors} />
              <SummaryRow icon="book-outline" label="Notes" value={progress.notes} colors={colors} />
              <SummaryRow icon="attach-outline" label="Note files" value={progress.noteFiles} colors={colors} />
            </View>
            <Pressable style={styles.primaryBtn} onPress={goHome}>
              <Text style={styles.primaryBtnText}>Continue to app</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

function OptionCard({
  icon, accent, title, description, colors, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  description: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.optionDesc, { color: colors.textMuted }]}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function SummaryRow({
  icon, label, value, colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 32, paddingBottom: 48 },
  headerBlock: { alignItems: 'center', marginBottom: 28 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subheading: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  options: { gap: 12 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  optionIcon: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  optionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  optionDesc: { fontSize: 12.5, lineHeight: 17 },
  statusCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  statusStep: { fontSize: 17, fontWeight: '700', marginTop: 14 },
  statusHint: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  summary: { alignSelf: 'stretch', marginTop: 18, marginBottom: 8, gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryLabel: { flex: 1, fontSize: 14 },
  summaryValue: { fontSize: 15, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
