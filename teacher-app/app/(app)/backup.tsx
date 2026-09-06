import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { useScreenTitle } from '../../lib/ui/header';
import { createBackup, decryptBackup, restoreBackup, type ExportStage } from '../../lib/backup';
import { recordBackupDone } from '../../lib/backup/reminder';
import { logAudit } from '../../lib/api/audit';

function getFs() {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  } catch { return null; }
}
function getSharing() {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-sharing') as typeof import('expo-sharing');
  } catch { return null; }
}
function getPicker() {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-document-picker') as typeof import('expo-document-picker');
  } catch { return null; }
}

type Step = 'idle' | 'exporting' | 'importing' | 'confirm-restore';

type ExportProgress = ExportStage | 'writing' | 'sharing' | 'done';

const EXPORT_STEPS: { key: ExportProgress; label: string }[] = [
  { key: 'collecting',  label: 'Collecting data' },
  { key: 'key-derive',  label: 'Deriving encryption key' },
  { key: 'encrypting',  label: 'Encrypting backup' },
  { key: 'serialising', label: 'Serialising' },
  { key: 'writing',     label: 'Writing file' },
  { key: 'sharing',     label: 'Opening share sheet' },
];

const EXPORT_STEP_PCT: Record<ExportProgress, number> = {
  collecting:  10,
  'key-derive': 35,
  encrypting:  65,
  serialising: 75,
  writing:     88,
  sharing:     96,
  done:       100,
};

