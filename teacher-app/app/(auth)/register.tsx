import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ErrorAlert } from '../../components/ui/ErrorAlert';
import { FormInput } from '../../components/ui/FormInput';
import { BackButton } from '../../components/ui/BackButton';
import {
  registerTeacherRequest,
  registerTeacherConfirm,
  ApiError,
  type AuthResult,
} from '../../lib/api/auth';
import { useAuthStore } from '../../lib/auth/store';
import { getDeviceId, getDeviceInfo } from '../../lib/device';
import { localIsEmpty, cloudHasData } from '../../lib/restore';
import { DEFAULT_PLAN_CODE, useSubscriptionStore } from '../../lib/subscription/store';

const detailsSchema = z.object({
  name: z.string().min(1, 'Enter your name').max(120),
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(50)
    .regex(/^[a-z0-9_.-]+$/i, 'Letters, digits, _ . - only'),
  phone: z.string().min(7, 'Enter your phone number').max(20),
  email: z.string().min(1, 'Enter your email').email('Enter a valid email').max(190),
  password: z.string().min(8, 'At least 8 characters').max(100),
});
type DetailsValues = z.infer<typeof detailsSchema>;

const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
type OtpValues = z.infer<typeof otpSchema>;

const ERROR_MESSAGES: Record<string, string> = {
  conflict: 'That username or phone is already taken.',
  username_taken: 'That username is already taken.',
  phone_taken: 'An account already exists for this phone number.',
  rate_limited: 'Please wait a moment before requesting another code.',
  wrong_credentials: 'Incorrect verification code.',
  not_found: 'Your code expired. Please start again.',
};

// Codes that mean "you may already have an account" — show a reset shortcut.
const ACCOUNT_EXISTS_CODES = new Set(['phone_taken', 'username_taken', 'conflict']);

