/**
 * SPChatScreen.tsx
 *
 * Provider side of a job chat. The view lives in ChatThread (shared with the homeowner chat):
 * header with the client and the job, a pinned system line, day-grouped bubbles and the composer.
 *
 * Deviation from the mockup: kept the "View job" link (the mockup's back button always returns to
 * Job Detail directly; this app's back button returns to whichever tab was active before Chat was
 * opened, so a same-tap way back to the job would otherwise be lost).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import ChatThread from '../../../src/components/ChatThread';
import { refreshChatUnread } from '../../../src/hooks/useChatUnread';
import { requestAppPermission } from '../../../src/lib/permissions';
import { useChatJob } from '../../../src/hooks/useChatJob';

import { useAuth } from '../../../src/context/AuthContext';
import {
  api,
  mergeMessageById,
  type Conversation,
  type Message,
} from '../../../src/lib/api';
import { jobStatusMeta } from '../../../src/lib/format';
import { chatSubtitle, chatSystemLine, dayHeadLabels } from '../../../src/lib/chatView';
import { cleanText } from '../../../src/lib/textRules';

interface SPChatScreenProps {
  jobId: string | null;
  onBack: () => void;
  onViewJob: () => void;
}

export default function SPChatScreen({ jobId, onBack, onViewJob }: SPChatScreenProps) {
  const { profile } = useAuth();
  const job = useChatJob(jobId);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A failed text or photo send. Shown inline above the composer, not in the load-error card.
  const [sendError, setSendError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  // Bumped by Try again, so the load runs once more.
  const [attempt, setAttempt] = useState(0);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    let active = true;
    let stopStream: (() => void) | undefined;
    (async () => {
      setConversation(null);
      setMessages([]);
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
        api.markConversationRead(convo.id).then(refreshChatUnread).catch(() => {});
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
  }, [jobId, attempt]);

  const handleSend = async () => {
    const body = cleanText(text);
    if (!body || !conversation || sending || attaching) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(conversation.id, body);
      setMessages((previous) => mergeMessageById(previous, msg));
      setText('');
      setSendError(null);
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } catch (e) {
      // Keep the text so the user can retry, and show why it did not go.
      setSendError(e instanceof Error && e.message ? e.message : 'Message not sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const handleAttach = async () => {
    if (!conversation || attaching || sending) return;
    setAttaching(true);
    try {
      if (!(await requestAppPermission('gallery'))) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled) return;
      const path = await api.uploadImage('chat-attachments', result.assets[0].uri);
      const msg = await api.sendMessage(conversation.id, '', path);
      setMessages((previous) => mergeMessageById(previous, msg));
      setSendError(null);
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send the photo.');
    } finally {
      setAttaching(false);
    }
  };

  const now = new Date();
  const dayHeads = useMemo(() => dayHeadLabels(messages, now), [messages]);
  const statusLabel = conversation?.job_status ? jobStatusMeta(conversation.job_status).label : null;

  const disputed = (conversation?.job_status ?? job?.status) === 'disputed';

  return (
    <ChatThread
      counterpartName={conversation?.counterpart_name}
      subtitle={chatSubtitle(conversation?.job_title ?? job?.title, statusLabel)}
      systemLine={chatSystemLine({
        role: 'provider',
        counterpartName: conversation?.counterpart_name,
        job,
        now,
      })}
      notice={disputed ? { tone: 'warning', text: 'A complaint is open. An admin is reviewing it.' } : null}
      dayHeads={dayHeads}
      messages={messages}
      profileId={profile?.id}
      loading={loading}
      error={error}
      sendError={sendError}
      conversationReady={conversation !== null}
      onRetry={() => setAttempt((n) => n + 1)}
      listRef={listRef}
      text={text}
      onChangeText={(value) => {
        setText(value);
        setSendError(null);
      }}
      onSend={handleSend}
      attaching={attaching}
      onAttach={() => void handleAttach()}
      onBack={onBack}
      onViewJob={onViewJob}
    />
  );
}
