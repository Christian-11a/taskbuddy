import React, { useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type MapPreviewProps = {
  /** The static-map image for the confirmed address (api.staticMapSource). */
  source: ImageSourcePropType;
  /**
   * The image did not load. This component never hides itself: the owner
   * decides whether the card goes.
   */
  onError: () => void;
};

/**
 * The map under a confirmed address. The card has the same 2:1 shape as the
 * server's 600x300 image, so a placeholder of the same size holds the space
 * while the image loads and nothing jumps when it arrives. At that ratio `cover`
 * never crops, which keeps the map provider's attribution line in its corner.
 */
export default function MapPreview({ source, onError }: MapPreviewProps) {
  const { s } = useThemedStyles(createStyles);
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={s.card}>
      {!loaded && <View testID="map-preview-loading" style={s.placeholder} />}
      <Image
        source={source}
        style={s.image}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={onError}
        accessibilityLabel="Map of the confirmed job location"
      />
    </View>
  );
}

const createStyles = ({ V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      aspectRatio: 2, marginTop: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1,
      borderColor: V6Colors.line, backgroundColor: V6Colors.ink50,
    },
    placeholder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: V6Colors.ink100 },
    image: { width: '100%', height: '100%' },
  }),
});
