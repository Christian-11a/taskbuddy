/**
 * ChatThread.tsx
 *
 * Presentational chat view shared by the homeowner and provider chat screens:
 * header, pinned system line, day-grouped bubbles, photo viewer and composer.
 * The screens own the data (loading, polling, send, attach, read) and pass it in.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { ArrowLeft, ArrowRight, Camera } from 'lucide-react-native';
import Tap from './ui/Tap';
import Banner from './ui/Banner';
import ContentSkeleton from './ui/ContentSkeleton';
import LoadErrorCard from './ui/LoadErrorCard';
import Silhouette from './ui/Silhouette';
import PhotoViewer from './PhotoViewer';
import ChatEmptyState from './ChatEmptyState';
import ChatSafetyNote from './ChatSafetyNote';
import { Spacing } from '../constants/theme';
import { useHeaderTop } from '../hooks/useHeaderTop';
import type { Message } from '../lib/api';
import { timeOfDay } from '../lib/format';
import { cleanText } from '../lib/textRules';

/** The composer's cap on one message. It is under the API's 1,000 characters, and the screen never lets more be typed. */
export const CHAT_MESSAGE_MAX = 500;
/** From this many characters the composer shows how much room is left. */
export const CHAT_COUNTER_FROM = 400;

export interface ChatThreadProps {
  /** The other person's name. The header shows "Chat" until it is known. */
  counterpartName: string | null | undefined;
  /** "{job title} · {status word}", or null when neither is known. */
  subtitle: string | null;
  /** The plain line pinned under the header, or null. */
  systemLine: string | null;
  /** An optional amber note pinned under the header (e.g. an open complaint). */
  notice?: { tone: 'warning'; text: string } | null;
  /** Day label for the first message of each day, keyed by message id. */
  dayHeads: Record<string, string>;
  /** Messages in time order, exactly as the screen received them. */
  messages: Message[];
  profileId: string | undefined;
  loading: boolean;
  error: string | null;
  /** A failed send (text or photo), shown as a short line above the composer. Optional. */
  sendError?: string | null;
  /** The conversation has loaded. Until it has, the composer is off. */
  conversationReady: boolean;
  /** Runs the load again after it failed. */
  onRetry: () => void;
  listRef: React.RefObject<FlatList<Message> | null>;
  text: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  attaching: boolean;
  onAttach: () => void;
  onBack: () => void;
  onViewJob: () => void;
}

