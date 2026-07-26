/**
 * SPChatScreen.tsx
 *
 * Figma Source: "SP - Chat Interface" (id: 240:801)
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ArrowLeft, Paperclip, Phone, Sparkles, SendHorizontal } from 'lucide-react-native';
import { Colors, Radii, Sizes, Spacing } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { api, type Conversation, type Message } from '../../../src/lib/api';
import { initials, shortDate, timeOfDay } from '../../../src/lib/format';

interface SPChatScreenProps { jobId: string | null; onBack: () => void; onViewJob: () => void; }

export default function SPChatScreen({ jobId, onBack, onViewJob }: SPChatScreenProps) {
  const { profile } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    let active = true;
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
        }
        api.markConversationRead(convo.id).catch(() => {});
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load chat.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [jobId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !conversation || sending) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(conversation.id, body);
      setMessages((p) => [...p, msg]);
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      // keep text for retry
    } finally {
      setSending(false);
    }
  };

  const renderBubble = ({ item }: { item: Message }) => {
    const sent = item.sender_id === profile?.id;
    return (
      <View style={[styles.row, sent && styles.rowSent]}>
        {!sent && <View style={styles.avatar}><Text style={styles.avatarText}>{initials(conversation?.counterpart_name)}</Text></View>}
        <View style={[styles.bubble, sent ? styles.bubbleSent : styles.bubbleReceived]}>
          <Text style={[styles.bubbleText, sent && styles.bubbleTextSent]}>{item.body}</Text>
          <Text style={[styles.bubbleTime, sent && styles.bubbleTimeSent]}>{timeOfDay(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={18} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.clientAvatar}><Text style={styles.clientAvatarText}>{initials(conversation?.counterpart_name)}</Text></View>
        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>{conversation?.counterpart_name ?? 'Chat'}</Text>
          <View style={styles.onlineRow}>
            <Text style={styles.onlineText}>{conversation?.job_status ?? ''}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.callBtn} activeOpacity={0.8}>
          <Phone size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Job ref */}
      <View style={styles.jobRef}>
        <Sparkles size={18} color={Colors.brandTeal} />
        <Text style={styles.jobRefText}>
          {conversation?.job_title ?? 'Job'}
          {conversation ? ` · ${shortDate(conversation.created_at)}` : ''}
        </Text>
        <TouchableOpacity onPress={onViewJob} activeOpacity={0.8}><Text style={styles.jobRefLink}>View Job</Text></TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading && <ActivityIndicator style={{ marginTop: 30 }} color={Colors.brandTeal} />}
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && messages.length === 0 && (
          <Text style={styles.stateText}>No messages yet. Say hello 👋</Text>
        )}
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderBubble}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onLayout={() => listRef.current?.scrollToEnd()}
        />
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} activeOpacity={0.8}>
            <Paperclip size={18} color={Colors.brandTeal} />
          </TouchableOpacity>
          <TextInput
            style={[styles.chatInput, inputFocused && styles.chatInputFocused]}
            placeholder="Type a message..."
            placeholderTextColor={Colors.muted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={!text.trim()}
          >
            <SendHorizontal size={16} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: Colors.backgroundAlt },
  header: {
    backgroundColor: Colors.brandDark, paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: Colors.white, fontSize: 18, fontWeight: '600' },
  clientAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { color: Colors.white, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  clientInfo: { flex: 1 },
  clientName: { color: Colors.white, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22C55E' },
  onlineText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter' },
  callBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  callIcon: { fontSize: 18 },
  jobRef: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, paddingHorizontal: Spacing.screenH, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  jobRefIcon: { fontSize: 18 },
  jobRefText: { flex: 1, color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  jobRefLink: { color: Colors.brandTeal, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
  chatContent: { paddingHorizontal: Spacing.screenH, paddingVertical: 16, gap: 10 },
  stateText: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter', textAlign: 'center', marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  rowSent: { flexDirection: 'row-reverse' },
  avatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontSize: 12, fontWeight: '800', fontFamily: 'Inter' },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleSent: { backgroundColor: Colors.brandTeal, borderBottomRightRadius: 4 },
  bubbleReceived: { backgroundColor: Colors.white, borderBottomLeftRadius: 4, shadowColor: '#063D4D', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  bubbleText: { fontFamily: 'Inter', fontSize: 14, color: Colors.brandDark, lineHeight: 20 },
  bubbleTextSent: { color: Colors.white },
  bubbleTime: { fontFamily: 'Inter', fontSize: 10, color: Colors.muted, marginTop: 4, textAlign: 'right' },
  bubbleTimeSent: { color: 'rgba(255,255,255,0.7)' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: Spacing.screenH, paddingVertical: 12, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: 'rgba(144,153,184,0.15)' },
  attachBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  attachIcon: { fontSize: 20 },
  chatInput: { flex: 1, backgroundColor: Colors.backgroundAlt, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100, fontFamily: 'Inter', fontSize: 14, color: Colors.brandDark },
  chatInputFocused: { borderWidth: 1.5, borderColor: Colors.brandTeal },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandTeal, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: 'rgba(144,153,184,0.3)' },
  sendBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
