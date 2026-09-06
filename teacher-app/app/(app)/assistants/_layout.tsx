import { Stack } from 'expo-router';
import { useIsPro } from '../../../lib/subscription/store';
import { ProBlockScreen } from '../../../components/ProBlockScreen';

export default function AssistantsLayout() {
  const pro = useIsPro();
  if (!pro) {
    return <ProBlockScreen feature="Assistants" description="Assistants lets you add helpers and give them class permissions." />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
