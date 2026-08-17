/**
 * HOChatScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-chat screen — a flat
 * white .topbar (avatar + name + status inline, not a colored hero), plain
 * message bubbles (sent: solid cyan-600 with one flattened corner, received:
 * white bordered with one flattened corner), and a bordered .chat-composer.
 *
 * Deviation from the mockup: kept the "View Job" link (mockup's back button
 * always returns to Job Detail directly; this app's back button returns to
 * whichever tab was active before Chat was opened, so a same-tap way back to
 * the job would otherwise be lost) and dropped the decorative call button,
 * which has no real functionality behind it.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Paperclip,
} from 'lucide-react-native';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';

const C = V6Colors;
import { useAuth } from '../../../src/context/AuthContext';
import {
  api,
  mergeMessageById,
  type Conversation,
  type Message,
} from '../../../src/lib/api';
import { initials, timeOfDay } from '../../../src/lib/format';

interface HOChatScreenProps {
  jobId: string | null;
  onBack: () => void;
  onViewJob: () => void;
}

export default function HOChatScreen({ jobId, onBack, onViewJob }: HOChatScreenProps) {
  const { profile } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    let active = true;
    let stopStream: (() => void) | undefined;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!jobId) throw new Error('No conversation selected.');
        const convo = await api.openConversation(jobId);
        const msgs = await api.messages(convo.id);
        if (active) {
          setConversation(convo);
          setMessages(msgs);
          stopStream = api.streamMessages(
            convo.id,
            msgs[msgs.length - 1]?.created_at,
            (message) => {
              if (active) setMessages((previous) => mergeMessageById(previous, message));
            },
          );
        }
        api.markConversationRead(convo.id).catch(() => {});
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load chat.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      stopStream?.();
    };
  }, [jobId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !conversation || sending) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(conversation.id, body);
      setMessages((previous) => mergeMessageById(previous, msg));
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      // Keep the text so the user can retry.
    } finally {
      setSending(false);
    }
  };

  const renderBubble = ({ item }: { item: Message }) => {
    const sent = item.sender_id === profile?.id;
    return (
      <View style={[styles.bubbleWrap, sent ? styles.bubbleWrapSent : styles.bubbleWrapReceived]}>
        <View style={[styles.bubble, sent ? styles.bubbleSent : styles.bubbleReceived]}>
          <Text style={[styles.bubbleText, sent && styles.bubbleTextSent]}>{item.body}</Text>
        </View>
        <Text style={[styles.bubbleTime, sent && styles.bubbleTimeSent]}>{timeOfDay(item.created_at)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{initials(conversation?.counterpart_name)}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{conversation?.counterpart_name ?? 'Chat'}</Text>
          {!!conversation?.job_status && (
            <Text style={styles.headerStatus}>{conversation.job_status}</Text>
          )}
        </View>
        <TouchableOpacity onPress={onViewJob} activeOpacity={0.8}>
          <Text style={styles.viewJobLink}>View Job</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading && <ActivityIndicator style={{ marginTop: 30 }} color={C.cyan700} />}
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && messages.length === 0 && (
          <Text style={styles.stateText}>No messages yet. Say hello 👋</Text>
        )}
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderBubble}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onLayout={() => listRef.current?.scrollToEnd()}
        />

        {/* Composer — matches .chat-composer */}
        <View style={styles.composer}>
          <TouchableOpacity style={styles.attachBtn} activeOpacity={0.8}>
            <Paperclip size={20} color={C.ink500} />
          </TouchableOpacity>
          <TextInput
            style={styles.chatInput}
            placeholder="Message…"
            placeholderTextColor={C.ink400}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={!text.trim()}
          >
            <ArrowRight size={18} color={C.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: C.cyan600, alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { color: C.white, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },
  headerInfo: { flex: 1 },
  headerName: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  headerStatus: { color: '#16a34a', fontSize: 12, fontWeight: '600', fontFamily: 'Inter', marginTop: 1 },
  viewJobLink: { color: C.cyan700, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

  chatContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  stateText: { color: C.ink500, fontSize: 15.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 20 },

  bubbleWrap: { maxWidth: '75%' },
  bubbleWrapSent: { alignSelf: 'flex-end' },
  bubbleWrapReceived: { alignSelf: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10 },
  bubbleSent: {
    backgroundColor: C.cyan600, borderColor: 'transparent',
    borderTopLeftRadius: 16, borderTopRightRadius: 4, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
  },
  bubbleReceived: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.ink100,
    borderTopLeftRadius: 4, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
  },
  bubbleText: { fontFamily: 'Inter', fontSize: 14.5, color: C.ink900, lineHeight: 18 },
  bubbleTextSent: { color: C.white },
  bubbleTime: { fontFamily: 'Inter', fontSize: 11, color: C.ink300, marginTop: 4 },
  bubbleTimeSent: { textAlign: 'right' },

  composer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line,
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#f4f7f9', alignItems: 'center', justifyContent: 'center',
  },
  chatInput: {
    flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#dce3e9', borderRadius: 14,
    paddingHorizontal: 13, paddingVertical: 11, maxHeight: 100,
    fontFamily: 'Inter', fontSize: 14.5, color: C.ink900,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: C.cyan700, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
