import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { loginAssistant } from '../../lib/api/assistantAuth';
import { logAudit } from '../../lib/api/audit';
import { useAssistantStore } from '../../lib/assistant/store';

export default function AssistantLoginScreen() {
  const router = useRouter();
  const setAuth = useAssistantStore((s) => s.setAuth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  async function handleLogin() {
    if (!username.trim()) return setError('Enter your username.');
    if (password.length !== 8) return setError('Password is 8 digits.');
    setError(null);
    setLoading(true);
    try {
      const { session, profile, permissions } = await loginAssistant(username.trim(), password);
      await setAuth(session, profile, permissions);
      // SRS §24.4: audit assistant login (best-effort).
      void logAudit(
        { action: 'assistant.login', entityType: 'assistant', entityId: profile.id },
        session.access_token,
      );
      router.replace('/(assistant)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Back */}
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#6b7280" />
            <Text style={styles.backText}>Teacher login</Text>
          </Pressable>

          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Ionicons name="people-circle-outline" size={40} color="#f59e0b" />
            </View>
            <Text style={styles.title}>Assistant Login</Text>
            <Text style={styles.subtitle}>Enter the credentials your teacher gave you.</Text>
          </View>

          <View style={styles.card}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.label}>USERNAME</Text>
            <TextInput
              style={styles.input}
              placeholder="asst_teacher_1"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={[styles.label, { marginTop: 16 }]}>8-DIGIT PASSWORD</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={[styles.input, styles.pwInput]}
                placeholder="12345678"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={(t) => setPassword(t.replace(/\D/g, '').slice(0, 8))}
                keyboardType="number-pad"
                secureTextEntry={!showPw}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Sign In as Assistant</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f4f6' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  backText: { fontSize: 14, color: '#6b7280', marginLeft: 2 },

  header: { alignItems: 'center', marginBottom: 32 },
  iconBox: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: '#dc2626' },

  label: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.6, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827',
    backgroundColor: '#f9fafb',
  },
  pwRow: { flexDirection: 'row', alignItems: 'center' },
  pwInput: { flex: 1, letterSpacing: 4 },
  eyeBtn: { position: 'absolute', right: 14 },

  btn: {
    backgroundColor: '#f59e0b', borderRadius: 10, height: 50,
    alignItems: 'center', justifyContent: 'center', marginTop: 20,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
