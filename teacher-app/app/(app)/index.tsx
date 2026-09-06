import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { useSyncEngine, timeSinceSync } from '../../lib/sync/engine';
import { useIsPro } from '../../lib/subscription/store';
import { logScreen } from '../../lib/analytics';

type ModuleItem = {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  accent: string;
  pro?: boolean;
};

const MODULES: ModuleItem[] = [
  {
    label: 'Classes',
    subtitle: 'Manage class groups',
    icon: 'school-outline',
    route: '/(app)/classes',
    accent: '#22c55e',
  },
  {
    label: 'Students',
    subtitle: 'Register students, view profiles',
    icon: 'people-outline',
    route: '/(app)/students',
    accent: '#3b82f6',
  },
  {
    label: 'Payments',
    subtitle: 'Record fees, track unpaid',
    icon: 'card-outline',
    route: '/(app)/payments',
    accent: '#f59e0b',
  },
  {
    label: 'Attendance',
    subtitle: 'Mark present, view reports',
    icon: 'checkbox-outline',
    route: '/(app)/attendance',
    accent: '#a855f7',
  },
  {
    label: 'Reports',
    subtitle: 'Stats, earnings, PDF exports',
    icon: 'bar-chart-outline',
    route: '/(app)/reports',
    accent: '#ec4899',
  },
  {
    label: 'Notes',
    subtitle: 'Upload PDFs, topic notes',
    icon: 'document-text-outline',
    route: '/(app)/notes',
    accent: '#14b8a6',
    pro: true,
  },
  {
    label: 'Assistants',
    subtitle: 'Manage assistants & permissions',
    icon: 'people-circle-outline',
    route: '/(app)/assistants',
    accent: '#f97316',
    pro: true,
  },
  {
    label: 'Messages',
    subtitle: 'SMS history & templates',
    icon: 'chatbubble-ellipses-outline',
    route: '/(app)/messages',
    accent: '#06b6d4',
  },
  {
    label: 'Chat',
    subtitle: 'Message students & groups',
    icon: 'chatbubbles-outline',
    route: '/(app)/chat',
    accent: '#8b5cf6',
    pro: true,
  },
  {
    label: 'Exams',
    subtitle: 'Create exams & record marks',
    icon: 'school-outline',
    route: '/(app)/exams',
    accent: '#22c55e',
  },
  {
    label: 'Extra Classes',
    subtitle: 'One-off sessions & fees',
    icon: 'flash-outline',
    route: '/(app)/extra-class',
    accent: '#eab308',
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const colors = useThemeStore((s) => s.colors);
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const isProUser = useIsPro();
  const { status: syncStatus, lastSyncedAt, lastCloudBackupAt, errorMsg, sync, clearError } = useSyncEngine();
  const lastBackupShown = lastSyncedAt ?? lastCloudBackupAt;

  const firstName = teacher?.username?.split(' ')[0] ?? 'Teacher';
  const canSync = !!session && session.expires_at * 1000 > Date.now();

  useEffect(() => { logScreen('home', { plan: isProUser ? 'pro' : 'free' }); }, [isProUser]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar
        barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={['#22c55e', '#16a34a']}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarText}>
                {firstName.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
            <View>
              <Text style={[styles.greetingText, { color: colors.textMuted }]}>
                {greeting()}
              </Text>
              <Text style={[styles.nameText, { color: colors.text }]}>
                {firstName}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => toggle()}
              hitSlop={10}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
                pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
              ]}
              accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Ionicons
                name={mode === 'dark' ? 'sunny' : 'moon'}
                size={18}
                color={colors.text}
              />
            </Pressable>
          </View>
        </View>

        {/* ── Sync strip ── */}
        {canSync && (
          <SyncStrip
            status={syncStatus}
            lastSyncedAt={lastBackupShown}
            errorMsg={errorMsg}
            onSync={sync}
            onClear={clearError}
            colors={colors}
          />
        )}

        {/* ── Stats row ── */}
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatItem label="Classes" icon="school-outline" color="#22c55e" colors={colors} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatItem label="Students" icon="people-outline" color="#3b82f6" colors={colors} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatItem label="Payments" icon="card-outline" color="#f59e0b" colors={colors} />
        </View>

        {/* ── Modules ── */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          Modules
        </Text>

        <View style={styles.modulesGrid}>
          {MODULES.map((m) => (
            <ModuleTile
              key={m.label}
              item={m}
              colors={colors}
              mode={mode}
              locked={!!m.pro && !isProUser}
              onPress={() => router.push(m.route as never)}
            />
          ))}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 8 }]}>
          Quick Actions
        </Text>
        <View style={[styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <QuickAction
            label="Scan Student QR"
            icon="qr-code-outline"
            color="#22c55e"
            colors={colors}
            onPress={() => router.push('/(app)/students/scan' as never)}
          />
          <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
          <QuickAction
            label="Mark Today's Attendance"
            icon="checkbox-outline"
            color="#a855f7"
            colors={colors}
            onPress={() => router.push('/(app)/attendance' as never)}
          />
          <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
          <QuickAction
            label="Record a Payment"
            icon="add-circle-outline"
            color="#f59e0b"
            colors={colors}
            onPress={() => router.push('/(app)/payments/new' as never)}
          />
          <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
          <QuickAction
            label="Add New Student"
            icon="person-add-outline"
            color="#3b82f6"
            colors={colors}
            onPress={() => router.push('/(app)/students/new' as never)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ── Sync Strip ──
function SyncStrip({
  status,
  lastSyncedAt,
  errorMsg,
  onSync,
  onClear,
  colors,
}: {
  status: ReturnType<typeof useSyncEngine>['status'];
  lastSyncedAt: string | null;
  errorMsg: string | null;
  onSync: () => void;
  onClear: () => void;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  const isError  = status === 'error';
  const isSaving = status === 'syncing';

  const label = isSaving
    ? 'Saving to cloud…'
    : isError
    ? 'Could not save to cloud'
    : lastSyncedAt
    ? `Cloud saved ${timeSinceSync(lastSyncedAt)}`
    : 'Not yet saved to cloud';

  const icon: keyof typeof Ionicons.glyphMap = isError
    ? 'cloud-offline-outline'
    : isSaving
    ? 'cloud-upload-outline'
    : lastSyncedAt
    ? 'checkmark-circle-outline'
    : 'cloud-outline';

  const textColor  = isError ? colors.danger : colors.textMuted;
  const iconColor  = isError ? colors.danger : isSaving ? '#22c55e' : '#22c55e';

  return (
    <View style={[syncStyles.strip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {isSaving
        ? <ActivityIndicator size={13} color={iconColor} />
        : <Ionicons name={icon} size={14} color={iconColor} />
      }
      <Text style={[syncStyles.label, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
      {isError && (
        <>
          <Pressable
            onPress={() => {
              if (errorMsg) {
                (require('react-native') as { Alert: { alert:(t:string,m:string)=>void } })
                  .Alert.alert('Could not save to cloud', errorMsg);
              }
            }}
            hitSlop={8}
          >
            <Text style={[syncStyles.actionBtn, { color: textColor, borderColor: textColor + '40' }]}>
              Details
            </Text>
          </Pressable>
          <Pressable onPress={onSync} hitSlop={8}>
            <Text style={[syncStyles.actionBtn, { color: '#22c55e', borderColor: '#22c55e40' }]}>
              Retry
            </Text>
          </Pressable>
          <Pressable onPress={onClear} hitSlop={8}>
            <Ionicons name="close-outline" size={16} color={colors.textMuted} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const syncStyles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  label: { flex: 1, fontSize: 12, fontWeight: '500' },
  actionBtn: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});

// ── Module Tile ──
function ModuleTile({
  item,
  colors,
  mode,
  locked,
  onPress,
}: {
  item: ModuleItem;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  mode: string;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${item.label} — Pro feature, locked` : `Open ${item.label}`}
    >
      <View style={[styles.tileIconBox, { backgroundColor: item.accent + '18' }]}>
        <Ionicons name={item.icon} size={22} color={item.accent} />
      </View>
      <View style={styles.tileContent}>
        <View style={styles.tileTitleRow}>
          <Text style={[styles.tileTitle, { color: colors.text }]}>{item.label}</Text>
          {locked && (
            <View style={styles.proBadge}>
              <Ionicons name="lock-closed" size={8} color="#020617" />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>
        <Text style={[styles.tileSub, { color: colors.textMuted }]} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

// ── Stat Item ──
function StatItem({
  label,
  icon,
  color,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

// ── Quick Action ──
function QuickAction({
  label,
  icon,
  color,
  colors,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickRow,
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.quickIconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarGradient: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#020617',
    fontSize: 18,
    fontWeight: '800',
  },
  greetingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  nameText: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 1,
    letterSpacing: -0.3,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    marginBottom: 28,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Section title
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingLeft: 2,
  },

  // Module tiles
  modulesGrid: {
    gap: 10,
    marginBottom: 28,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  tileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileContent: {
    flex: 1,
  },
  tileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f59e0b',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  proBadgeText: {
    color: '#020617',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tileSub: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Quick actions
  quickCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 52,
  },
  quickDivider: {
    height: 1,
    marginLeft: 60,
  },
  quickIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});
