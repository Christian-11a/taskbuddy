/**
 * HONotificationsScreen.tsx
 *
 * Notifications for the homeowner, grouped Today / Earlier. A row opens the job
 * it is about (a new application goes to its proposals). The trash button hides
 * the row and offers Undo; the delete is sent only once that window passes.
 * Long-press a row to pick several and delete them together (see useNotificationSelection).
 * "Clear all" keeps its confirm, because it removes the whole list.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import Banner from '../../../src/components/ui/Banner';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import { NOTIFICATION_ICONS } from '../../../src/components/ui/NotificationCard';
import { NotificationSelectBar, NotificationSelectRow } from '../../../src/components/NotificationSelection';
import { ArrowLeft, BellRing } from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { useNotificationDeletion } from '../../../src/hooks/useNotificationDeletion';
import { deleteTitle, useNotificationSelection } from '../../../src/hooks/useNotificationSelection';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useNotifications } from '../../../src/context/NotificationsContext';
import { showToast } from '../../../src/components/Toast';
import { api } from '../../../src/lib/api';
import { timeAgo } from '../../../src/lib/format';
import { resolveNotificationTarget } from '../../../src/lib/notificationRouting';
import { groupNotificationsByDay, notificationIconName, notificationTone } from '../../../src/lib/notificationPresentation';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  /** Job/application updates carry the job (and application) they are about. */
  data: { job_id?: string; application_id?: string; conversation_id?: string; request_id?: string; dispute_id?: string } | null;
  target?: { screen: string; job_id?: string; request_id?: string };
}

// The header back button is 38 dp; the extra 5 dp on each side reaches 48.
const BACK_HIT_SLOP = { top: 5, bottom: 5, left: 5, right: 5 } as const;
const LINK_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 } as const;

interface HONotificationsProps {
  onBack: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenChat: (jobId: string) => void;
  onOpenDispute: (jobId: string) => void;
  /** The job's Proposals screen — where a new application is reviewed. */
  onOpenProposals: (jobId: string) => void;
}

