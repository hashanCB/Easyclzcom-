import * as Application from 'expo-application';
import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';
import { SECURE_STORE } from './constants';
import { storage } from './storage';

// Returns a stable per-install device ID.
// iOS: IDFV (stable per vendor, resets on full uninstall)
// Android: androidId (stable per install)
// Fallback: random hex generated once and stored in SecureStore
export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'ios') {
    const idfv = await Application.getIosIdForVendorAsync();
    if (idfv) return idfv;
  }

  if (Platform.OS === 'android') {
    // Expo SDK 54 replaced the `Application.androidId` property with the
    // synchronous `getAndroidId()` function (returns ANDROID_ID, stable per
    // install). It can be an empty string on some devices/emulators — fall
    // through to the persisted random ID in that case.
    const androidId = Application.getAndroidId();
    if (androidId) return androidId;
  }

  // Fallback: generate once and persist (cross-platform)
  const stored = await storage.getItem(SECURE_STORE.DEVICE_ID);
  if (stored) return stored;

  const generated = generateHex(32);
  await storage.setItem(SECURE_STORE.DEVICE_ID, generated);
  return generated;
}

export function getDeviceInfo(): Record<string, string> {
  return {
    platform: Platform.OS,
    version: String(Platform.Version),
    app_version: Application.nativeApplicationVersion ?? 'unknown',
    build: Application.nativeBuildVersion ?? 'unknown',
  };
}

function generateHex(length: number): string {
  const bytes = ExpoCrypto.getRandomValues(new Uint8Array(length / 2));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
