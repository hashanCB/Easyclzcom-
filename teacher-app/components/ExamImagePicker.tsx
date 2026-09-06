// Compact image field for exam questions/options. Take or pick a photo, crop it
// with the phone's editor, upload to R2, and show a thumbnail. Tap × to remove.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore } from '../lib/theme/store';
import { getUploadUrl, getDownloadUrl, fetchFileBlob, uploadBlobToR2 } from '../lib/r2/index';

interface Props {
  r2Key: string | null;
  onUploaded: (key: string) => void;
  onRemove: () => void;
  accessToken: string;
  r2KeyBuilder: () => string;
  label?: string;
  height?: number;
}

export function ExamImagePicker({ r2Key, onUploaded, onRemove, accessToken, r2KeyBuilder, label = 'Add image', height = 120 }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const prevKey = useRef('');

  useEffect(() => {
    if (!r2Key) { setSignedUrl(null); prevKey.current = ''; return; }
    if (r2Key === prevKey.current) return;
    prevKey.current = r2Key;
    setLocalUri(null);
    if (!accessToken) return;
    getDownloadUrl(r2Key, accessToken).then(setSignedUrl).catch(() => setSignedUrl(null));
  }, [r2Key, accessToken]);

  const displayUri = localUri ?? signedUrl;

  function pick() {
    if (Platform.OS === 'web') { void fromGallery(); return; }
    Alert.alert('Add image', 'Take a photo or choose from your gallery. You can crop it next.', [
      { text: 'Take Photo', onPress: () => void fromCamera() },
      { text: 'Choose from Gallery', onPress: () => void fromGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function fromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed', 'Allow camera access.'); return; }
    await handle(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 }));
  }
  async function fromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Photos permission needed', 'Allow photo access.'); return; }
    await handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 }));
  }

  async function handle(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setLocalUri(asset.uri);
    setUploading(true);
    try {
      const blob = await fetchFileBlob(asset.uri);
      const key = r2KeyBuilder();
      const presigned = await getUploadUrl(key, asset.mimeType ?? 'image/jpeg', blob.size, accessToken);
      await uploadBlobToR2(presigned, blob, asset.mimeType ?? 'image/jpeg');
      onUploaded(key);
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message ?? 'Unknown error');
      setLocalUri(null);
    } finally {
      setUploading(false);
    }
  }

  if (displayUri) {
    return (
      <View style={[styles.thumbWrap, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, height }]}>
        <Image source={{ uri: displayUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {uploading ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay]}><ActivityIndicator color="#fff" /></View>
        ) : (
          <View style={styles.actionRow}>
            <Pressable onPress={pick} style={styles.miniBtn}><Ionicons name="pencil" size={13} color="#fff" /></Pressable>
            <Pressable onPress={() => { setLocalUri(null); setSignedUrl(null); prevKey.current = ''; onRemove(); }} style={[styles.miniBtn, { backgroundColor: '#dc2626cc' }]}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <Pressable onPress={pick} disabled={uploading} style={({ pressed }) => [styles.addBox, { borderColor: colors.border, backgroundColor: colors.surface, height, opacity: pressed ? 0.7 : 1 }]}>
      {uploading ? <ActivityIndicator color={colors.primary} /> : (
        <>
          <Ionicons name="image-outline" size={20} color={colors.textMuted} />
          <Text style={[styles.addText, { color: colors.textMuted }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addBox: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  addText: { fontSize: 12.5, fontWeight: '600' },
  thumbWrap: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  overlay: { backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  actionRow: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 6 },
  miniBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});
