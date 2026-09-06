import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { useScreenTitle } from '../../lib/ui/header';

export default function ProfileScreen() {
  useScreenTitle('Profile');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);

  const initials = teacher?.username
    ? teacher.username.slice(0, 2).toUpperCase()
    : '??';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View style={styles.heroSection}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.primaryText }]}>{initials}</Text>
          </View>
          <Text style={[styles.heroName, { color: colors.text }]}>
            {teacher?.username ?? 'Teacher'}
          </Text>
          <View style={[styles.roleBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
            <Ionicons name="school-outline" size={12} color={colors.primary} />
            <Text style={[styles.roleText, { color: colors.primary }]}>Teacher</Text>
          </View>
        </View>

        {/* Info card */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCOUNT INFO</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <View style={[styles.rowIconBox, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Username</Text>
              <Text style={[styles.rowValue, { color: colors.text }]}>{teacher?.username ?? '—'}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoRow}>
            <View style={[styles.rowIconBox, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="id-card-outline" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Teacher ID</Text>
              <Text style={[styles.rowValue, { color: colors.text, fontFamily: 'monospace', fontSize: 12 }]} numberOfLines={1}>
                {teacher?.id ?? '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Edit profile */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PERSONAL DETAILS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push('/(app)/edit-profile')}
            style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <View style={[styles.rowIconBox, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="create-outline" size={16} color={colors.primary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Edit Profile</Text>
              <Text style={[styles.rowValue, { color: colors.text }]}>
                Name, photo, contact details
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

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

  heroSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 26, fontWeight: '800' },
  heroName: { fontSize: 20, fontWeight: '700' },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  roleText: { fontSize: 12, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
  },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: 20,
    overflow: 'hidden',
  },

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
});
