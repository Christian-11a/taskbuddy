import React, { useEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { useRefreshOnForeground } from '../hooks/useRefreshOnForeground';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { subscribeChatUnread } from '../hooks/useChatUnread';
import { api, type Conversation } from '../lib/api';
import { initials, timeAgo } from '../lib/format';
import ContentSkeleton from './ui/ContentSkeleton';
import LoadErrorCard from './ui/LoadErrorCard';
import RefreshBar from './ui/RefreshBar';
import Tap from './ui/Tap';

/**
 * The Messages tab, for clients and providers alike: every job conversation,
 * most recent first. It took the Wallet tab's place when the in-app wallet
 * was retired. Tapping one opens that job's chat.
 */
export default function ConversationsScreen({ onOpenChat }: { onOpenChat: (jobId: string) => void }) {
  const { s, c } = useThemedStyles(createStyles);
  const headerTop = useHeaderTop();
  const conversations = useAsyncData(() => api.conversations(), []);
  useRefreshOnForeground(conversations.reload, true);
  // New messages (a chat push, the badge timer) or a chat read elsewhere
  // re-read the list so its unread markers stay in step with the tab badge.
  const { reload } = conversations;
  useEffect(() => subscribeChatUnread(reload), [reload]);
  const list = conversations.data ?? [];

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: headerTop }]}>
        <Text style={s.title} accessibilityRole="header">Messages</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {conversations.loading && !conversations.data && <ContentSkeleton variant="list" />}
        {conversations.loading && !!conversations.data && <RefreshBar />}
        {!!conversations.error && (
          <LoadErrorCard title="Couldn't load your messages" message={conversations.error} onRetry={conversations.reload} />
        )}
        {conversations.data && list.length === 0 && (
          <View style={s.empty} testID="messages-empty">
            <MessageCircle size={32} color={c.muted} />
            <Text style={s.emptyTitle}>No conversations yet</Text>
            <Text style={s.emptyBody}>A chat opens once a job has a hired provider.</Text>
          </View>
        )}
        {list.map((item: Conversation) => {
          const unread = item.unread_count ?? 0;
          return (
          <Tap
            key={item.id}
            testID={`conversation-${item.id}`}
            style={s.row}
            onPress={() => onOpenChat(item.job_id)}
            accessibilityRole="button"
            accessibilityLabel={`Chat with ${item.counterpart_name ?? 'your contact'} about ${item.job_title ?? 'a job'}${unread ? `, ${unread} unread` : ''}`}
          >
            {item.counterpart_avatar_url ? (
              <Image source={{ uri: item.counterpart_avatar_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarText}>{initials(item.counterpart_name)}</Text>
              </View>
            )}
            <View style={s.text}>
              <Text style={[s.name, unread > 0 && s.unreadText]} numberOfLines={1}>{item.counterpart_name ?? 'TaskBuddy user'}</Text>
              <Text style={[s.job, unread > 0 && s.unreadJob]} numberOfLines={1}>{item.job_title ?? 'Job'}</Text>
            </View>
            <View style={s.meta}>
              <Text style={[s.time, unread > 0 && s.unreadTime]}>{timeAgo(item.last_message_at ?? item.created_at)}</Text>
              {unread > 0 && (
                <View style={s.badge} testID={`conversation-unread-${item.id}`}>
                  <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </View>
          </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },
    header: {
      backgroundColor: V6Colors.surface, paddingHorizontal: 20, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    title: { color: V6Colors.ink900, fontSize: 22, fontWeight: '800', fontFamily: 'Inter' },
    content: { padding: 16, gap: 10 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarFallback: { backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: Colors.primary, fontWeight: '700', fontFamily: 'Inter' },
    text: { flex: 1 },
    name: { color: V6Colors.ink900, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
    job: { color: V6Colors.ink500, fontSize: 13.5, fontFamily: 'Inter', marginTop: 2 },
    time: { color: V6Colors.ink500, fontSize: 12.5, fontFamily: 'Inter' },
    meta: { alignItems: 'flex-end', gap: 6 },
    unreadText: { fontWeight: '800' },
    unreadJob: { color: V6Colors.ink900 },
    unreadTime: { color: Colors.primary, fontWeight: '700' },
    badge: {
      minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
      backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { color: Colors.onPrimary, fontSize: 11.5, fontWeight: '700', fontFamily: 'Inter' },
    empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
    emptyTitle: { color: V6Colors.ink900, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    emptyBody: { color: V6Colors.ink500, fontSize: 14, fontFamily: 'Inter', textAlign: 'center' },
  }),
  c: { muted: V6Colors.ink500 },
});
