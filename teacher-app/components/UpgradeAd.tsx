import React, { useEffect, useRef } from 'react';
import {
  AppState,
  AppStateStatus,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSubscriptionStore } from '../lib/subscription/store';
import { useThemeStore } from '../lib/theme/store';

// On returning to the app, sometimes (not always) remind a Free user to upgrade.
const RANDOM_SHOW_CHANCE = 0.3;

const FEATURES = [
  { icon: 'cloud-upload-outline', label: 'Save all your data safely in the cloud' },
  { icon: 'phone-portrait-outline', label: 'Use on more than one phone' },
  { icon: 'people-outline', label: 'Students can log in to the portal' },
  { icon: 'shield-checkmark-outline', label: 'Never lose data if your phone breaks' },
];

export function UpgradeAd() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const adVisible = useSubscriptionStore((s) => s.adVisible);
  const hideAd = useSubscriptionStore((s) => s.hideAd);
  const maybeShowAd = useSubscriptionStore((s) => s.maybeShowAd);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Randomly show the ad when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      if (wasBackground && next === 'active' && Math.random() < RANDOM_SHOW_CHANCE) {
        maybeShowAd();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [maybeShowAd]);

  function goUpgrade() {
    hideAd();
    router.push('/subscription');
  }

  return (
    <Modal visible={adVisible} transparent animationType="fade" onRequestClose={hideAd}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Pressable onPress={hideAd} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>

          <View style={styles.iconCircle}>
            <Ionicons name="cloud-upload" size={34} color="#fff" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Keep your data safe</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            On the Free plan your data stays only on this phone. Upgrade to Pro and
            we back it up to the cloud automatically.
          </Text>

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.featureRow}>
                <Ionicons name={f.icon as never} size={18} color="#2563eb" style={{ marginRight: 10 }} />
                <Text style={[styles.featureLabel, { color: colors.text }]}>{f.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.priceBox, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.priceText, { color: colors.text }]}>Only </Text>
            <Text style={styles.priceAmount}>$1</Text>
            <Text style={[styles.priceText, { color: colors.textMuted }]}> / month</Text>
          </View>

          <Pressable style={styles.upgradeBtn} onPress={goUpgrade}>
            <Ionicons name="star" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
          </Pressable>

          <Pressable onPress={hideAd} hitSlop={8} style={styles.laterBtn}>
            <Text style={[styles.laterText, { color: colors.textMuted }]}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 12, right: 12, padding: 4, zIndex: 1 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  features: { alignSelf: 'stretch', marginTop: 18, marginBottom: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  featureLabel: { fontSize: 14, flex: 1 },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  priceText: { fontSize: 15, fontWeight: '600' },
  priceAmount: { fontSize: 26, fontWeight: '900', color: '#2563eb' },
  upgradeBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  laterBtn: { marginTop: 12, paddingVertical: 6 },
  laterText: { fontSize: 14, fontWeight: '500' },
});