export default function RegisterScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const plans = useSubscriptionStore((s) => s.plans);
  const fetchPlans = useSubscriptionStore((s) => s.fetchPlans);

  const [step, setStep] = useState<'plan' | 'details' | 'otp'>('plan');
  const [selectedPlan, setSelectedPlan] = useState<string>(DEFAULT_PLAN_CODE);
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  // When sign-up fails because the phone/username already has an account, offer
  // a one-tap shortcut to the password-reset flow instead of a dead end.
  const [accountExists, setAccountExists] = useState(false);

  React.useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  const detailsForm = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: '', username: '', phone: '', email: '', password: '' },
  });

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });

  function mapError(err: unknown): string {
    if (err instanceof ApiError) {
      return ERROR_MESSAGES[err.code] ?? err.message ?? 'Something went wrong. Please try again.';
    }
    const detail = err instanceof Error ? err.message : String(err);
    return `Network error: ${detail}`;
  }

  async function onSubmitDetails(values: DetailsValues) {
    setGlobalError(null);
    setAccountExists(false);
    try {
      await registerTeacherRequest({
        name: values.name.trim(),
        username: values.username.toLowerCase().trim(),
        phone: values.phone.trim(),
        email: values.email.trim().toLowerCase(),
      });
      setDetails({ ...values, username: values.username.toLowerCase().trim() });
      setStep('otp');
    } catch (err) {
      setGlobalError(mapError(err));
      if (err instanceof ApiError && ACCOUNT_EXISTS_CODES.has(err.code)) {
        setAccountExists(true);
      }
    }
  }

  async function completeLogin(result: AuthResult) {
    await setAuth(result.session, result.teacher);
    let goToRestore = false;
    try {
      if (
        localIsEmpty(result.teacher.id) &&
        (await cloudHasData(result.teacher.id, result.session.access_token))
      ) {
        goToRestore = true;
      }
    } catch {
    }
    router.replace(goToRestore ? '/(app)/restore' : '/(app)');
  }

  async function onSubmitOtp(values: OtpValues) {
    if (!details) return;
    setGlobalError(null);
    try {
      const device_id = await getDeviceId();
      const device_info = getDeviceInfo();
      const result = await registerTeacherConfirm({
        name: details.name.trim(),
        username: details.username,
        phone: details.phone.trim(),
        email: details.email.trim().toLowerCase(),
        password: details.password,
        otp: values.otp,
        device_id,
        device_info,
        plan_code: selectedPlan,
      });
      await completeLogin(result);
    } catch (err) {
      setGlobalError(mapError(err));
    }
  }

  async function resendCode() {
    if (!details) return;
    setGlobalError(null);
    try {
      await registerTeacherRequest({
        name: details.name.trim(),
        username: details.username,
        phone: details.phone.trim(),
        email: details.email.trim().toLowerCase(),
      });
    } catch (err) {
      setGlobalError(mapError(err));
    }
  }

  function handleBack() {
    if (step === 'otp') {
      setGlobalError(null);
      setStep('details');
    } else if (step === 'details') {
      setGlobalError(null);
      setStep('plan');
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/login');
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#020617', '#0b1120', '#020617']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <BackButton onPress={handleBack} color="#94a3b8" />
          <View style={styles.stepIndicator}>
            {(['plan', 'details', 'otp'] as const).map((s, i) => (
              <View key={s} style={styles.stepDotRow}>
                <View
                  style={[
                    styles.stepDot,
                    step === s
                      ? styles.stepDotActive
                      : styles.stepDotInactive,
                  ]}
                />
                {i < 2 && (
                  <View
                    style={[
                      styles.stepLine,
                      (step === 'details' && i === 0) || step === 'otp'
                        ? styles.stepLineActive
                        : styles.stepLineInactive,
                    ]}
                  />
                )}
              </View>
            ))}
          </View>
        </View>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {step === 'plan' ? 'Choose Your Plan' : 'Create Your Account'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 'plan'
                  ? 'Every plan starts with a free trial — no payment needed today'
                  : step === 'details'
                  ? 'Set up your teacher account in two quick steps'
                  : `Enter the 6-digit code sent to ${details?.phone}`}
              </Text>
            </View>

            <View style={styles.card}>
              <ErrorAlert message={globalError} />

              {accountExists && step === 'details' && (
                <Pressable
                  onPress={() => {
                    const u = detailsForm.getValues('username')?.toLowerCase().trim();
                    router.push({
                      pathname: '/(auth)/forgot-password',
                      params: u ? { username: u } : {},
                    });
                  }}
                  style={({ pressed }) => [styles.resetCta, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Reset your password"
                >
                  <Ionicons name="key-outline" size={16} color="#22c55e" />
                  <Text style={styles.resetCtaText}>
                    Already have an account? Reset your password
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#22c55e" />
                </Pressable>
              )}

              {step === 'plan' && (
                <View key="plan">
                  {plans.map((plan) => {
                    const active = selectedPlan === plan.code;
                    return (
                      <Pressable
                        key={plan.code}
                        onPress={() => setSelectedPlan(plan.code)}
                        style={[
                          styles.planCard,
                          active && styles.planCardActive,
                        ]}
                      >
                        <View style={styles.planLeft}>
                          <View
                            style={[
                              styles.planRadio,
                              active && styles.planRadioActive,
                            ]}
                          >
                            {active && (
                              <Ionicons name="checkmark" size={14} color="#020617" />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.planName, active && { color: '#f8fafc' }]}>
                              {plan.name}
                            </Text>
                            <Text style={[styles.planBlurb, active && { color: '#94a3b8' }]}>
                              {plan.maxStudents == null
                                ? 'Unlimited students'
                                : `Up to ${plan.maxStudents} students`}
                            </Text>
                          </View>
                          <Text style={[styles.planPrice, active && { color: '#f8fafc' }]}>
                            {plan.price}
                            <Text style={[styles.planPer, active && { color: '#94a3b8' }]}>/mo</Text>
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}

                  <Pressable
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => setStep('details')}
                    accessibilityRole="button"
                    accessibilityLabel="Start free trial with the selected plan"
                  >
                    <LinearGradient
                      colors={['#22c55e', '#16a34a']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>Start Free Trial</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {step === 'details' && (
                <View key="details">
                  <FormInput
                    control={detailsForm.control}
                    name="name"
                    label="Full Name"
                    placeholder="e.g. John Doe"
                    error={detailsForm.formState.errors.name?.message}
                  />
                  <FormInput
                    control={detailsForm.control}
                    name="username"
                    label="Username"
                    placeholder="e.g. john_doe"
                    error={detailsForm.formState.errors.username?.message}
                    autoCapitalize="none"
                    autoComplete="username"
                    textContentType="username"
                  />
                  <FormInput
                    control={detailsForm.control}
                    name="phone"
                    label="Phone Number"
                    placeholder="e.g. 0771234567"
                    error={detailsForm.formState.errors.phone?.message}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                  />
                  <FormInput
                    control={detailsForm.control}
                    name="email"
                    label="Email"
                    placeholder="e.g. you@example.com"
                    error={detailsForm.formState.errors.email?.message}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                  />
                  <FormInput
                    control={detailsForm.control}
                    name="password"
                    label="Password"
                    placeholder="At least 8 characters"
                    error={detailsForm.formState.errors.password?.message}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                  />

                  <Pressable
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={detailsForm.handleSubmit(onSubmitDetails)}
                    disabled={detailsForm.formState.isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="Send verification code"
                  >
                    <LinearGradient
                      colors={['#22c55e', '#16a34a']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {detailsForm.formState.isSubmitting ? (
                        <ActivityIndicator color="#020617" />
                      ) : (
                        <Text style={styles.buttonText}>Send Code</Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {step === 'otp' && (
                <View key="otp">
                  <FormInput
                    control={otpForm.control}
                    name="otp"
                    label="Verification Code"
                    placeholder="6-digit code"
                    error={otpForm.formState.errors.otp?.message}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    maxLength={6}
                  />

                  <Pressable
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={otpForm.handleSubmit(onSubmitOtp)}
                    disabled={otpForm.formState.isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="Verify and create account"
                  >
                    <LinearGradient
                      colors={['#22c55e', '#16a34a']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {otpForm.formState.isSubmitting ? (
                        <ActivityIndicator color="#020617" />
                      ) : (
                        <Text style={styles.buttonText}>Verify & Create Account</Text>
                      )}
                    </LinearGradient>
                  </Pressable>

                  <View style={styles.otpActions}>
                    <Pressable
                      onPress={resendCode}
                      style={({ pressed }) => [
                        styles.otpActionBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.otpActionText}>Resend code</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setGlobalError(null);
                        setStep('details');
                      }}
                      style={({ pressed }) => [
                        styles.otpActionBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.otpActionText}>Edit details</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              style={({ pressed }) => [
                styles.switchLink,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.switchText}>Already have an account? Log in</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
  },
  safe: { flex: 1 },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingRight: 16,
  },
  stepDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepDotActive: {
    backgroundColor: '#22c55e',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepDotInactive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  stepLine: {
    width: 16,
    height: 1.5,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: '#22c55e',
  },
  stepLineInactive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: { marginBottom: 32, alignItems: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: 'rgba(30,41,59,0.5)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  buttonGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: '#020617',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  planCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  planCardActive: {
    borderColor: 'rgba(34,197,94,0.4)',
    backgroundColor: 'rgba(34,197,94,0.06)',
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  planRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioActive: {
    borderColor: '#22c55e',
    backgroundColor: '#22c55e',
  },
  planName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94a3b8',
  },
  planBlurb: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#94a3b8',
  },
  planPer: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  otpActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 20,
  },
  otpActionBtn: {
    paddingVertical: 4,
  },
  otpActionText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  resetCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  resetCtaText: {
    flex: 1,
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
  },
  switchLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '500',
  },
});
