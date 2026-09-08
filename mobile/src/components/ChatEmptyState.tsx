import React from 'react';
import { MessageCircle } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { V6Colors } from '../constants/theme';

export default function ChatEmptyState() {
  return (
    <View style={styles.container}>
      <View style={styles.icon}><MessageCircle size={26} color={V6Colors.cyan700} /></View>
      <Text style={styles.title}>No messages yet</Text>
      <Text style={styles.body}>Send a message to start the conversation.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e6f8fb', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 12, color: V6Colors.ink800, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  body: { marginTop: 4, color: V6Colors.ink400, fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center' },
});