export default function HONotificationsScreen({ onBack, onOpenJob, onOpenProposals, onOpenChat, onOpenDispute }: HONotificationsProps) {
  const { C, Colors, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { notifications, loading, error, reload, unreadCount } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  // The spinner stops when the fetch settles, even when it failed (the error state shows below).
  const onRefresh = () => {
    setRefreshing(true);
    void Promise.resolve(reload()).finally(() => setRefreshing(false));
  };
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReadId, setPendingReadId] = useState<string | null>(null);
  const deletion = useNotificationDeletion();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Rows waiting out their Undo window are hidden; their unread count leaves the header too.
  const waiting = deletion.pendingIds;
  const visible = notifications.filter((n) => !waiting.has(n.id));
  const hiddenUnread = notifications.filter((n) => waiting.has(n.id) && !n.read_at).length;
  const shownUnread = Math.max(0, unreadCount - hiddenUnread);
  const groups = groupNotificationsByDay(visible);
  const selection = useNotificationSelection(visible.map((n) => n.id));

  const markAllRead = async () => {
    try {
      setActionError(null);
      await api.markAllNotificationsRead();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not mark notifications as read.');
    }
  };

  const markRead = async (id: string) => {
    const prev = notifications.find((n) => n.id === id)?.read_at;
    setPendingReadId(id);
    setActionError(null);
    try {
      await api.markNotificationRead(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not mark this notification as read.');
      if (prev === null) reload();
    } finally {
      setPendingReadId(null);
    }
  };

  /**
   * Marking read is fire-and-forget when navigating away: this screen unmounts
   * and reloads on return, and a failed mark-read should not block the job.
   */
  const openNotification = (notif: NotificationRow) => {
    const target = resolveNotificationTarget('homeowner', notif.data ?? {}, notif.target);
    if (target.kind === 'none') {
      if (!notif.read_at) void markRead(notif.id);
      return;
    }
    if (!notif.read_at) api.markNotificationRead(notif.id).catch((err: Error) => showToast(err.message, 'error'));
    if (target.kind === 'chat') onOpenChat(target.jobId);
    else if (target.kind === 'dispute') onOpenDispute(target.jobId);
    else if (target.kind === 'proposals') onOpenProposals(target.jobId);
    else if (target.kind === 'job') onOpenJob(target.jobId);
  };

  const renderRow = (notif: NotificationRow) => {
    // The same resolver that decides where a tap goes tells chat and complaint
    // notifications apart from job updates; the icon follows what happened.
    const kind = resolveNotificationTarget('homeowner', notif.data ?? {}, notif.target).kind;
    const tone = notificationTone({ title: notif.title, body: notif.body, type: notif.type });
    const icon = NOTIFICATION_ICONS[notificationIconName({ type: notif.type, title: notif.title, body: notif.body, kind, tone })];
    return (
      <NotificationSelectRow
        key={notif.id}
        selecting={selection.selecting}
        selected={selection.selected.has(notif.id)}
        onStartSelect={() => selection.start(notif.id)}
        onToggle={() => selection.toggle(notif.id)}
        card={{
          title: notif.title,
          body: notif.body,
          time: timeAgo(notif.created_at),
          tone,
          icon,
          unread: !notif.read_at,
          pending: pendingReadId === notif.id,
          onPress: () => openNotification(notif),
          onDelete: () => deletion.removeWithUndo(notif.id),
        }}
      />
    );
  };

  const renderGroup = (label: string, rows: NotificationRow[]) => {
    if (rows.length === 0) return null;
    return (
      <View>
        <Text style={styles.groupTitle}>{label}</Text>
        <View style={styles.cards}>{rows.map(renderRow)}</View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap style={styles.backBtn} onPress={onBack} activeOpacity={0.8} hitSlop={BACK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Notifications</Text>
      </View>

      <ConfirmationModal
        visible={confirmClear}
        title="Clear all notifications?"
        message="This removes every notification from your list. It can't be undone."
        confirmLabel="Clear all"
        onConfirm={() => {
          setConfirmClear(false);
          void deletion.clearAll();
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmationModal
        visible={confirmDelete}
        title={deleteTitle(selection.selected.size)}
        message="The chosen notifications are removed from your list. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          void selection.deleteSelected();
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.link} colors={[Colors.link]} />
        }
      >
        {selection.selecting && (
          <NotificationSelectBar
            count={selection.selected.size}
            deleting={selection.deleting}
            onSelectAll={selection.selectAll}
            onCancel={selection.cancel}
            onDelete={() => setConfirmDelete(true)}
          />
        )}
        {!selection.selecting && notifications.length > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText} numberOfLines={1}>
              {shownUnread > 0 ? `${shownUnread} unread` : ''}
            </Text>
            {unreadCount > 0 ? (
              <Tap onPress={markAllRead} activeOpacity={0.8} hitSlop={LINK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Mark all read">
                <Text style={styles.linkText} numberOfLines={1} maxFontSizeMultiplier={1.15}>Mark all read</Text>
              </Tap>
            ) : (
              <Tap onPress={() => setConfirmClear(true)} activeOpacity={0.8} hitSlop={LINK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Clear all notifications">
                <Text style={styles.linkText}>Clear all</Text>
              </Tap>
            )}
          </View>
        )}

        {actionError && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{actionError}</Text>
            <Tap onPress={() => void reload()} activeOpacity={0.8} hitSlop={LINK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Retry">
              <Text style={styles.bannerAction}>Retry</Text>
            </Tap>
          </View>
        )}
        {loading && <ContentSkeleton variant="list" />}
        {!!error && !loading && notifications.length === 0 && (
          <LoadErrorCard title="Couldn't load notifications" message={error} onRetry={() => void reload()} />
        )}
        {!!error && !loading && notifications.length > 0 && (
          <Banner tone="error" message={error} actionLabel="Try again" onAction={() => void reload()} />
        )}
        {!loading && !error && visible.length === 0 && (
          <EmptyCard>
            <EmptyRow
              icon={BellRing}
              title="You're all caught up"
              body="New proposals, bookings and messages will show up here."
            />
          </EmptyCard>
        )}

        {renderGroup('Today', groups.today)}
        {renderGroup('Earlier', groups.earlier)}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.27 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 14, paddingBottom: 20 },

    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
    summaryText: { flex: 1, color: V6Colors.ink500, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
    linkText: { color: Colors.link, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

    groupTitle: {
      color: V6Colors.ink500, fontSize: 13, fontWeight: '700', fontFamily: 'Inter',
      letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
    },
    cards: { gap: 8, marginBottom: 16 },

    banner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: V6Colors.dangerSurface, borderWidth: 1, borderColor: V6Colors.dangerBorder,
      borderRadius: 12, padding: 10, marginBottom: 12,
    },
    bannerText: { flex: 1, color: V6Colors.dangerText, fontSize: 12.5, fontFamily: 'Inter', lineHeight: 18 },
    bannerAction: { color: Colors.link, fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter', marginLeft: 12 },
  });
  return { Colors, V6Colors, C, styles };
}
