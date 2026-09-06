import React, { useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorAlert } from '../../components/ui/ErrorAlert';
import { FormInput } from '../../components/ui/FormInput';
import { BackButton } from '../../components/ui/BackButton';
import {
  ApiError,
  requestTeacherPasswordResetOtp,
  verifyTeacherPasswordResetOtp,
  confirmTeacherPasswordReset,
} from '../../lib/api/auth';

// How long before the teacher can ask for a new code (real-world OTP pattern).
const RESEND_SECONDS = 120;

type Step = 'request' | 'verify' | 'reset';

// Step 1 — username; the OTP goes to the phone on file.
const requestSchema = z.object({
  username: z.string().min(3, 'Enter your username'),
});
type RequestValues = z.infer<typeof requestSchema>;

// Step 2 — the 6-digit code.
const verifySchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
type VerifyValues = z.infer<typeof verifySchema>;

// Step 3 — the new password.
const resetSchema = z
  .object({
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });
type ResetValues = z.infer<typeof resetSchema>;

function formatMmSs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  // Coming from the sign-up screen ("this number already has an account"), the
  // username the teacher typed is passed through so they don't re-enter it.
  const params = useLocalSearchParams<{ username?: string }>();
  const prefillUsername = (typeof params.username === 'string' ? params.username : '').toLowerCase().trim();
  const [step, setStep] = useState<Step>('request');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const requestForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { username: prefillUsername },
  });
  const verifyForm = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { otp: '' },
  });
  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  });

  // Tick the resend countdown down to zero while on the verify step.
  useEffect(() => {
    if (step !== 'verify') return;
    const id = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Step 1 — send the code.
  async function sendCode(forUsername: string): Promise<boolean> {
    setGlobalError(null);
    try {
      await requestTeacherPasswordResetOtp({ username: forUsername });
      setSecondsLeft(RESEND_SECONDS);
      return true;
    } catch (err) {
      setGlobalError(
        err instanceof ApiError ? err.message : 'Could not send the code. Please try again.',
      );
      return false;
    }
  }

  async function onRequest(values: RequestValues) {
    const cleaned = values.username.toLowerCase().trim();
    if (await sendCode(cleaned)) {
      setUsername(cleaned);
      verifyForm.reset({ otp: '' });
      setStep('verify');
    }
  }

  async function onResend() {
    if (secondsLeft > 0) return;
    await sendCode(username);
  }

  // Step 2 — verify the code (does not use it up).
  async function onVerify(values: VerifyValues) {
    setGlobalError(null);
    try {
      await verifyTeacherPasswordResetOtp({ username, otp: values.otp });
      setOtp(values.otp);
      resetForm.reset({ new_password: '', confirm_password: '' });
      setStep('reset');
    } catch (err) {
      setGlobalError(
        err instanceof ApiError ? err.message : 'Could not verify the code. Please try again.',
      );
    }
  }

  // Step 3 — set the new password.
  async function onReset(values: ResetValues) {
    setGlobalError(null);
    try {
      await confirmTeacherPasswordReset({ username, otp, new_password: values.new_password });
      router.replace({ pathname: '/(auth)/login', params: { username } });
    } catch (err) {
      setGlobalError(
        err instanceof ApiError ? err.message : 'Could not reset the password. Please try again.',
      );
    }
  }

  const subtitle =
    step === 'request'
      ? 'Enter your username. We’ll text a code to the phone on file.'
      : step === 'verify'
        ? 'Enter the 6-digit code we sent to your phone.'
        : 'Choose a new password for your account.';

  // Back steps through the wizard in reverse; from step 1 it leaves the screen.
  function handleBack() {
    setGlobalError(null);
    if (step === 'reset') setStep('verify');
    else if (step === 'verify') setStep('request');
    else if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <BackButton onPress={handleBack} color="#111827" />
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
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.card}>
            <ErrorAlert message={globalError} />

            {step === 'request' && (
              <View key="request">
                <FormInput
                  control={requestForm.control}
                  name="username"
                  label="Username"
                  placeholder="e.g. john_doe"
                  error={requestForm.formState.errors.username?.message}
                  autoComplete="username"
                  textContentType="username"
                />
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={requestForm.handleSubmit(onRequest)}
                  disabled={requestForm.formState.isSubmitting}
                >
                  {requestForm.formState.isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Send code</Text>
                  )}
                </Pressable>
              </View>
            )}

            {step === 'verify' && (
              <View key="verify">
                <FormInput
                  control={verifyForm.control}
                  name="otp"
                  label="Verification code"
                  placeholder="6-digit code"
                  error={verifyForm.formState.errors.otp?.message}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                />
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={verifyForm.handleSubmit(onVerify)}
                  disabled={verifyForm.formState.isSubmitting}
                >
                  {verifyForm.formState.isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Verify code</Text>
                  )}
                </Pressable>

                {secondsLeft > 0 ? (
                  <Text style={styles.timerText}>
                    You can resend the code in {formatMmSs(secondsLeft)}
                  </Text>
                ) : (
                  <Pressable onPress={onResend} style={styles.resendLink} hitSlop={8}>
                    <Text style={styles.resendActive}>Resend code</Text>
                  </Pressable>
                )}
              </View>
            )}

            {step === 'reset' && (
              <View key="reset">
                <FormInput
                  control={resetForm.control}
                  name="new_password"
                  label="New password"
                  placeholder="At least 8 characters"
                  error={resetForm.formState.errors.new_password?.message}
                  secureTextEntry
                  textContentType="newPassword"
                />
                <FormInput
                  control={resetForm.control}
                  name="confirm_password"
                  label="Confirm new password"
                  placeholder="Re-enter the password"
                  error={resetForm.formState.errors.confirm_password?.message}
                  secureTextEntry
                  textContentType="newPassword"
                />
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={resetForm.handleSubmit(onReset)}
                  disabled={resetForm.formState.isSubmitting}
                >
                  {resetForm.formState.isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Reset password</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          <Pressable onPress={() => router.back()} style={styles.switchLink}>
            <Text style={styles.switchText}>Back to sign in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f4f6' },
  topBar: { height: 44, justifyContent: 'center', paddingHorizontal: 12 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: { marginBottom: 32, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 21 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  button: {
    backgroundColor: '#1a56db',
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  timerText: { marginTop: 16, textAlign: 'center', color: '#6b7280', fontSize: 14 },
  resendLink: { marginTop: 16, alignItems: 'center' },
  resendActive: { color: '#1a56db', fontSize: 14, fontWeight: '600' },
  switchLink: { marginTop: 24, alignItems: 'center' },
  switchText: { color: '#1a56db', fontSize: 14, fontWeight: '500' },
});
