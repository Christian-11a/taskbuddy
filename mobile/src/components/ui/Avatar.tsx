import React from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import Silhouette from './Silhouette';

/**
 * Someone else's photo inside an avatar circle: the provider on a proposal, the
 * other person in a chat. Without a photo, or when it fails to load, it shows
 * `fallback` (the person silhouette by default). The parent circle sets the size
 * and must set `overflow: 'hidden'`. The signed-in user's own photo is OwnAvatar.
 */
export default function Avatar({
  uri, name, textStyle, fallback,
}: {
  uri?: string | null;
  name?: string | null;
  textStyle?: StyleProp<TextStyle>;
  fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
  }, [uri]);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        transition={150}
        accessibilityLabel={name ? `${name}'s photo` : 'Photo'}
        onError={() => setFailed(true)}
      />
    );
  }
  return <>{fallback ?? <Silhouette name={name} textStyle={textStyle} />}</>;
}

const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });
