import { Stack } from 'expo-router';

// Login is the default entry: it covers same-device sign-in and new-device
// auto-evict (§5.8). The token-based activate screen is only reached for a
// never-activated account (routed from login on a `forbidden` response).
export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="activate" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
