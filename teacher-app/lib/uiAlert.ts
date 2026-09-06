import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert. On native uses RN Alert; on web falls back to
 * window.alert/confirm so error feedback isn't silently swallowed by Metro.
 */
export function uiAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
