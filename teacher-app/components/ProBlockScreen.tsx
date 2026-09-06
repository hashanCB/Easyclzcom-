import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../lib/theme/store';

interface Props {
  /** Feature name shown in the message, e.g. "Chat", "Notes". */
  feature: string;
  /** One short line about what the feature does. */
  description?: string;
}

/**
 * Full-screen lock shown when a Free teacher opens a Pro-only (cloud) feature.
 * Blocks the feature and invites an upgrade.
 */
export function ProBlockScreen({ feature, description }: Props) {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);

  // Go back if there's a screen to return to; otherwise fall back to home.
  // (Some blocked routes are reached via replace or as the first screen, where
  // a bare GO_BACK has nothing to handle it.)
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Back */}
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.lockCircle}>
          <Ionicons name="lock-closed" size={40} color="#fff" />
        </View>

        <Text style={[styles.badge, { color: '#2563eb' }]}>PRO FEATURE</Text>
        <Text style={[styles.title, { color: colors.text }]}>{feature} is a Pro feature</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {description ?? `${feature} needs the cloud.`} It is not available on the Free plan.
          Upgrade to Pro to unlock it and keep all your data safe in the cloud.
        </Text>

        <View style={[styles.priceBox, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.priceText, { color: colors.textMuted }]}>Only </Text>
          <Text style={styles.priceAmount}>$1</Text>
          <Text style={[styles.priceText, { color: colors.textMuted }]}> / month</Text>
        </View>

        <Pressable style={styles.upgradeBtn} onPress={() => router.push('/(app)/subscription' as never)}>
          <Ionicons name="star" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { padding: 16, paddingBottom: 0 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  lockCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  badge: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 22,
    marginBottom: 18,
  },
  priceText: { fontSize: 15, fontWeight: '600' },
  priceAmount: { fontSize: 28, fontWeight: '900', color: '#2563eb' },
  upgradeBtn: {
    alignSelf: 'stretch',
    maxWidth: 320,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
