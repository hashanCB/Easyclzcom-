import React from 'react';
import { Appearance, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { logEvent } from '../lib/analytics';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-wide error boundary. Catches render-time crashes in any screen so a single
 * thrown error never white-screens the whole app — the teacher sees a recover
 * card instead. Deliberately self-contained: it must NOT depend on the theme
 * store or any app hook, because the thing that crashed might be exactly that.
 * Colours are read once from the OS appearance so the fallback looks right in
 * both light and dark mode.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Best-effort crash telemetry — never let logging throw inside the boundary.
    try {
      logEvent('app.crash', {
        message: String(error?.message ?? error).slice(0, 300),
        component_stack: (info?.componentStack ?? '').slice(0, 500),
      });
    } catch {
      /* ignore */
    }
    // Keep a console trace for dev / device logs.
    console.error('Unhandled UI error:', error);
  }

  private handleReload = () => {
    // Clear the error, then return to a known-good route. Resetting state alone
    // would just re-render the same broken screen; navigating home recovers.
    this.setState({ error: null });
    try {
      router.replace('/');
    } catch {
      /* router may be unavailable very early — state reset still re-renders */
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    const dark = Appearance.getColorScheme() === 'dark';
    const c = dark
      ? { bg: '#0b1120', card: '#1e293b', text: '#f8fafc', sub: '#94a3b8', border: 'rgba(255,255,255,0.08)' }
      : { bg: '#f3f4f6', card: '#ffffff', text: '#111827', sub: '#6b7280', border: '#e5e7eb' };

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.iconWrap}>
              <Ionicons name="alert-circle-outline" size={44} color="#ef4444" />
            </View>
            <Text style={[styles.title, { color: c.text }]}>Something went wrong</Text>
            <Text style={[styles.subtitle, { color: c.sub }]}>
              The app hit an unexpected error. Your data is safe — tap below to reload and continue.
            </Text>

            {__DEV__ && this.state.error?.message ? (
              <Text style={[styles.detail, { color: c.sub, borderColor: c.border }]} numberOfLines={6}>
                {this.state.error.message}
              </Text>
            ) : null}

            <Pressable
              onPress={this.handleReload}
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Reload the app"
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.buttonText}>Reload</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
  },
  iconWrap: { marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  detail: {
    fontSize: 12,
    fontFamily: 'monospace',
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 28,
    alignSelf: 'stretch',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
