import React from 'react';
import { MessageCircle } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import EmptyCard from './ui/EmptyCard';
import EmptyRow from './ui/EmptyRow';

/** The empty thread: the same card and row as the other empty states, under the chat's first line. */
export default function ChatEmptyState() {
  return (
    <View style={styles.wrap}>
      <EmptyCard>
        <EmptyRow icon={MessageCircle} title="No messages yet" body="Send a message to start the conversation." />
      </EmptyCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16 },
});
