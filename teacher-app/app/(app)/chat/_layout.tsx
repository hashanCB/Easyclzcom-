import { Stack } from 'expo-router';
import { useIsPro } from '../../../lib/subscription/store';
import { ProBlockScreen } from '../../../components/ProBlockScreen';

export default function ChatLayout() {
  const pro = useIsPro();
  if (!pro) {
    return <ProBlockScreen feature="Chat" description="Chat lets you message students and broadcast to groups." />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
