/**
 * PhotoPickerButton — reusable image-pick + R2 upload component.
 *
 * Usage:
 *   <PhotoPickerButton
 *     r2Key={currentKey}          // existing R2 key (or empty string)
 *     onUploaded={(key) => ...}   // called with the new R2 key after upload
 *     accessToken={session.access_token}
 *   />
 *
 * The component handles: DocumentPicker → presigned URL → PUT to R2 → callback.
 * While uploading it shows a progress overlay.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore } from '../lib/theme/store';
import { getUploadUrl, getDownloadUrl, fetchFileBlob, uploadBlobToR2 } from '../lib/r2/index';

interface Props {
  /** Existing R2 storage key. Empty string / undefined = no photo yet. */
  r2Key: string;
  /** Called after a successful upload with the new R2 key. */
  onUploaded: (key: string) => void;
  /** Supabase access token (needed for presigned URL calls). */
  accessToken: string;
  /**
   * Optional function that returns the deterministic R2 key to use for upload.
   * If omitted, falls back to `r2Key` (existing key) or a timestamp-based key.
   */
  r2KeyBuilder?: () => string;
  /** Label shown below the avatar circle. Default: "Upload photo" */
  label?: string;
  /** Size of the circular avatar. Default: 88 */
  size?: number;
}

export function PhotoPickerButton({
  r2Key,
  onUploaded,
  accessToken,
  r2KeyBuilder,
  label = 'Upload photo',
  size = 88,
}: Props) {
  const colors = useThemeStore((s) => s.colors);

  // localUri: just-picked URI shown immediately; signedUrl: loaded from R2 for existing key
  const [localUri,  setLocalUri]  = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const prevKey = useRef('');

  // When r2Key changes (e.g. initial load with existing key) fetch signed URL.
  // A student-provided photo is a data: URL — show it directly, no signing.
  useEffect(() => {
    if (!r2Key || r2Key === prevKey.current) return;
    prevKey.current = r2Key;
    setLocalUri(null);
    if (r2Key.startsWith('data:') || r2Key.startsWith('http')) {
      setSignedUrl(r2Key);
      return;
    }
    if (!accessToken) return;
    getDownloadUrl(r2Key, accessToken)
      .then(setSignedUrl)
      .catch(() => setSignedUrl(null));
  }, [r2Key, accessToken]);

  const displayUri = localUri ?? signedUrl;

  // Tap → ask the teacher to take a live photo or pick from the gallery.
  // (Web has no camera UI, so it goes straight to the gallery.)
  function pick() {
    if (Platform.OS === 'web') {
      void pickFromGallery();
      return;
    }
    Alert.alert('Add photo', 'Take a new photo or choose one from your gallery.', [
      { text: 'Take Photo', onPress: () => void pickFromCamera() },
      { text: 'Choose from Gallery', onPress: () => void pickFromGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    await handleResult(result);
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos permission needed', 'Allow photo access to choose an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    await handleResult(result);
  }

  // Shared upload path for both camera and gallery results.
  async function handleResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const name = asset.fileName ?? 'photo.jpg';

    // Show picked image immediately (optimistic)
    setLocalUri(uri);
    setUploading(true);

    try {
      const blob = await fetchFileBlob(uri);
      const sizeBytes = blob.size;

      // Deterministic path from the caller, else the existing key, else a fallback.
      const targetKey = r2KeyBuilder?.() ?? (r2Key || `uploads/${Date.now()}_${name}`);

      const presignedUrl = await getUploadUrl(targetKey, mimeType, sizeBytes, accessToken);
      await uploadBlobToR2(presignedUrl, blob, mimeType);

      onUploaded(targetKey);
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message ?? 'Unknown error');
      setLocalUri(null); // revert preview
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={pick}
        disabled={uploading}
        style={({ pressed }) => [
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Pick photo"
      >
        {uploading ? (
          <ActivityIndicator color={colors.primary} />
        ) : displayUri ? (
          <Image
            source={{ uri: displayUri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="camera-outline" size={size * 0.35} color={colors.textMuted} />
        )}

        {/* Edit badge */}
        {!uploading && (
          <View style={[styles.badge, { backgroundColor: colors.primary, bottom: 0, right: 0 }]}>
            <Ionicons name="pencil" size={10} color="#fff" />
          </View>
        )}
      </Pressable>

      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 8 },
  circle: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  label: { fontSize: 12, fontWeight: '500' },
});
