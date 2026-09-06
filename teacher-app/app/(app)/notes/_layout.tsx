import { Stack } from 'expo-router';
import { useIsPro } from '../../../lib/subscription/store';
import { ProBlockScreen } from '../../../components/ProBlockScreen';

export default function NotesLayout() {
  const pro = useIsPro();
  if (!pro) {
    return <ProBlockScreen feature="Notes" description="Notes lets you share PDFs, topic notes and links with students." />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
