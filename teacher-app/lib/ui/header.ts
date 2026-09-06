import { useCallback } from 'react';
import { create } from 'zustand';
import { useFocusEffect } from 'expo-router';

// Drives the title shown in the shared TopNavbar. Each screen sets its own
// title on focus via useScreenTitle(); the home screen leaves it null so the
// navbar falls back to the teacher's username.
interface HeaderState {
  title: string | null;
  setTitle: (title: string | null) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  title: null,
  setTitle: (title) => set({ title }),
}));

/**
 * Sets the TopNavbar title while this screen is focused. Pass the screen name
 * (e.g. "Reports") or dynamic data (e.g. a student's name). Re-runs whenever
 * `title` changes so async-loaded names update the navbar.
 */
export function useScreenTitle(title: string) {
  const setTitle = useHeaderStore((s) => s.setTitle);
  useFocusEffect(
    useCallback(() => {
      setTitle(title);
    }, [title, setTitle]),
  );
}
