import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopNavbar } from '../../components/TopNavbar';
import { SyncBanner } from '../../components/SyncBanner';
import { UpgradeAd } from '../../components/UpgradeAd';
import { CheckoutThankYou } from '../../components/CheckoutThankYou';
import { Paywall } from '../../components/Paywall';
import { useThemeStore } from '../../lib/theme/store';
import { useAuthStore } from '../../lib/auth/store';
import { hasActiveAccess, useSubscriptionStore } from '../../lib/subscription/store';

export default function AppLayout() {
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token);
  const fetchSub = useSubscriptionStore((s) => s.fetch);
  const subscription = useSubscriptionStore((s) => s.subscription);
  const showThankYou = useSubscriptionStore((s) => s.showThankYou);
  const url = Linking.useURL();
  const handledUrl = useRef<string | null>(null);

  // Load the plan on open so the trial gate and the upgrade ad know the status.
  useEffect(() => {
    if (token) fetchSub(token);
  }, [token, fetchSub]);

  // Handle the deep link Stripe bounces back to (…?checkout=success|cancel).
  // On success: show the thank-you (not the upgrade ad) and re-poll status a few
  // times, since the webhook that flips us to Pro can land a moment later.
  useEffect(() => {
    if (!url || url === handledUrl.current) return;
    const checkout = Linking.parse(url).queryParams?.checkout;
    if (checkout !== 'success' && checkout !== 'cancel') return;
    handledUrl.current = url;

    if (checkout === 'success') showThankYou();
    if (!token) return;
    const delays = [0, 2000, 5000];
    const timers = delays.map((d) => setTimeout(() => fetchSub(token), d));
    return () => timers.forEach(clearTimeout);
  }, [url, token, fetchSub, showThankYou]);

  // Block the app once the trial has ended and the teacher hasn't paid. We only
  // gate after the status has loaded (subscription !== null) so we never flash
  // the paywall before the first fetch returns, and never lock people out while
  // offline (a failed fetch leaves subscription null).
  const blocked = subscription !== null && !hasActiveAccess(subscription);

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: colors.surface }}
    >
      <TopNavbar />
      <SyncBanner />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="account" />
          <Stack.Screen name="backup" />
          <Stack.Screen name="restore" />
          <Stack.Screen name="subscription" />
          <Stack.Screen name="sync-history" />
          <Stack.Screen name="support" />
          <Stack.Screen name="classes" />
          <Stack.Screen name="notifications" />
        </Stack>
      </View>
      <UpgradeAd />
      <CheckoutThankYou />
      {blocked && <Paywall />}
    </SafeAreaView>
  );
}
