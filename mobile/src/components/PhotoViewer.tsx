import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from './ui/Tap';
export default function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: { uri: string; caption?: string }[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const photo = index === null ? null : photos[index];
  useEffect(() => setFailed(false), [index, photo?.uri]);
  return (
    <Modal
      visible={index !== null}
      onRequestClose={onClose}
      animationType="fade"
    >
      {index !== null && <StatusBar style="light" />}
      <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Tap onPress={onClose} accessibilityLabel="Close photo">
          <Text style={styles.action}>Close</Text>
        </Tap>
        {photo &&
          (failed ? (
            <View style={styles.center}>
              <Text style={styles.text}>Could not load this photo.</Text>
              <Tap onPress={() => setFailed(false)}>
                <Text style={styles.action}>Retry photo</Text>
              </Tap>
            </View>
          ) : (
            <Image
              testID="full-photo"
              source={{ uri: photo.uri }}
              resizeMode="contain"
              style={styles.image}
              onError={() => setFailed(true)}
            />
          ))}
        {!!photo?.caption && <Text style={styles.text}>{photo.caption}</Text>}
        {index !== null && (
          <View style={styles.controls}>
            <Tap
              disabled={index === 0}
              onPress={() => onIndexChange(index - 1)}
            >
              <Text style={[styles.action, index === 0 && styles.disabled]}>
                Previous photo
              </Text>
            </Tap>
            <Text style={styles.text}>
              {index + 1} / {photos.length}
            </Text>
            <Tap
              disabled={index === photos.length - 1}
              onPress={() => onIndexChange(index + 1)}
            >
              <Text
                style={[
                  styles.action,
                  index === photos.length - 1 && styles.disabled,
                ]}
              >
                Next photo
              </Text>
            </Tap>
          </View>
        )}
      </View>
    </Modal>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#111827', padding: 20, paddingTop: 48 },
    image: { flex: 1, width: '100%' },
    text: { color: V6Colors.onPrimary, textAlign: 'center', marginVertical: 12 },
    action: { color: '#67e8f9', padding: 12, fontWeight: '700' },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    },
    disabled: { opacity: 0.35 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
  return { Colors, V6Colors, styles };
}
