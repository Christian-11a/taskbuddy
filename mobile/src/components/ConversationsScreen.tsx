import React, { useEffect, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { useRefreshOnForeground } from '../hooks/useRefreshOnForeground';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { subscribeChatUnread } from '../hooks/useChatUnread';
import { api, type Conversation } from '../lib/api';
import { initials, jobStatusMeta, timeAgo } from '../lib/format';
import {
  CONVERSATION_FILTERS, SEARCH_THRESHOLD, applyConversationFilters, conversationSections, countUnreadChats,
  effectiveStatus, emptyCopy, matchesFilter, serviceCounts, type ConversationFilter, type ConversationItem,
} from '../lib/conversationFilters';
import { isList } from '../lib/savedShapes';
import ContentSkeleton from './ui/ContentSkeleton';
import EmptyCard from './ui/EmptyCard';
import EmptyRow from './ui/EmptyRow';
import FilterPill from './ui/FilterPill';
import LoadErrorCard from './ui/LoadErrorCard';
import RefreshBar from './ui/RefreshBar';
import Tap from './ui/Tap';

/**
 * The Messages tab, for clients and providers alike: every job conversation,
 * most recent first, sorted into Active / Unread / Finished / All with an
 * optional service filter and search. Tapping one opens that job's chat.
 * Service names come from the same job list My Jobs uses (same cache key);
 * if that fails the service chips and labels are simply left out.
 */
export default function ConversationsScreen({ onOpenChat }: { onOpenChat: (jobId: string) => void }) {
  const { s, c, V6 } = useThemedStyles(createStyles);
  const headerTop = useHeaderTop();
  const { role } = useAuth();
  const isProvider = role === 'provider';
  // In-memory cache only (chat data is never saved to the device), so a revisit shows the last list at once.
  const conversations = useAsyncData(() => api.conversations(), [], 'conversations');
  useRefreshOnForeground(conversations.reload, true);
  // Same fetcher and cache key as My Jobs, so this is normally already cached.
  const jobs = useAsyncData(
    () => (isProvider ? api.assignedJobs() : api.myJobs()),
    [isProvider],
    isProvider ? 'sp-assigned' : 'ho-jobs',
    { persist: true, validate: isList },
  );
  // New messages (a chat push, the badge timer) or a chat read elsewhere
  // re-read the list so its unread markers stay in step with the tab badge.
  const { reload } = conversations;
  useEffect(() => subscribeChatUnread(reload), [reload]);

  const [filter, setFilter] = useState<ConversationFilter>('active');
  const [service, setService] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const all: ConversationItem[] = useMemo(() => {
    const byJob = new Map<string, { service: string | null; display_status: string | null }>();
    for (const j of jobs.data ?? []) {
      byJob.set(j.id, { service: j.service_categories?.name ?? null, display_status: j.display_status ?? null });
    }
    return (conversations.data ?? []).map((cv: Conversation) => {
      const extra = byJob.get(cv.job_id);
      return { ...cv, service: extra?.service ?? null, display_status: extra?.display_status ?? null };
    });
  }, [conversations.data, jobs.data]);

  const unreadCount = countUnreadChats(all);
  const showSearch = all.length > SEARCH_THRESHOLD;
  // Service chips count what the current status chip shows.
  const inFilter = useMemo(() => all.filter((cv) => matchesFilter(cv, filter)), [all, filter]);
  const services = useMemo(() => serviceCounts(inFilter), [inFilter]);
  const activeService = service && services.some((x) => x.name === service) ? service : null;
  const visible = useMemo(
    () => applyConversationFilters(all, { filter, query: showSearch ? query : '', service: activeService }),
    [all, filter, query, showSearch, activeService],
  );
  const sections = conversationSections(visible, filter);
  const role2 = isProvider ? 'provider' : 'client';
  const noChatsAtAll = all.length === 0;
  const empty = emptyCopy(noChatsAtAll ? 'all' : filter, role2);
  const filtered = !!(showSearch && query.trim()) || !!activeService;

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: headerTop }]}>
        <Text style={s.title} accessibilityRole="header">Messages</Text>
      </View>
      {!noChatsAtAll && (
        <View style={s.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow} testID="messages-filters">
            {CONVERSATION_FILTERS.map(({ key, label }) => (
              <FilterPill
                key={key}
                label={label}
                count={key === 'unread' ? unreadCount : undefined}
                selected={filter === key}
                onPress={() => setFilter(key)}
              />
            ))}
          </ScrollView>
          {services.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.serviceRow} testID="messages-services">
              {services.map(({ name, count }) => {
                const on = activeService === name;
                return (
                  <Tap
                    key={`${name}:${on}`}
                    style={[s.svcChip, on && s.svcChipOn]}
                    onPress={() => setService(on ? null : name)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${name}, ${count}`}
                  >
                    <Text style={[s.svcText, on && s.svcTextOn]}>{name} {count}</Text>
                  </Tap>
                );
              })}
            </ScrollView>
          )}
          {showSearch && (
            <TextInput
              testID="messages-search"
              style={s.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or job"
              placeholderTextColor={c.muted}
              accessibilityLabel="Search chats"
              returnKeyType="search"
              autoCorrect={false}
            />
          )}
        </View>
      )}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={conversations.refreshing || jobs.refreshing}
            onRefresh={() => { conversations.reload(); jobs.reload(); }}
            tintColor={V6.ink500}
            colors={[V6.ink500]}
          />
        }
      >
        {conversations.loading && !conversations.data && <ContentSkeleton variant="list" />}
        {conversations.refreshing && !!conversations.data && <RefreshBar />}
        {!!conversations.error && (
          <LoadErrorCard title="Couldn't load your messages" message={conversations.error} onRetry={conversations.reload} />
        )}
        {conversations.data && visible.length === 0 && (
          <EmptyCard testID="messages-empty">
            <EmptyRow
              icon={MessageCircle}
              title={filtered ? 'No matching chats' : empty.title}
              body={filtered ? 'Nothing matches your search or service filter.' : empty.body}
            />
          </EmptyCard>
        )}
        {sections.map((section) => (
          <View key={section.title || 'list'} style={s.section}>
            {!!section.title && <Text style={s.sectionTitle} accessibilityRole="header">{section.title}</Text>}
            {section.data.map((item) => {
              const unread = item.unread_count ?? 0;
              const status = effectiveStatus(item);
              const meta = status ? jobStatusMeta(status, V6) : null;
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
                    <Text style={[s.job, unread > 0 && s.unreadJob]} numberOfLines={1}>
                      {`${item.service ? `${item.service} · ` : ''}${item.job_title ?? 'Job'}`}
                    </Text>
                    {meta && (
                      <View style={[s.pill, { backgroundColor: meta.bg }]} testID={`conversation-status-${item.id}`}>
                        <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    )}
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
          </View>
        ))}
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
    filterBar: { backgroundColor: V6Colors.surface, borderBottomWidth: 1, borderBottomColor: V6Colors.line, paddingBottom: 10 },
    filterScroll: { flexGrow: 0 },
    filterRow: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
    serviceRow: { gap: 6, paddingHorizontal: 16, paddingTop: 8 },
    svcChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: V6Colors.ink50, borderWidth: 1, borderColor: V6Colors.line },
    svcChipOn: { backgroundColor: Colors.primaryTonal, borderColor: Colors.primary },
    svcText: { color: V6Colors.ink700, fontSize: 12, fontWeight: '600', fontFamily: 'Inter' },
    svcTextOn: { color: Colors.primary },
    search: {
      marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.canvas, color: V6Colors.ink900,
      fontSize: 14, fontFamily: 'Inter',
    },
    content: { padding: 16, gap: 10 },
    section: { gap: 10 },
    sectionTitle: { color: V6Colors.ink500, fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
    pill: { alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    pillText: { fontSize: 11.5, fontWeight: '700', fontFamily: 'Inter' },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarFallback: { backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: Colors.primary, fontWeight: '700', fontFamily: 'Inter' },
    text: { flex: 1 },
    name: { color: V6Colors.ink900, fontSize: 15.5, fontWeight: '600', fontFamily: 'Inter' },
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
  V6: V6Colors,
});
