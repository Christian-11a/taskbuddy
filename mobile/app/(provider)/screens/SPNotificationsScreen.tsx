/**
 * SPNotificationsScreen.tsx
 *
 * Notifications for the provider, grouped Today / Earlier, in the same card
 * layout as the homeowner's (HONotificationsScreen.tsx). A service request
 * opens My services; any other row opens its job, chat or dispute. The trash
 * button hides the row and offers Undo before the delete is sent.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import NotificationCard, { NOTIFICATION_ICONS } from '../../../src/components/ui/NotificationCard';
import { ArrowLeft, BellRing } from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { useNotificationDeletion } from '../../../src/hooks/useNotificationDeletion';
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
  /** Recommendation invites and job/application updates carry the job they are about. */
  data: { job_id?: string } | null;
}

// The header back button is 38 dp; the extra 5 dp on each side reaches 48.
const BACK_HIT_SLOP = { top: 5, bottom: 5, left: 5, right: 5 } as const;
const LINK_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 } as const;

interface SPNotificationsScreenProps {
  onBack: () => void;
  /** Opens a job's detail screen — where an invited provider can apply. */
  onOpenJob: (jobId: string) => void;
  onOpenChat: (jobId: string) => void;
  onOpenDispute: (jobId: string) => void;
  onOpenServices: () => void;
}

export default function SPNotificationsScreen({ onBack, onOpenJob, onOpenChat, onOpenDispute, onOpenServices }: SPNotificationsScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { notifications, loading, error, reload, unreadCount } = useNotifications();
  const deletion = useNotificationDeletion();
  const [confirmClear, setConfirmClear] = useState(false);

  // Rows waiting out their Undo window are hidden; their unread count leaves the header too.
  const waiting = deletion.pendingIds;
  const visible = notifications.filter((n) => !waiting.has(n.id));
  const hiddenUnread = notifications.filter((n) => waiting.has(n.id) && !n.read_at).length;
  const shownUnread = Math.max(0, unreadCount - hiddenUnread);
  const groups = groupNotificationsByDay(visible);

  const markAllRead = async () => {
    try { await api.markAllNotificationsRead(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Could not mark notifications as read.', 'error'); }
  };

  const openNotification = (notif: NotificationRow) => {
    const target = resolveNotificationTarget('provider', notif.data ?? {});
    if (!notif.read_at) void api.markNotificationRead(notif.id).catch((err: Error) => showToast(err.message, 'error'));
    if (target.kind === 'chat') onOpenChat(target.jobId);
    else if (target.kind === 'dispute') onOpenDispute(target.jobId);
    else if (target.kind === 'services') onOpenServices();
    else if (target.kind === 'job') onOpenJob(target.jobId);
  };

  const renderRow = (notif: NotificationRow) => {
    // The same resolver that decides where a tap goes tells chat and complaint
    // notifications apart from job updates; the icon follows what happened.
    const kind = resolveNotificationTarget('provider', notif.data ?? {}).kind;
    const tone = notificationTone({ title: notif.title, body: notif.body, type: notif.type });
    const icon = NOTIFICATION_ICONS[notificationIconName({ type: notif.type, title: notif.title, body: notif.body, kind, tone })];
    return (
      <NotificationCard
        key={notif.id}
        title={notif.title}
        body={notif.body}
        time={timeAgo(notif.created_at)}
        tone={tone}
        icon={icon}
        unread={!notif.read_at}
        onPress={() => openNotification(notif)}
        onDelete={() => deletion.removeWithUndo(notif.id)}
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

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length > 0 && (
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

        {loading && <ContentSkeleton variant="list" />}
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && visible.length === 0 && (
          <EmptyCard>
            <EmptyRow
              icon={BellRing}
              title="You're all caught up"
              body="Job invites, proposal updates, bookings and messages will show up here."
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

    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
  });
  return { Colors, V6Colors, C, styles };
}
