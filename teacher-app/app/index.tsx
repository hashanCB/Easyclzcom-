// Deterministic app entry. Without this, expo-router falls back to an arbitrary
// default leaf (the token-based Activate screen), so a fresh install opened on
// the wrong screen. Route by auth state instead: login is the universal entry
// for teachers (it handles same-device sign-in and new-device auto-evict, §5.8).
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuthStore } from '../lib/auth/store';
import { useAssistantStore } from '../lib/assistant/store';

export default function Index() {
  const teacherStatus = useAuthStore((s) => s.status);
  const assistantStatus = useAssistantStore((s) => s.status);

  // Stores still hydrating — render nothing (avoids a flash to the wrong screen).
  if (teacherStatus === 'loading' || assistantStatus === 'loading') {
    return <View style={{ flex: 1 }} />;
  }

  if (assistantStatus === 'authenticated') return <Redirect href="/(assistant)" />;
  if (teacherStatus === 'authenticated') return <Redirect href="/(app)" />;
  return <Redirect href="/(auth)/login" />;
}
