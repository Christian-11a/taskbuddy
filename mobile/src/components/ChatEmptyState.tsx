import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React from 'react';
import { MessageCircle } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

export default function ChatEmptyState() {
  const { V6Colors, styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.container}>
      <View style={styles.icon}><MessageCircle size={26} color={V6Colors.link} /></View>
      <Text style={styles.title}>No messages yet</Text>
      <Text style={styles.body}>Send a message to start the conversation.</Text>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    container: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: V6Colors.infoSurface, alignItems: 'center', justifyContent: 'center' },
    title: { marginTop: 12, color: V6Colors.ink800, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
    body: { marginTop: 4, color: V6Colors.ink400, fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center' },
  });
  return { Colors, V6Colors, styles };
}
