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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorAlert } from '../../components/ui/ErrorAlert';
import { FormInput } from '../../components/ui/FormInput';
import { BackButton } from '../../components/ui/BackButton';
import { activateTeacher, ApiError } from '../../lib/api/auth';
import { useAuthStore } from '../../lib/auth/store';
import { getDeviceId, getDeviceInfo } from '../../lib/device';
import { localIsEmpty, cloudHasData, clearPulledFlag } from '../../lib/restore';

const schema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  token: z
    .string()
    .regex(/^\d{12}$/, 'Activation token must be exactly 12 digits'),
});

type FormValues = z.infer<typeof schema>;

const ERROR_MESSAGES: Record<string, string> = {
  wrong_credentials: 'Invalid username, password, or activation token.',
  inactive_teacher: 'Your account has been deactivated. Contact your admin.',
  duplicate_token:
    'This token is already bound to another device. Contact your admin if you switched phones.',
  invalid_input: 'Please check your entries and try again.',
};

export default function ActivateScreen() {
  const router = useRouter();
  const { username: usernameParam } = useLocalSearchParams<{ username?: string }>();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: usernameParam ?? '', password: '', token: '' },
  });

  async function onSubmit(values: FormValues) {
    setGlobalError(null);
    try {
      const device_id = await getDeviceId();
      const device_info = getDeviceInfo();

      const result = await activateTeacher({
        username: values.username.toLowerCase().trim(),
        password: values.password,
        token: values.token.trim(),
        device_id,
        device_info,
      });

      await setAuth(result.session, result.teacher, true);

      // Token reset / re-activation: make the cloud pull available again so the
      // teacher can re-download their data (auto-prompt below, or the manual
      // Account button) even if this device pulled under a previous activation.
      await clearPulledFlag(result.teacher.id);

      // New-phone restore (SRS §20.4): a re-activated teacher may already
      // have cloud data — offer the restore flow before entering the app.
      let goToRestore = false;
      try {
        if (
          localIsEmpty(result.teacher.id) &&
          (await cloudHasData(result.teacher.id, result.session.access_token))
        ) {
          goToRestore = true;
        }
      } catch {
        // Probe failed — fall through to home.
      }
      router.replace(goToRestore ? '/(app)/restore' : '/(app)');
    } catch (err) {
      if (err instanceof ApiError) {
        setGlobalError(
          ERROR_MESSAGES[err.code] ?? err.message ?? 'Activation failed. Please try again.',
        );
      } else {
        setGlobalError('Network error. Check your connection and try again.');
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <BackButton
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/(auth)/login')
          }
          color="#111827"
        />
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
            <Text style={styles.title}>Activate Account</Text>
            <Text style={styles.subtitle}>
              First-time setup. Enter the credentials and 12-digit token provided by your admin.
            </Text>
          </View>

          <View style={styles.card}>
            <ErrorAlert message={globalError} />

            <FormInput
              control={control}
              name="username"
              label="Username"
              placeholder="e.g. john_doe"
              error={errors.username?.message}
              autoComplete="username"
              textContentType="username"
            />

            <FormInput
              control={control}
              name="password"
              label="Password"
              placeholder="Enter your password"
              error={errors.password?.message}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
            />

            <FormInput
              control={control}
              name="token"
              label="Activation Token (12 digits)"
              placeholder="000000000000"
              error={errors.token?.message}
              keyboardType="number-pad"
              maxLength={12}
              textContentType="oneTimeCode"
            />

            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Activate account"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Activate</Text>
              )}
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.replace('/(auth)/login')}
            style={styles.switchLink}
            accessibilityRole="button"
          >
            <Text style={styles.switchText}>Already activated? Log in</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/assistant-login')}
            style={styles.switchLink}
            accessibilityRole="button"
          >
            <Text style={[styles.switchText, { color: '#f59e0b' }]}>I'm an assistant →</Text>
          </Pressable>

          <Text style={styles.footer}>
            Having trouble? Contact your school administrator.
          </Text>
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
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
  switchLink: { marginTop: 24, alignItems: 'center' },
  switchText: { color: '#1a56db', fontSize: 14, fontWeight: '500' },
  footer: {
    marginTop: 24,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
  },
});
