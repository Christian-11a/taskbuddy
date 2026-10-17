import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import PhotoViewer from './PhotoViewer';
import Tap from './ui/Tap';

/** A row of small photo thumbnails; tapping one opens it full screen. */
export default function PhotoStrip({
  urls, label, size = 56, testID,
}: { urls: string[]; label: string; size?: number; testID?: string }) {
  const { s } = useThemedStyles(createStyles);
  const [open, setOpen] = useState<number | null>(null);
  if (!urls.length) return null;
  return (
    <View style={s.row} testID={testID}>
      {urls.map((uri, index) => (
        <Tap
          key={`${uri}-${index}`}
          onPress={() => setOpen(index)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${label} ${index + 1} of ${urls.length}`}
        >
          <Image source={{ uri }} style={[s.thumb, { width: size, height: size }]} />
        </Tap>
      ))}
      <PhotoViewer
        photos={urls.map((uri) => ({ uri }))}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

const createStyles = ({ V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    thumb: { borderRadius: 10, backgroundColor: V6Colors.ink100 },
  }),
});
