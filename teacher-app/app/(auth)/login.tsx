import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { ErrorAlert } from '../../components/ui/ErrorAlert';
import { FormInput } from '../../components/ui/FormInput';
import {
  loginTeacher,
  ApiError,
  isDeviceSwitchRequired,
  type AuthResult,
  type BoundDeviceInfo,
} from '../../lib/api/auth';
import { useAuthStore } from '../../lib/auth/store';
import { useShallow } from 'zustand/react/shallow';
import { getDeviceId, getDeviceInfo } from '../../lib/device';
import { localIsEmpty, cloudHasData } from '../../lib/restore';
import { logger } from '../../lib/logger';

function describeDevice(d: BoundDeviceInfo): string {
  const info = d.device_info ?? {};
  const model = info.model ?? info.deviceName ?? info.brand;
  const parts: string[] = [];
  if (model) parts.push(model);
  if (d.last_seen_at) {
    const when = new Date(d.last_seen_at);
    if (!Number.isNaN(when.getTime())) {
      const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
      parts.push(days <= 0 ? 'last used today' : days === 1 ? 'last used yesterday' : `last used ${days} days ago`);
    }
  }
  return parts.length ? parts.join(', ') : 'another phone';
}

const schema = z.object({
  username: z.string().min(3, 'Enter your username'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

const ERROR_MESSAGES: Record<string, string> = {
  wrong_credentials: 'Incorrect username or password.',
  inactive_teacher: 'Your account has been deactivated. Contact your admin.',
  duplicate_token:
    'This account is bound to a different device. Contact your admin to re-activate.',
  forbidden:
    'This device is not authorised. Please activate your account first or contact your admin.',
};

export default function LoginScreen() {
  const router = useRouter();
  const { setAuth, teacher } = useAuthStore(useShallow((s) => ({
    setAuth: s.setAuth,
    teacher: s.teacher,
  })));
  const [globalError, setGlobalError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: teacher?.username ?? '', password: '' },
  });

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

  async function onSubmit(values: FormValues) {
    setGlobalError(null);
    try {
      const device_id = await getDeviceId();
      const device_info = getDeviceInfo();
      const username = values.username.toLowerCase().trim();

      const result = await loginTeacher({ username, password: values.password, device_id, device_info });

      if (isDeviceSwitchRequired(result)) {
        Alert.alert(
          'Switch to this phone?',
          `Your account is currently signed in on ${describeDevice(result.current_device)}. ` +
            'Continuing will sign that phone out and use this one instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Use this phone',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  setGlobalError(null);
                  try {
                    const confirmed = await loginTeacher({
                      username,
                      password: values.password,
                      device_id,
                      device_info,
                      confirm_switch: true,
                    });
                    if (isDeviceSwitchRequired(confirmed)) {
                      setGlobalError('Could not switch device. Please try again.');
                      return;
                    }
                    await completeLogin(confirmed);
                  } catch (e) {
                    setGlobalError(
                      e instanceof ApiError ? e.message : 'Could not switch device. Please try again.',
                    );
                  }
                })();
              },
            },
          ],
        );
        return;
      }

      await completeLogin(result);
    } catch (err) {
      logger.error('[login] error:', err);
      if (err instanceof ApiError) {
        if (err.code === 'forbidden') {
          router.replace({
            pathname: '/(auth)/activate',
            params: { username: values.username.toLowerCase().trim() },
          });
          return;
        }
        setGlobalError(
          ERROR_MESSAGES[err.code] ?? err.message ?? 'Login failed. Please try again.',
        );
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        setGlobalError(`Network error: ${detail}`);
      }
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
              <View style={styles.logoGlow}>
                <View style={styles.logoInner}>
                  <Ionicons name="school" size={28} color="#22c55e" />
                </View>
              </View>
              <Text style={styles.brand}>Easyclz</Text>
              <Text style={styles.title}>Welcome back</Text>
              {teacher?.username ? (
                <Text style={styles.subtitle}>
                  Signing in as{' '}
                  <Text style={styles.usernameHighlight}>{teacher.username}</Text>
                </Text>
              ) : (
                <Text style={styles.subtitle}>Sign in to manage your classes</Text>
              )}
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
                autoComplete="current-password"
                textContentType="password"
              />

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleSubmit(onSubmit)}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                <LinearGradient
                  colors={['#22c55e', '#16a34a']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#020617" />
                  ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                style={({ pressed }) => [
                  styles.forgotLink,
                  pressed && { opacity: 0.7 },
                ]}
                hitSlop={8}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>New to Easyclz?</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={() => router.push('/(auth)/register')}
              style={({ pressed }) => [
                styles.createBtn,
                pressed && styles.createBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create a teacher account"
            >
              <Ionicons name="person-add-outline" size={18} color="#22c55e" />
              <Text style={styles.createBtnText}>Create Teacher Account</Text>
            </Pressable>
            <Text style={styles.trialHint}>Free 14-day trial · no card needed</Text>

            <Pressable
              onPress={() => router.push('/(auth)/assistant-login')}
              style={({ pressed }) => [
                styles.assistantLink,
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={8}
            >
              <Text style={styles.assistantText}>I'm an assistant →</Text>
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
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: { marginBottom: 32, alignItems: 'center' },
  logoGlow: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoInner: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  brand: {
    fontSize: 15,
    fontWeight: '800',
    color: '#22c55e',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
  },
  usernameHighlight: {
    color: '#22c55e',
    fontWeight: '600',
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
    marginTop: 4,
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
  forgotLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dividerText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.06)',
  },
  createBtnPressed: {
    opacity: 0.8,
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  createBtnText: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
  },
  trialHint: {
    textAlign: 'center',
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 10,
  },

  assistantLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  assistantText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
});