export default function BackupScreen() {
  useScreenTitle('Backup & Restore');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [pendingData, setPendingData] = useState<Awaited<ReturnType<typeof decryptBackup>> | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  function advanceProgress(p: ExportProgress): void {
    setExportProgress(p);
    Animated.timing(progressAnim, {
      toValue: EXPORT_STEP_PCT[p],
      duration: 280,
      useNativeDriver: false,
    }).start();
  }

  async function handleExport() {
    if (!password.trim()) { Alert.alert('Password required', 'Enter a password to encrypt the backup.'); return; }
    const fs = getFs();
    const sharing = getSharing();
    if (!fs || !sharing) { Alert.alert('Not supported', 'Backup requires native device.'); return; }

    progressAnim.setValue(0);
    setExportProgress(null);
    setStep('exporting');
    setStatusMsg('');
    try {
      const encrypted = await createBackup(teacherId, password.trim(), advanceProgress);

      advanceProgress('writing');
      const filename = `class-backup-${new Date().toISOString().slice(0, 10)}.classbackup`;
      const path = `${fs.cacheDirectory}${filename}`;
      await fs.writeAsStringAsync(path, encrypted, { encoding: fs.EncodingType.UTF8 });

      advanceProgress('sharing');
      const canShare = await sharing.isAvailableAsync();
      if (canShare) {
        await sharing.shareAsync(path, { mimeType: 'application/octet-stream', dialogTitle: 'Save backup file' });
      } else {
        Alert.alert('Saved', `Backup saved to: ${path}`);
      }

      advanceProgress('done');
      void recordBackupDone();
      if (session?.access_token) {
        void logAudit({ action: 'backup.create', entityType: 'backup' }, session.access_token);
      }
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    } finally {
      setStep('idle');
      setExportProgress(null);
      progressAnim.setValue(0);
    }
  }

  async function handlePickAndDecrypt() {
    if (!password.trim()) { Alert.alert('Password required', 'Enter the password used when the backup was created.'); return; }
    const picker = getPicker();
    if (!picker) { Alert.alert('Not supported', 'Restore requires native device.'); return; }
    const fs = getFs();
    if (!fs) return;

    setStep('importing');
    setStatusMsg('Picking file…');
    try {
      const result = await picker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
      if (result.canceled) { setStep('idle'); setStatusMsg(''); return; }

      const uri = result.assets[0]?.uri;
      if (!uri) throw new Error('No file selected.');

      setStatusMsg('Decrypting…');
      const content = await fs.readAsStringAsync(uri, { encoding: fs.EncodingType.UTF8 });
      const data = await decryptBackup(content, password.trim());

      setPendingData(data);
      setStep('confirm-restore');
      setStatusMsg('');
    } catch (e: unknown) {
      Alert.alert('Import failed', (e as Error).message);
      setStep('idle');
      setStatusMsg('');
    }
  }

  async function handleConfirmRestore() {
    if (!pendingData) return;
    setStep('importing');
    setStatusMsg('Restoring data…');
    try {
      await restoreBackup(pendingData, teacherId);
      setStep('idle');
      setPendingData(null);
      setStatusMsg('');
      if (session?.access_token) {
        void logAudit({ action: 'backup.restore', entityType: 'backup', newValue: { source: 'file' } }, session.access_token);
      }
      Alert.alert('Restored', 'All data has been restored. The app will use restored data immediately.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Restore failed', (e as Error).message);
      setStep('idle');
      setStatusMsg('');
    }
  }

  const busy = step === 'exporting' || step === 'importing';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.infoTitleRow}>
            <View style={[styles.infoIconBox, { backgroundColor: '#4f46e5' + '18' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#4f46e5" />
            </View>
            <Text style={[styles.infoTitle, { color: colors.text }]}>AES-256-GCM Encryption</Text>
          </View>
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Your backup is encrypted with AES-256-GCM using a password you choose.
            Store the file safely — it contains all your classes, students, payments, and attendance.
            To restore, install the app, open Backup &amp; Restore, enter the same password, and pick the file.
          </Text>
        </View>

        {/* Password field */}
        <Text style={[styles.label, { color: colors.textMuted }]}>BACKUP PASSWORD</Text>
        <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter encryption password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            style={[styles.inputField, { color: colors.text }]}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Use the same password for both export and restore. If you forget it, the backup cannot be recovered.
        </Text>

        {/* Export progress card */}
        {step === 'exporting' ? (
          <ExportProgressCard
            exportProgress={exportProgress}
            progressAnim={progressAnim}
            colors={colors}
          />
        ) : statusMsg ? (
          <View style={[styles.statusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.primary }]}>{statusMsg}</Text>
          </View>
        ) : null}

        {/* Confirm restore panel */}
        {step === 'confirm-restore' && pendingData ? (
          <View style={[styles.confirmBox, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <View style={styles.confirmTitleRow}>
              <Ionicons name="checkmark-circle-outline" size={22} color="#059669" />
              <Text style={[styles.confirmTitle, { color: colors.text }]}>Backup decrypted</Text>
            </View>

            <View style={styles.confirmDetails}>
              <ConfirmDetail icon="calendar-outline" text={`Exported: ${new Date(pendingData.exportedAt).toLocaleString()}`} colors={colors} />
              <ConfirmDetail icon="school-outline" text={`${pendingData.classes.length} classes`} colors={colors} />
              <ConfirmDetail icon="people-outline" text={`${pendingData.students.length} students`} colors={colors} />
              <ConfirmDetail icon="card-outline" text={`${pendingData.payments.length} payments`} colors={colors} />
              <ConfirmDetail icon="checkbox-outline" text={`${pendingData.attendance.length} attendance records`} colors={colors} />
            </View>

            <View style={[styles.warningBox, { backgroundColor: colors.danger + '12', borderColor: colors.danger }]}>
              <Ionicons name="warning-outline" size={16} color={colors.danger} />
              <Text style={[styles.warningText, { color: colors.danger }]}>
                This will replace all current data. This cannot be undone.
              </Text>
            </View>

            <View style={styles.confirmBtns}>
              <Pressable
                onPress={() => { setStep('idle'); setPendingData(null); }}
                style={({ pressed }) => [styles.btn, styles.btnGhost, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmRestore}
                style={({ pressed }) => [styles.btn, { backgroundColor: colors.danger }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="refresh-outline" size={16} color="#fff" />
                <Text style={[styles.btnText, { color: '#fff' }]}>Restore now</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Action buttons */}
        {step !== 'confirm-restore' && step !== 'exporting' && (
          <View style={styles.actionBtns}>
            <Pressable
              onPress={handleExport}
              disabled={busy}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: colors.primary },
                (pressed || busy) && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="cloud-upload-outline" size={18} color={colors.primaryText} />
              <Text style={[styles.btnText, { color: colors.primaryText }]}>Export backup</Text>
            </Pressable>

            <Pressable
              onPress={handlePickAndDecrypt}
              disabled={busy}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                { borderColor: colors.border },
                (pressed || busy) && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name={step === 'importing' ? 'hourglass-outline' : 'cloud-download-outline'} size={18} color={colors.text} />
              <Text style={[styles.btnText, { color: colors.text }]}>
                {step === 'importing' ? 'Importing…' : 'Restore from backup'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ExportProgressCard({
  exportProgress,
  progressAnim,
  colors,
}: {
  exportProgress: ExportProgress | null;
  progressAnim: Animated.Value;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  const activeIdx = exportProgress
    ? EXPORT_STEPS.findIndex((s) => s.key === exportProgress)
    : -1;

  const isDone = exportProgress === 'done';

  return (
    <View style={[progressStyles.card, { backgroundColor: colors.surface, borderColor: isDone ? '#059669' : colors.primary }]}>
      <View style={progressStyles.cardHeader}>
        {isDone ? (
          <Ionicons name="checkmark-circle" size={20} color="#059669" />
        ) : (
          <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
        )}
        <Text style={[progressStyles.cardTitle, { color: colors.text }]}>
          {isDone ? 'Backup exported!' : 'Exporting backup…'}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[progressStyles.barTrack, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            progressStyles.barFill,
            {
              backgroundColor: isDone ? '#059669' : colors.primary,
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* Steps list */}
      <View style={progressStyles.steps}>
        {EXPORT_STEPS.map((s, i) => {
          const done = activeIdx > i || isDone;
          const active = activeIdx === i && !isDone;
          return (
            <View key={s.key} style={progressStyles.stepRow}>
              <View style={[progressStyles.stepIcon, done && { backgroundColor: '#d1fae5' }, active && { backgroundColor: colors.primary + '18' }]}>
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#059669" />
                ) : active ? (
                  <Ionicons name="sync-outline" size={12} color={colors.primary} />
                ) : (
                  <View style={[progressStyles.stepDot, { backgroundColor: colors.border }]} />
                )}
              </View>
              <Text style={[
                progressStyles.stepLabel,
                { color: done ? colors.text : active ? colors.primary : colors.textMuted },
                active && { fontWeight: '600' },
              ]}>
                {s.label}
              </Text>
              {active && (
                <Text style={[progressStyles.stepWorking, { color: colors.textMuted }]}>working…</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  steps: { gap: 10 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDot: { width: 6, height: 6, borderRadius: 3 },
  stepLabel: { flex: 1, fontSize: 13 },
  stepWorking: { fontSize: 11, fontStyle: 'italic' },
});

function ConfirmDetail({
  icon,
  text,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={{ fontSize: 13, color: colors.textMuted }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerRight: { width: 44 },

  scroll: { padding: 16, paddingBottom: 64 },

  infoCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  infoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { fontSize: 14, fontWeight: '700' },
  infoText: { fontSize: 13, lineHeight: 19 },

  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 8,
  },
  inputField: { flex: 1, fontSize: 15 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 16 },

  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  statusText: { fontSize: 13, fontWeight: '600' },

  confirmBox: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  confirmTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  confirmTitle: { fontSize: 15, fontWeight: '700' },
  confirmDetails: { marginBottom: 12 },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
  },
  warningText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  confirmBtns: { flexDirection: 'row', gap: 10 },

  actionBtns: { gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 52,
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
  btnText: { fontWeight: '700', fontSize: 15 },
});
