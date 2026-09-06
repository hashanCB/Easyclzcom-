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
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { useScreenTitle } from '../../lib/ui/header';
import { changePassword, ApiError } from '../../lib/api/auth';

export default function ChangePasswordScreen() {
  useScreenTitle('Change Password');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const session = useAuthStore((s) => s.session);

  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext,    setShowNext]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const styles = buildStyles(colors);

  async function handleSubmit() {
    setError(null);
    if (!current.trim())  { setError('Enter your current password.');           return; }
    if (next.length < 6)  { setError('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { setError('New passwords do not match.');             return; }

    if (!session?.access_token) {
      setError('Session expired. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(
        { current_password: current, new_password: next, confirm_password: confirm },
        session.access_token,
      );
      Alert.alert('Password changed', 'Your password has been updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'wrong_credentials') {
          setError('Current password is incorrect.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.description, { color: colors.textMuted }]}>
          Enter your current password, then choose a new one.
        </Text>

        {/* Fields */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          <PasswordField
            label="Current Password"
            value={current}
            onChangeText={setCurrent}
            show={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)}
            colors={colors}
            returnKeyType="next"
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <PasswordField
            label="New Password"
            value={next}
            onChangeText={setNext}
            show={showNext}
            onToggle={() => setShowNext((v) => !v)}
            colors={colors}
            returnKeyType="next"
            placeholder="Min. 6 characters"
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <PasswordField
            label="Confirm New Password"
            value={confirm}
            onChangeText={setConfirm}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            colors={colors}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { borderColor: colors.danger + '40', backgroundColor: colors.danger + '12' }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: colors.primary, opacity: loading || pressed ? 0.75 : 1 },
          ]}
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.submitText}>Update Password</Text>
          }
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggle,
  colors,
  returnKeyType,
  placeholder = '••••••••',
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  returnKeyType: 'next' | 'done';
  placeholder?: string;
  onSubmitEditing?: () => void;
}) {
  const styles = buildStyles(colors);
  return (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.fieldInputRow}>
        <TextInput
          style={[styles.fieldInput, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        <Pressable onPress={onToggle} hitSlop={8} style={styles.eyeBtn}>
          <Ionicons
            name={show ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    header: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    headerRight: { width: 44 },

    scroll: { padding: 16, paddingBottom: 48 },

    description: {
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 20,
    },

    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 16,
    },
    fieldRow: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 64,
      justifyContent: 'center',
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    fieldInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    fieldInput: {
      flex: 1,
      fontSize: 15,
      paddingVertical: 0,
    },
    eyeBtn: {
      paddingLeft: 8,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 14,
    },

    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },

    submitBtn: {
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