export default function ChatThread({
  counterpartName, subtitle, systemLine, notice, dayHeads, messages, profileId, loading, error, sendError, conversationReady, onRetry, listRef,
  text, onChangeText, onSend, attaching, onAttach, onBack, onViewJob,
}: ChatThreadProps) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { fontScale } = useWindowDimensions();
  // At large system text the link moves under the subtitle, so the name and job line keep the width.
  const largeText = fontScale >= 1.2;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // What is sent is the cleaned text: a message of spaces alone cannot be sent.
  const body = cleanText(text);
  const canSend = conversationReady && body.length > 0 && body.length <= CHAT_MESSAGE_MAX;

  const photoMessages = messages.filter((message): message is Message & { attachment_url: string } => !!message.attachment_url);
  const photos = photoMessages.map((message) => ({ uri: message.attachment_url }));

  const viewJobLink = (
    <Tap
      style={[styles.viewJobTap, largeText && styles.viewJobTapBelow]}
      onPress={onViewJob}
      activeOpacity={0.8}
      hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="View job"
    >
      <Text style={styles.viewJobLink}>View job</Text>
    </Tap>
  );

  const renderItem = ({ item }: { item: Message }) => {
    const sent = item.sender_id === profileId;
    const dayHead = dayHeads[item.id];
    return (
      <View>
        {!!dayHead && <Text style={styles.daySeparator} accessibilityRole="header">{dayHead}</Text>}
        <View style={[styles.bubbleWrap, sent ? styles.bubbleWrapSent : styles.bubbleWrapReceived]}>
          <View
            testID={sent ? 'chat-bubble-mine' : 'chat-bubble-theirs'}
            style={[styles.bubble, sent ? styles.bubbleSent : styles.bubbleReceived]}
          >
            {!!item.attachment_url && (
              <Tap
                accessibilityRole="imagebutton"
                accessibilityLabel="View photo"
                onPress={() => setViewerIndex(photoMessages.findIndex((message) => message.id === item.id))}
              >
                <Image source={{ uri: item.attachment_url }} style={styles.bubbleImage} resizeMode="cover" />
              </Tap>
            )}
            {!!item.body && (
              <Text style={[styles.bubbleText, sent && styles.bubbleTextSent]}>{item.body}</Text>
            )}
          </View>
          <Text style={[styles.bubbleTime, sent && styles.bubbleTimeSent]}>{timeOfDay(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={5}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <View style={styles.headerAvatar}>
          <Silhouette name={counterpartName} textStyle={styles.headerAvatarText} />
        </View>
        <View style={styles.headerInfo} testID="chat-header-info">
          <Text style={styles.headerName} numberOfLines={1}>{counterpartName?.trim() || 'Chat'}</Text>
          {!!subtitle && <Text style={styles.headerSubtitle} numberOfLines={2}>{subtitle}</Text>}
          {largeText && viewJobLink}
        </View>
        {!largeText && viewJobLink}
      </View>

      <ChatSafetyNote />

      {!!notice && (
        <View testID="chat-notice" style={styles.notice}>
          <Banner tone={notice.tone} message={notice.text} />
        </View>
      )}

      {!!systemLine && <Text style={styles.systemLine}>{systemLine}</Text>}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading && <ContentSkeleton variant="chat" />}
        {!!error && !loading && (
          <View style={styles.errorWrap}>
            <LoadErrorCard title="Couldn't load this chat" message={error} onRetry={onRetry} />
          </View>
        )}
        {!loading && !error && messages.length === 0 && (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ChatEmptyState />
          </TouchableWithoutFeedback>
        )}
        <FlatList keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          ref={listRef}
          inverted
          data={[...messages].reverse()}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onLayout={() => listRef.current?.scrollToOffset({ offset: 0, animated: false })}
        />

        {!!sendError && (
          <Text style={styles.sendError} accessibilityLiveRegion="polite">{sendError}</Text>
        )}

        {text.length >= CHAT_COUNTER_FROM && (
          <Text style={styles.counter}>{`${text.length}/${CHAT_MESSAGE_MAX}`}</Text>
        )}

        {/* Off, and dimmed, until the conversation is open: there is nowhere to send to yet. */}
        <View style={[styles.composer, !conversationReady && styles.composerOff]}>
          <Tap
            style={styles.attachBtn}
            activeOpacity={0.8}
            onPress={onAttach}
            disabled={attaching || !conversationReady}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Attach a photo"
          >
            {attaching ? (
              <ActivityIndicator size="small" color={C.ink500} />
            ) : (
              <Camera size={20} color={V6Colors.link} />
            )}
          </Tap>
          <TextInput keyboardAppearance={appearance}
            style={styles.chatInput}
            placeholder="Message…"
            placeholderTextColor={C.ink400}
            value={text}
            onChangeText={onChangeText}
            editable={conversationReady}
            multiline
            maxLength={CHAT_MESSAGE_MAX}
          />
          <Tap
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={onSend}
            activeOpacity={0.85}
            disabled={!canSend}
            hitSlop={3}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <ArrowRight size={18} color={V6Colors.onPrimary} />
          </Tap>
        </View>
      </KeyboardAvoidingView>

      <PhotoViewer
        photos={photos}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerAvatar: {
      width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
      backgroundColor: C.primaryTonalStrong, alignItems: 'center', justifyContent: 'center',
    },
    headerAvatarText: { color: C.primaryDeep, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },
    headerInfo: { flex: 1, minWidth: 0 },
    headerName: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
    headerSubtitle: { color: C.ink500, fontSize: 12.5, fontWeight: '500', fontFamily: 'Inter', marginTop: 1 },
    // Normal size: the 48dp touch area comes from hitSlop, so the header row keeps its height.
    viewJobTap: { flexShrink: 0, justifyContent: 'center' },
    // Stacked under the subtitle at large text: the row has room for a real 48dp box.
    viewJobTapBelow: { alignSelf: 'flex-start', minWidth: 48, minHeight: 48 },
    viewJobLink: { color: V6Colors.link, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

    notice: { paddingHorizontal: 16, paddingTop: 10 },
    systemLine: {
      color: C.ink500, fontSize: 12.5, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center',
      paddingHorizontal: 24, paddingTop: 10,
    },
    daySeparator: {
      color: C.ink500, fontSize: 11, fontWeight: '700', fontFamily: 'Inter', letterSpacing: 0.6,
      textAlign: 'center', marginVertical: 8,
    },

    chatContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
    errorWrap: { paddingHorizontal: 16, paddingTop: 16 },

    bubbleWrap: { maxWidth: '75%' },
    bubbleWrapSent: { alignSelf: 'flex-end' },
    bubbleWrapReceived: { alignSelf: 'flex-start' },
    bubble: { paddingHorizontal: 14, paddingVertical: 10 },
    bubbleSent: {
      backgroundColor: Colors.primary, borderColor: 'transparent',
      borderTopLeftRadius: 16, borderTopRightRadius: 4, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    },
    bubbleReceived: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.ink100,
      borderTopLeftRadius: 4, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    },
    bubbleText: { fontFamily: 'Inter', fontSize: 14.5, color: C.ink900 },
    bubbleTextSent: { color: Colors.onPrimary },
    bubbleImage: { width: 200, maxWidth: '100%', height: 150, borderRadius: 12, marginBottom: 6 },
    bubbleTime: { fontFamily: 'Inter', fontSize: 11, color: C.ink300, marginTop: 4 },
    bubbleTimeSent: { textAlign: 'right' },

    sendError: {
      paddingHorizontal: 18, paddingTop: 8, backgroundColor: C.surface,
      color: C.dangerText, fontSize: 13, fontWeight: '600', fontFamily: 'Inter',
    },
    counter: {
      alignSelf: 'flex-end', paddingHorizontal: 18, paddingTop: 8, backgroundColor: C.surface,
      color: C.ink500, fontSize: 12, fontWeight: '600', fontFamily: 'Inter',
    },
    composer: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24,
      backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line,
    },
    composerOff: { opacity: 0.5 },
    attachBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    chatInput: {
      flex: 1, minWidth: 0, borderWidth: 1, borderColor: V6Colors.fieldBorder, borderRadius: 14,
      paddingHorizontal: 13, paddingVertical: 11, maxHeight: 100,
      fontFamily: 'Inter', fontSize: 14.5, color: C.ink900,
    },
    sendBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
