import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore, type ThemeColors } from '../../lib/theme/store';
import {
  useSubscriptionStore,
  planByCode,
  planDisplayName,
  trialDaysLeft,
  DEFAULT_PLAN_CODE,
  type Invoice,
} from '../../lib/subscription/store';
import { logScreen, logEvent } from '../../lib/analytics';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatUnix(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, colors }: { status: string; colors: ThemeColors }) {
  const isPro = status === 'active' || status === 'trialing';
  const color = isPro ? '#059669' : status === 'past_due' ? '#d97706' : '#6b7280';
  const label = status === 'active' ? 'Active'
    : status === 'trialing' ? 'Free Trial'
    : status === 'past_due' ? 'Payment Due'
    : status === 'cancelled' ? 'Cancelled'
    : 'Free';

  return (
    <View style={[styles.badge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ProFeatureRow({ icon, label, colors }: { icon: string; label: string; colors: ThemeColors }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon as never} size={18} color="#2563eb" style={styles.featureIcon} />
      <Text style={[styles.featureLabel, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

function InvoiceRow({ inv, colors }: { inv: Invoice; colors: ThemeColors }) {
  const isPaid = inv.status === 'paid';
  const statusColor = isPaid ? '#059669' : '#d97706';
  return (
    <View style={[styles.invoiceRow, { borderBottomColor: colors.border }]}>
      <View style={styles.invoicePeriod}>
        <Text style={[styles.invoicePeriodText, { color: colors.text }]}>
          {formatUnix(inv.period_start)} – {formatUnix(inv.period_end)}
        </Text>
        <Text style={[styles.invoiceDate, { color: colors.textMuted }]}>
          Charged {formatUnix(inv.created)}
        </Text>
      </View>
      <View style={styles.invoiceRight}>
        <Text style={[styles.invoiceAmount, { color: colors.text }]}>
          {formatAmount(inv.amount_paid, inv.currency)}
        </Text>
        <View style={[styles.invoiceStatusBadge, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.invoiceStatusText, { color: statusColor }]}>
            {isPaid ? 'Paid' : inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
          </Text>
        </View>
        {inv.hosted_invoice_url && (
          <Pressable
            onPress={() => Linking.openURL(inv.hosted_invoice_url!)}
            hitSlop={8}
            style={styles.receiptBtn}
          >
            <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const session = useAuthStore((s) => s.session);
  const colors = useThemeStore((s) => s.colors);
  const {
    subscription, plans, invoices,
    loading, invoicesLoading, cancelling, reactivating,
    error,
    fetch: fetchSub, fetchPlans, fetchInvoices, cancelSubscription, reactivateSubscription, createCheckoutSession,
  } = useSubscriptionStore();
  const [selectedPlan, setSelectedPlan] = useState<string>(DEFAULT_PLAN_CODE);
  const [upgrading, setUpgrading] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const token = session?.access_token ?? '';

  const load = useCallback(() => {
    if (!token) return;
    fetchSub(token);
    fetchInvoices(token);
  }, [token, fetchSub, fetchInvoices]);

  // Live plan list + prices (no auth needed).
  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  // Default the picker to the teacher's current package when it loads.
  useEffect(() => {
    const code = subscription?.plan_code;
    if (code && planByCode(plans, code)) setSelectedPlan(code);
  }, [subscription?.plan_code, plans]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Funnel: viewing the upgrade screen is the top of the conversion funnel.
  useEffect(() => { logScreen('subscription'); }, []);

  // When app returns to foreground while awaiting payment, auto-refresh
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      if (wasBackground && next === 'active' && awaitingPayment) {
        load();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [awaitingPayment, load]);

  const handleUpgrade = async () => {
    if (!token) return;
    setUpgrading(true);
    // Funnel: user tapped "Subscribe" — next step is completing payment.
    logEvent('upgrade.checkout_start', { source: 'upgrade_button', plan: selectedPlan });
    try {
      const url = await createCheckoutSession(token, selectedPlan);
      setAwaitingPayment(true);
      await Linking.openURL(url);
    } catch (e: unknown) {
      logEvent('upgrade.checkout_error');
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setUpgrading(false);
    }
  };

  const handleReactivate = () => {
    Alert.alert(
      'Reactivate Subscription',
      'Your subscription will continue renewing automatically. No new charge today.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reactivate',
          onPress: async () => {
            try {
              await reactivateSubscription(token);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to reactivate');
            }
          },
        },
      ],
    );
  };

  const handlePayNow = async () => {
    if (!token) return;
    setUpgrading(true);
    logEvent('upgrade.checkout_start', { source: 'pay_now' });
    try {
      const url = await createCheckoutSession(token);
      setAwaitingPayment(true);
      await Linking.openURL(url);
    } catch (e: unknown) {
      logEvent('upgrade.checkout_error');
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancel = () => {
    const expiry = formatDate(subscription?.current_period_end ?? null);
    Alert.alert(
      'Cancel Subscription',
      `Your Pro access will continue until ${expiry}. After that, your account switches to Free.\n\nCancel renewal?`,
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Renewal',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSubscription(token);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to cancel');
            }
          },
        },
      ],
    );
  };

  const isPro = subscription?.is_pro === true;
  const cancelAtEnd = subscription?.cancel_at_period_end === true;
  const isTrialing = subscription?.status === 'trialing';
  const currentPlan = planByCode(plans, subscription?.plan_code);
  const daysLeft = trialDaysLeft(subscription);
  // Free / trialing teachers can pick a package and pay; an active subscriber
  // manages their existing one instead.
  const canChoosePlan = subscription?.status !== 'active' && subscription?.status !== 'past_due';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Current plan card ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planName, { color: colors.text }]}>
                {isPro
                  ? `${planDisplayName(plans, subscription?.plan_code)} Plan`
                  : 'No Plan'}
              </Text>
              <Text style={[styles.planPrice, { color: colors.textMuted }]}>
                {isPro && currentPlan
                  ? `${currentPlan.price} / month · ${currentPlan.maxStudents == null ? 'unlimited students' : `up to ${currentPlan.maxStudents} students`}`
                  : isPro ? '' : 'Local only'}
              </Text>
            </View>
            <StatusBadge status={subscription?.status ?? 'inactive'} colors={colors} />
          </View>

          {/* ── Trial countdown ── */}
          {isTrialing && subscription && (
            <View style={[styles.periodBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
              <View style={styles.cancelNotice}>
                <Ionicons name="hourglass-outline" size={15} color="#2563eb" style={{ marginRight: 6 }} />
                <Text style={[styles.periodText, { color: '#1e40af', flex: 1 }]}>
                  You are on a free trial of the{' '}
                  <Text style={{ fontWeight: '700' }}>{planDisplayName(plans, subscription.plan_code)}</Text> plan.
                  {' '}It ends on{' '}
                  <Text style={{ fontWeight: '700' }}>{formatDate(subscription.current_period_end)}</Text>
                  {daysLeft > 0 ? ` — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.` : '.'}
                  {' '}Subscribe below to keep everything running.
                </Text>
              </View>
            </View>
          )}

          {isPro && !isTrialing && subscription && (
            <View style={[styles.periodBox, {
              backgroundColor: cancelAtEnd ? '#fffbeb' : colors.surfaceAlt,
              borderColor: cancelAtEnd ? '#fde68a' : colors.border,
            }]}>
              {cancelAtEnd ? (
                <View style={styles.cancelNotice}>
                  <Ionicons name="time-outline" size={15} color="#d97706" style={{ marginRight: 6 }} />
                  <Text style={[styles.periodText, { color: '#92400e', flex: 1 }]}>
                    Renewal cancelled — Pro access continues until{' '}
                    <Text style={{ fontWeight: '700' }}>{formatDate(subscription.current_period_end)}</Text>
                  </Text>
                </View>
              ) : (
                <Text style={[styles.periodText, { color: colors.textMuted }]}>
                  Next renewal: <Text style={{ color: colors.text, fontWeight: '600' }}>{formatDate(subscription.current_period_end)}</Text>
                </Text>
              )}
            </View>
          )}

          {loading && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
          )}
          {error && (
            <Text style={[styles.errorText, { color: '#dc2626' }]}>{error}</Text>
          )}
        </View>

        {/* ── Awaiting payment banner ── */}
        {awaitingPayment && (
          <View style={[styles.awaitingBanner, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
            <Ionicons name="time-outline" size={18} color="#d97706" />
            <View style={{ flex: 1 }}>
              <Text style={styles.awaitingTitle}>Complete your payment in the browser</Text>
              <Text style={styles.awaitingBody}>
                Return here after paying. Your Pro status will update automatically.
              </Text>
            </View>
            <Pressable
              onPress={() => { setAwaitingPayment(false); load(); }}
              style={[styles.awaitingRefreshBtn, { backgroundColor: '#d97706' }]}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.awaitingRefreshText}>Refresh</Text>}
            </Pressable>
          </View>
        )}

        {/* ── Choose a package & subscribe (free or trialing) ── */}
        {canChoosePlan && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
              {isTrialing ? 'Choose Your Plan' : 'Choose a Plan'}
            </Text>
            {plans.map((plan) => {
              const active = selectedPlan === plan.code;
              return (
                <Pressable
                  key={plan.code}
                  onPress={() => setSelectedPlan(plan.code)}
                  style={[
                    styles.planOption,
                    { backgroundColor: colors.surfaceAlt, borderColor: active ? '#2563eb' : colors.border },
                    active && styles.planOptionActive,
                  ]}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? '#2563eb' : colors.textMuted}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planOptionName, { color: colors.text }]}>{plan.name}</Text>
                    <Text style={[styles.planOptionBlurb, { color: colors.textMuted }]}>
                      {plan.maxStudents == null ? 'Unlimited students' : `Up to ${plan.maxStudents} students`}
                    </Text>
                  </View>
                  <Text style={[styles.planOptionPrice, { color: colors.text }]}>
                    {plan.price}
                    <Text style={[styles.planOptionPer, { color: colors.textMuted }]}>/mo</Text>
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.upgradeBtn, { marginBottom: 0, marginTop: 6 }, upgrading && styles.btnDisabled]}
              onPress={handleUpgrade}
              disabled={upgrading}
            >
              {upgrading
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="star-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.upgradeBtnText}>
                      Subscribe — {planByCode(plans, selectedPlan)?.price ?? ''}/month
                    </Text>
                  </>
              }
            </Pressable>
          </View>
        )}

        {/* ── Past due: pay now ── */}
        {subscription?.status === 'past_due' && (
          <Pressable
            style={[styles.upgradeBtn, { backgroundColor: '#d97706' }, upgrading && styles.btnDisabled]}
            onPress={handlePayNow}
            disabled={upgrading}
          >
            {upgrading
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="card-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.upgradeBtnText}>Update Payment — Renew Pro</Text>
                </>
            }
          </Pressable>
        )}

        {/* ── Reactivate (cancelled but still active) ── */}
        {isPro && cancelAtEnd && (
          <Pressable
            style={[styles.upgradeBtn, { backgroundColor: '#059669' }, reactivating && styles.btnDisabled]}
            onPress={handleReactivate}
            disabled={reactivating}
          >
            {reactivating
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="refresh-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.upgradeBtnText}>Reactivate Subscription</Text>
                </>
            }
          </Pressable>
        )}

        {/* ── Cancel (paying subscriber, not cancelled — trials have nothing to cancel) ── */}
        {subscription?.status === 'active' && !cancelAtEnd && (
          <Pressable
            style={[styles.cancelBtn, { borderColor: colors.border }, cancelling && styles.btnDisabled]}
            onPress={handleCancel}
            disabled={cancelling}
          >
            {cancelling
              ? <ActivityIndicator size="small" color="#dc2626" />
              : <>
                  <Ionicons name="close-circle-outline" size={18} color="#dc2626" style={{ marginRight: 8 }} />
                  <Text style={styles.cancelBtnText}>Cancel Subscription</Text>
                </>
            }
          </Pressable>
        )}

        {/* ── Pro features ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pro Features</Text>
          <ProFeatureRow icon="sync-outline" label="Cloud sync across devices" colors={colors} />
          <ProFeatureRow icon="people-outline" label="Student portal & login" colors={colors} />
          <ProFeatureRow icon="library-outline" label="Student note library" colors={colors} />
          <ProFeatureRow icon="chatbubbles-outline" label="Student chat" colors={colors} />
          <ProFeatureRow icon="person-add-outline" label="Assistant accounts" colors={colors} />
          <ProFeatureRow icon="cloud-download-outline" label="Cloud backup & restore" colors={colors} />
          <ProFeatureRow icon="notifications-outline" label="Push notifications" colors={colors} />
        </View>

        {/* ── Payment history ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment History</Text>
            {invoicesLoading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {!invoicesLoading && invoices.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {isPro ? 'No invoices yet.' : 'Subscribe to see payment history.'}
            </Text>
          )}

          {invoices.map((inv, i) => (
            <InvoiceRow
              key={inv.id}
              inv={inv}
              colors={colors}
            />
          ))}
        </View>

        <Pressable onPress={load} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.refreshText, { color: colors.textMuted }]}>Refresh</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48 },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planName: { fontSize: 18, fontWeight: '700' },
  planPrice: { fontSize: 13, marginTop: 2 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  periodBox: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  cancelNotice: { flexDirection: 'row', alignItems: 'flex-start' },
  periodText: { fontSize: 13, lineHeight: 20 },
  errorText: { fontSize: 13, marginTop: 8 },

  upgradeBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  upgradeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  cancelBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  cancelBtnText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },

  btnDisabled: { opacity: 0.5 },

  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  planOptionActive: { borderWidth: 2 },
  planOptionName: { fontSize: 15, fontWeight: '700' },
  planOptionBlurb: { fontSize: 12, marginTop: 2 },
  planOptionPrice: { fontSize: 16, fontWeight: '800', marginLeft: 8 },
  planOptionPer: { fontSize: 12, fontWeight: '600' },

  awaitingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  awaitingTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 2 },
  awaitingBody: { fontSize: 12, color: '#92400e', lineHeight: 17 },
  awaitingRefreshBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awaitingRefreshText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  featureIcon: { marginRight: 10 },
  featureLabel: { fontSize: 14 },

  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  invoicePeriod: { flex: 1 },
  invoicePeriodText: { fontSize: 13, fontWeight: '600' },
  invoiceDate: { fontSize: 11, marginTop: 2 },
  invoiceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invoiceAmount: { fontSize: 14, fontWeight: '700' },
  invoiceStatusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  invoiceStatusText: { fontSize: 11, fontWeight: '700' },
  receiptBtn: { padding: 2 },

  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  refreshBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  refreshText: { fontSize: 13 },
});
