import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../lib/auth/store';
import { useThemeStore } from '../lib/theme/store';
import { DEFAULT_PLAN_CODE, useSubscriptionStore } from '../lib/subscription/store';
import { logEvent, logScreen } from '../lib/analytics';

/**
 * Full-screen, non-dismissible "Choose your plan" gate. Shown once the 14-day
 * trial has ended and the teacher has not paid. The only ways out are: pick a
 * plan and pay, or sign out.
 */
export function Paywall() {
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token) ?? '';
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const fetchSub = useSubscriptionStore((s) => s.fetch);
  const loading = useSubscriptionStore((s) => s.loading);
  const plans = useSubscriptionStore((s) => s.plans);
  const fetchPlans = useSubscriptionStore((s) => s.fetchPlans);
  const createCheckoutSession = useSubscriptionStore((s) => s.createCheckoutSession);

  const [selected, setSelected] = useState<string>(DEFAULT_PLAN_CODE);
  const [busy, setBusy] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => { logScreen('paywall'); }, []);
  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  const refresh = useCallback(() => { if (token) fetchSub(token); }, [token, fetchSub]);

  // When the teacher comes back from the payment page, re-check their status.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      if (wasBackground && next === 'active' && awaitingPayment) refresh();
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [awaitingPayment, refresh]);

  const handleSubscribe = async () => {
    if (!token) return;
    setBusy(true);
    logEvent('upgrade.checkout_start', { source: 'paywall', plan: selected });
    try {
      const url = await createCheckoutSession(token, selected);
      setAwaitingPayment(true);
      await Linking.openURL(url);
    } catch (e: unknown) {
      logEvent('upgrade.checkout_error');
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of this account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void clearAuth(); } },
    ]);
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={() => {}}>
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={32} color="#fff" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Your free trial has ended</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Choose a plan to keep using the app. Your data is safe — pick a plan to unlock it again.
          </Text>

          {plans.map((plan) => {
            const active = selected === plan.code;
            return (
              <Pressable
                key={plan.code}
                onPress={() => setSelected(plan.code)}
                style={[
                  styles.planCard,
                  { backgroundColor: colors.surface, borderColor: active ? '#2563eb' : colors.border },
                  active && styles.planCardActive,
                ]}
              >
                <View style={styles.planRadio}>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? '#2563eb' : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                  <Text style={[styles.planBlurb, { color: colors.textMuted }]}>
                    {plan.blurb} ·{' '}
                    {plan.maxStudents == null ? 'unlimited students' : `up to ${plan.maxStudents} students`}
                  </Text>
                </View>
                <Text style={[styles.planPrice, { color: colors.text }]}>
                  {plan.price}
                  <Text style={[styles.planPer, { color: colors.textMuted }]}> /mo</Text>
                </Text>
              </Pressable>
            );
          })}

          {awaitingPayment && (
            <View style={[styles.awaitingBanner, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <Ionicons name="time-outline" size={18} color="#d97706" />
              <Text style={styles.awaitingBody}>
                Finish paying in the browser, then come back here. Your access unlocks automatically.
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.payBtn, busy && styles.btnDisabled]}
            onPress={handleSubscribe}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.payBtnText}>Continue to payment</Text>}
          </Pressable>

          <Pressable onPress={refresh} style={styles.refreshBtn} disabled={loading}>
            {loading
              ? <ActivityIndicator size="small" color={colors.textMuted} />
              : <>
                  <Ionicons name="refresh-outline" size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
                  <Text style={[styles.refreshText, { color: colors.textMuted }]}>I already paid — refresh</Text>
                </>}
          </Pressable>

          <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={[styles.signOutText, { color: colors.textMuted }]}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 64, paddingBottom: 48, alignItems: 'center' },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#2563eb',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 22 },

  planCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  planCardActive: { borderWidth: 2 },
  planRadio: { marginRight: 12 },
  planName: { fontSize: 16, fontWeight: '700' },
  planBlurb: { fontSize: 12, marginTop: 2 },
  planPrice: { fontSize: 18, fontWeight: '800', marginLeft: 8 },
  planPer: { fontSize: 12, fontWeight: '600' },

  awaitingBanner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  awaitingBody: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },

  payBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  refreshText: { fontSize: 14, fontWeight: '500' },
  signOutBtn: { paddingVertical: 8 },
  signOutText: { fontSize: 13, fontWeight: '500' },
});
