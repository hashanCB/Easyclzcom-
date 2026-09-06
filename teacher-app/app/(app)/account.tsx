import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { useScreenTitle } from '../../lib/ui/header';
import { isBackupOverdue, formatLastBackup, getLastBackupAt } from '../../lib/backup/reminder';
import {
  getLastCloudBackupAt,
  formatCloudBackup,
  isCloudBackupOverdue,
} from '../../lib/backup/cloud';
import { hasPulledFromCloud, cloudHasData } from '../../lib/restore';
import { useIsPro } from '../../lib/subscription/store';
import { fetchSmsCostSummary } from '../../lib/messages/sms';

const FREE_SMS_QUOTA = 10;

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AccountScreen() {
  useScreenTitle('Account');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const isPro = useIsPro();
  const [smsUsed, setSmsUsed] = useState(0);
  const [backupOverdue, setBackupOverdue] = useState(false);
  const [lastBackupLabel, setLastBackupLabel] = useState('');
  const [cloudBackupLabel, setCloudBackupLabel] = useState('');
  const [cloudBackupOverdue, setCloudBackupOverdue] = useState(false);
  const [showPull, setShowPull] = useState(false);

  useEffect(() => {
    void (async () => {
      const [overdue, raw] = await Promise.all([isBackupOverdue(), getLastBackupAt()]);
      setBackupOverdue(overdue);
      setLastBackupLabel(formatLastBackup(raw));
    })();
  }, []);

  // Cloud backup indicator — reads the persisted last-successful-push time.
  useEffect(() => {
    if (Platform.OS === 'web' || !teacher) return;
    void (async () => {
      const at = await getLastCloudBackupAt(teacher.id);
      setCloudBackupLabel(formatCloudBackup(at));
      setCloudBackupOverdue(isCloudBackupOverdue(at));
    })();
  }, [teacher]);

  // Show the manual "Pull from cloud" button only when this device has not yet
  // pulled the teacher's data AND the cloud actually has something to restore.
  // Native only — the restore flow relies on local SQLite.
  useEffect(() => {
    if (Platform.OS === 'web' || !teacher || !session?.access_token) return;
    let cancelled = false;
    void (async () => {
      try {
        if (await hasPulledFromCloud(teacher.id)) return;
        const has = await cloudHasData(teacher.id, session.access_token);
        if (!cancelled) setShowPull(has);
      } catch {
        // Probe failed (offline etc.) — keep the button hidden; the teacher
        // can retry from the home-screen sync. Avoids a dead-end button.
      }
    })();
    return () => { cancelled = true; };
  }, [teacher, session?.access_token]);

  // Free plan SMS usage this month (Pro is unlimited, so only fetch for Free).
  useEffect(() => {
    if (isPro || !session?.access_token) return;
    let cancelled = false;
    void (async () => {
      try {
        const summary = await fetchSmsCostSummary(session.access_token, currentMonthKey());
        if (!cancelled) setSmsUsed(summary.sent + summary.queued);
      } catch {
        // Best-effort display only — leave at 0 on failure.
      }
    })();
    return () => { cancelled = true; };
  }, [isPro, session?.access_token]);

  const styles = buildStyles(colors);
  const smsLeft = Math.max(0, FREE_SMS_QUOTA - smsUsed);
  const smsUsedUp = smsUsed >= FREE_SMS_QUOTA;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Plan card */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACTIVE PLAN</Text>
        <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.planIconBox, { backgroundColor: '#4f46e5' + '18' }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#4f46e5" />
          </View>
          <View style={styles.planInfo}>
            <Text style={[styles.planName, { color: colors.text }]}>Free · Local</Text>
            <Text style={[styles.planDesc, { color: colors.textMuted }]}>
              All data stored on device. No cloud sync.
            </Text>
          </View>
        </View>

        {/* Free-plan SMS usage — Pro is unlimited so this is hidden for Pro. */}
        {!isPro && (
          <Pressable
            onPress={() => router.push('/(app)/subscription')}
            style={({ pressed }) => [
              styles.smsCard,
              {
                backgroundColor: colors.surface,
                borderColor: smsUsedUp ? colors.danger : colors.border,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <View
              style={[
                styles.rowIconBox,
                { backgroundColor: (smsUsedUp ? colors.danger : colors.primary) + '18' },
              ]}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={smsUsedUp ? colors.danger : colors.primary}
              />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.menuRowTitle, { color: colors.text }]}>
                {smsUsedUp
                  ? `Free SMS used up (${FREE_SMS_QUOTA}/${FREE_SMS_QUOTA} this month)`
                  : `Free SMS: ${smsUsed} / ${FREE_SMS_QUOTA} this month`}
              </Text>
              <Text style={[styles.rowSub, { color: smsUsedUp ? colors.danger : colors.textMuted }]}>
                {smsUsedUp
                  ? 'Upgrade to Pro for unlimited SMS'
                  : `${smsLeft} left · upgrade to Pro for unlimited`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {/* Data section */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>DATA</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {showPull && (
            <>
              <MenuRow
                icon="cloud-download-outline"
                title="Pull from cloud"
                subtitle="Download your classes, students & payments to this device"
                colors={colors}
                onPress={() => router.push('/(app)/restore')}
              />
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            </>
          )}
          <MenuRow
            icon="cloud-upload-outline"
            title="Backup & Restore"
            subtitle={lastBackupLabel || 'Export encrypted backup · Restore from file'}
            colors={colors}
            onPress={() => router.push('/(app)/backup')}
            warning={backupOverdue}
          />
          {Platform.OS !== 'web' && (
            <>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <MenuRow
                icon="cloud-done-outline"
                title="Automatic Cloud Backup"
                subtitle={
                  cloudBackupOverdue && cloudBackupLabel
                    ? `${cloudBackupLabel} · tap to view history`
                    : cloudBackupLabel || 'Saves automatically · tap to view history'
                }
                colors={colors}
                onPress={() => router.push('/(app)/sync-history')}
                warning={cloudBackupOverdue}
              />
            </>
          )}
        </View>

        {/* Account section */}
        {teacher && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCOUNT</Text>
            <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.infoRow}>
                <View style={[styles.rowIconBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Username</Text>
                  <Text style={[styles.rowValue, { color: colors.text }]}>{teacher.username}</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.infoRow}>
                <View style={[styles.rowIconBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="id-card-outline" size={16} color={colors.textMuted} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Teacher ID</Text>
                  <Text style={[styles.rowValue, { color: colors.text, fontFamily: 'monospace' }]} numberOfLines={1}>
                    {teacher.id}
                  </Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Pressable
                onPress={() => router.push('/(app)/change-password')}
                style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <View style={[styles.rowIconBox, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.menuRowTitle, { color: colors.text }]}>Change Password</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>Update your login password</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          </>
        )}

        {/* Support section */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>HELP</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MenuRow
            icon="headset-outline"
            title="Help & Support"
            subtitle="Contact us by WhatsApp, call or SMS"
            colors={colors}
            onPress={() => router.push('/(app)/support')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  colors,
  onPress,
  warning,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPress: () => void;
  warning?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <View style={[styles.rowIconBox, { backgroundColor: warning ? colors.danger + '18' : colors.primary + '18' }]}>
        <Ionicons name={warning ? 'warning-outline' : icon} size={16} color={warning ? colors.danger : colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.menuRowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: warning ? colors.danger : colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

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

    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
      textTransform: 'uppercase',
    },

    planCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 14,
      marginBottom: 20,
    },
    planIconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    planInfo: { flex: 1 },
    planName: { fontSize: 15, fontWeight: '700' },
    planDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },

    smsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: -8,
      marginBottom: 20,
    },

    menuCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      marginBottom: 20,
      overflow: 'hidden',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 56,
    },
    menuRowTitle: { fontSize: 15, fontWeight: '600' },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 56,
    },
    rowIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowContent: { flex: 1 },
    rowLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    rowValue: { fontSize: 14, fontWeight: '500', marginTop: 2 },
    rowSub: { fontSize: 12, marginTop: 2 },

    divider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
    menuDivider: { height: StyleSheet.hairlineWidth },
  });
}

const styles = buildStyles({
  bg: '#fff', surface: '#fff', surfaceAlt: '#f3f4f6', border: '#e5e7eb',
  text: '#111827', textMuted: '#6b7280', primary: '#2563eb', primaryText: '#fff',
  danger: '#dc2626', overlay: 'rgba(0,0,0,0.5)',
} as ReturnType<typeof useThemeStore.getState>['colors']);
