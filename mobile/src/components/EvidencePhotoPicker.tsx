import React, { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, Plus, X } from 'lucide-react-native';
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
  /** Fewest photos the form needs; only used for the default helper line. */
  min?: number;
  label?: string;
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
  photos, onChange, max, min, label, helper, disabled = false, testID,
}: EvidencePhotoPickerProps) {
  const { s, c } = useThemedStyles(createStyles);
  const [error, setError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const full = photos.length >= max;
  const helperText = helper ?? (min ? `Add ${min} to ${max} photos` : `Add up to ${max} photos`);

  const acceptAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const tooBig = assets.some((a) => a.fileSize && a.fileSize > EVIDENCE_PHOTO_MAX_BYTES);
    if (tooBig) setError('Each photo must be 10 MB or smaller.');
    const fresh = assets
      .filter((a) => !a.fileSize || a.fileSize <= EVIDENCE_PHOTO_MAX_BYTES)
      .map((a) => a.uri);
    onChange([...photos, ...fresh].slice(0, max));
  };

  const takePhoto = async () => {
    setMenuOpen(false);
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
    setMenuOpen(false);
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
      {!!label && <Text style={s.label}>{label}</Text>}
      <View style={s.row}>
        {Array.from({ length: max }, (_, index) => {
          const uri = photos[index];
          if (uri) {
            return (
              <View key={`${uri}-${index}`} style={s.slot}>
                <Image source={{ uri }} style={s.thumb} accessibilityLabel={`Photo ${index + 1}`} />
                <Tap
                  style={s.remove}
                  disabled={disabled}
                  onPress={() => onChange(photos.filter((_, i) => i !== index))}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${index + 1}, remove`}
                  hitSlop={6}
                >
                  <X size={12} color={c.onDark} strokeWidth={3} />
                </Tap>
              </View>
            );
          }
          if (index === photos.length) {
            return (
              <Tap
                key={`add-${index}`}
                style={[s.slot, s.addTile, menuOpen && s.addTileOpen]}
                disabled={disabled}
                onPress={() => setMenuOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel="Add photo"
                accessibilityState={{ disabled, expanded: menuOpen }}
              >
                <Plus size={24} color={c.link} strokeWidth={2.5} />
              </Tap>
            );
          }
          return <View key={`empty-${index}`} style={[s.slot, s.placeholder]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
        })}
      </View>
      {menuOpen && !full && (
        <View style={s.menu}>
          <Tap
            style={s.menuItem}
            disabled={disabled}
            onPress={() => void takePhoto()}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
          >
            <Camera size={18} color={c.link} />
            <Text style={s.menuText}>Take photo</Text>
          </Tap>
          <Tap
            style={s.menuItem}
            disabled={disabled}
            onPress={() => void pickFromGallery()}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
          >
            <ImagePlus size={18} color={c.link} />
            <Text style={s.menuText}>Choose from gallery</Text>
          </Tap>
        </View>
      )}
      <View style={s.footer}>
        <Text style={s.helper}>{helperText}</Text>
        <Text style={s.count}>{`${photos.length} / ${max}`}</Text>
      </View>
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
    helper: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter', flex: 1 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    slot: { width: 68, height: 68, borderRadius: 14 },
    thumb: { width: 68, height: 68, borderRadius: 14, backgroundColor: V6Colors.ink100 },
    remove: {
      position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
      backgroundColor: V6Colors.ink900, alignItems: 'center', justifyContent: 'center',
    },
    addTile: {
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.link,
      alignItems: 'center', justifyContent: 'center',
    },
    addTileOpen: { backgroundColor: V6Colors.ink100 },
    placeholder: { backgroundColor: V6Colors.ink100, opacity: 0.5 },
    menu: { borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line, overflow: 'hidden' },
    menuItem: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuText: { color: V6Colors.ink900, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    count: { color: V6Colors.ink500, fontSize: 12, fontFamily: 'Inter' },
    permission: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    link: { color: Colors.link, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', textDecorationLine: 'underline' },
    error: { color: Colors.dangerText, fontSize: 13, fontFamily: 'Inter' },
  }),
  c: { link: Colors.link, onDark: V6Colors.surface },
});
