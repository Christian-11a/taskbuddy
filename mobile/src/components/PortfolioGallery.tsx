import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Tap from './ui/Tap';
import type { PortfolioEntry } from '../lib/api';
import PhotoViewer from './PhotoViewer';
import { useTheme } from '../context/ThemeContext';
export default function PortfolioGallery({
  entries,
  onEdit,
  onRemove,
  busy = false,
}: {
  entries: PortfolioEntry[];
  onEdit?: (entry: PortfolioEntry) => void;
  onRemove?: (entry: PortfolioEntry) => void;
  busy?: boolean;
}) {
  const { palette: { V6Colors: C } } = useTheme();
  const [viewing, setViewing] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    setViewing(null);
    setFailed([]);
  }, [entries]);
  return (
    <View>
      {entries.length === 0 && (
        <Text style={{ color: C.ink500, fontSize: 13.5, lineHeight: 20, fontFamily: 'Inter' }}>
          No portfolio photos yet.
        </Text>
      )}
      {entries.map((entry, index) => (
        <View key={entry.id} style={{ marginVertical: 10 }}>
          <Tap
            accessibilityLabel={`View portfolio photo: ${entry.caption}`}
            onPress={() => setViewing(index)}
          >
            <Image
              source={{ uri: entry.image_url }}
              style={{ width: '100%', height: 180, borderRadius: 12 }}
              resizeMode="cover"
              onError={() => setFailed((previous) => [...previous, entry.id])}
            />
          </Tap>
          {failed.includes(entry.id) && (
            <Text style={{ color: C.ink500 }}>
              Photo preview unavailable. Tap to open the full photo.
            </Text>
          )}
          <Text style={{ color: C.ink900, marginTop: 8 }}>{entry.caption}</Text>
          {!!entry.service_categories && (
            <Text style={{ color: C.ink500 }}>
              {entry.service_categories.name}
            </Text>
          )}
          {onEdit && (
            <Tap disabled={busy} onPress={() => onEdit(entry)}>
              <Text style={{ color: C.link, padding: 8 }}>
                Edit photo details
              </Text>
            </Tap>
          )}
          {onRemove && (
            <Tap disabled={busy} onPress={() => onRemove(entry)}>
              <Text style={{ color: C.ink700, padding: 8 }}>Remove photo</Text>
            </Tap>
          )}
        </View>
      ))}
      <PhotoViewer
        photos={entries.map((entry) => ({
          uri: entry.image_url,
          caption: entry.caption,
        }))}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />
    </View>
  );
}
