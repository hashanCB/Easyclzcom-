import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface BackButtonProps {
  /** Custom handler. Defaults to popping the stack, or going to `fallback`. */
  onPress?: () => void;
  /** Icon + label colour. */
  color?: string;
  /** Optional text shown next to the arrow (e.g. "Teacher login"). */
  label?: string;
  /** Where to go when there is nothing to pop (deep-linked / first screen). */
  fallback?: string;
  style?: ViewStyle;
}

/**
 * One reusable back control used across every screen so the position and
 * behaviour stay identical. Falls back to a safe route when the navigation
 * stack is empty instead of doing nothing.
 */
export function BackButton({
  onPress,
  color = '#111827',
  label,
  fallback = '/(app)',
  style,
}: BackButtonProps) {
  const router = useRouter();

  function handlePress() {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback as never);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={10}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, style]}
    >
      <Ionicons name="chevron-back" size={24} color={color} />
      {label ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  label: { fontSize: 14, marginLeft: 2, fontWeight: '500' },
});
