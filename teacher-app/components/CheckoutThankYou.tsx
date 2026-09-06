import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSubscriptionStore } from '../lib/subscription/store';
import { useThemeStore } from '../lib/theme/store';

/**
 * Shown once when the teacher returns from a successful Stripe checkout. Confirms
 * the subscription and points them at the subscription screen, where they can see
 * the renewal date and cancel any time. Replaces the (wrong) upgrade ad that used
 * to appear right after paying.
 */
export function CheckoutThankYou() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const visible = useSubscriptionStore((s) => s.thankYouVisible);
  const hideThankYou = useSubscriptionStore((s) => s.hideThankYou);

  function manage() {
    hideThankYou();
    router.push('/subscription');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={hideThankYou}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>You're subscribed 🎉</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Thank you for subscribing to Pro! Your data now backs up to the cloud
            automatically. You can cancel any time — no lock-in.
          </Text>

          <Pressable style={styles.manageBtn} onPress={manage}>
            <Ionicons name="settings-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.manageBtnText}>Manage subscription</Text>
          </Pressable>

          <Pressable onPress={hideThankYou} hitSlop={8} style={styles.doneBtn}>
            <Text style={[styles.doneText, { color: colors.textMuted }]}>Done</Text>
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
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  manageBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  doneBtn: { marginTop: 12, paddingVertical: 6 },
  doneText: { fontSize: 14, fontWeight: '500' },
});
