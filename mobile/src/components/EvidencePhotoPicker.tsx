import React, { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import { requestAppPermission } from '../lib/permissions';
import Tap from './ui/Tap';

/** Largest photo the evidence buckets accept (migration 0059). */
export const EVIDENCE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type EvidencePhotoPickerProps = {
  /** Device URIs picked so far; uploaded by the screen when it submits. */
  photos: string[];
  onChange: (photos: string[]) => void;
  max: number;
  label: string;
  helper?: string;
  disabled?: boolean;
  testID?: string;
};

/**
 * Takes or picks up to `max` photos, shows them as thumbnails with a remove
 * button each. Uploading is the caller's job, on submit, so nothing is stored
 * for a form that is abandoned.
 */
export default function EvidencePhotoPicker({
  photos, onChange, max, label, helper, disabled = false, testID,
}: EvidencePhotoPickerProps) {
  const { s, c } = useThemedStyles(createStyles);
  const [error, setError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const full = photos.length >= max;

  const acceptAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const tooBig = assets.some((a) => a.fileSize && a.fileSize > EVIDENCE_PHOTO_MAX_BYTES);
    if (tooBig) setError('Each photo must be 10 MB or smaller.');
    const fresh = assets
      .filter((a) => !a.fileSize || a.fileSize <= EVIDENCE_PHOTO_MAX_BYTES)
      .map((a) => a.uri);
    onChange([...photos, ...fresh].slice(0, max));
  };

  const takePhoto = async () => {
    setError(null);
    setCameraDenied(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCameraDenied(true);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled) return;
      acceptAssets(result.assets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the camera.');
    }
  };

  const pickFromGallery = async () => {
    setError(null);
    setCameraDenied(false);
    try {
      if (!(await requestAppPermission('gallery'))) {
        setError('Photo library access is required to add a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        // iOS: ask for the compatible (JPEG) copy so HEIC library photos arrive as JPEG.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        allowsMultipleSelection: true,
        selectionLimit: max - photos.length,
      });
      if (result.canceled) return;
      acceptAssets(result.assets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your photos.');
    }
  };

  const openSettings = () => {
    Linking.openSettings().catch(() => setError('Could not open Settings.'));
  };

  return (
    <View style={s.wrap} testID={testID}>
      <Text style={s.label}>{label}</Text>
      {!!helper && <Text style={s.helper}>{helper}</Text>}
      <View style={s.row}>
        {photos.map((uri, index) => (
          <View key={`${uri}-${index}`} style={s.thumbWrap}>
            <Image source={{ uri }} style={s.thumb} accessibilityLabel={`Photo ${index + 1}`} />
            <Tap
              style={s.remove}
              disabled={disabled}
              onPress={() => onChange(photos.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
              hitSlop={6}
            >
              <X size={12} color={c.onDark} strokeWidth={3} />
            </Tap>
          </View>
        ))}
      </View>
      {!full && (
        <View style={s.actions}>
          <Tap
            style={s.action}
            disabled={disabled}
            onPress={() => void takePhoto()}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled }}
          >
            <Camera size={18} color={c.link} />
            <Text style={s.actionText}>Take photo</Text>
          </Tap>
          <Tap
            style={s.action}
            disabled={disabled}
            onPress={() => void pickFromGallery()}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
            accessibilityState={{ disabled }}
          >
            <ImagePlus size={18} color={c.link} />
            <Text style={s.actionText}>Choose from gallery</Text>
          </Tap>
        </View>
      )}
      <Text style={s.count}>{`${photos.length} / ${max}`}</Text>
      {cameraDenied && (
        <View style={s.permission} accessibilityLiveRegion="polite">
          <Text style={s.error}>Camera access is off.</Text>
          <Tap onPress={openSettings} accessibilityRole="link" accessibilityLabel="Open settings" hitSlop={8}>
            <Text style={s.link}>Open settings</Text>
          </Tap>
        </View>
      )}
      {!!error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    wrap: { gap: 6 },
    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
    helper: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    thumbWrap: { width: 72, height: 72 },
    thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: V6Colors.ink100 },
    remove: {
      position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
      backgroundColor: V6Colors.ink900, alignItems: 'center', justifyContent: 'center',
    },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    action: {
      minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
      borderColor: V6Colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    },
    actionText: { color: Colors.link, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
    count: { color: V6Colors.ink500, fontSize: 12, fontFamily: 'Inter' },
    permission: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    link: { color: Colors.link, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', textDecorationLine: 'underline' },
    error: { color: Colors.dangerText, fontSize: 13, fontFamily: 'Inter' },
  }),
  c: { link: Colors.link, onDark: V6Colors.surface },
});
