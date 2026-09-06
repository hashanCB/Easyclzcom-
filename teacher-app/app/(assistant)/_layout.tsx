import { Stack } from 'expo-router';
import { useAssistantAutoSync } from '../../lib/assistant/sync';

export default function AssistantLayout() {
  // Keep queued attendance/payments uploading automatically on every assistant
  // screen, not just while scanning.
  useAssistantAutoSync();
  return <Stack screenOptions={{ headerShown: false }} />;
}
