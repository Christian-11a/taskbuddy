/**
 * SPNotificationsScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-notifications screen —
 * flat white .topbar (not a dark hero), a single bordered .notification-list
 * card with hairline-divided .notif-row items (no date-group headers — the
 * mockup renders one flat list), unread rows tinted `#f2fbfd` with a small
 * dot, read rows plain. Same pattern as HONotificationsScreen.tsx.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  CircleCheckBig,
  Trash2,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { useNotificationDeletion } from '../../../src/hooks/useNotificationDeletion';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useNotifications } from '../../../src/context/NotificationsContext';
import { showToast } from '../../../src/components/Toast';
import { api } from '../../../src/lib/api';
import { timeAgo } from '../../../src/lib/format';
import { resolveNotificationTarget } from '../../../src/lib/notificationRouting';

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

const ICON_BY_TYPE: Record<string, typeof BriefcaseBusiness> = {
  recommendation_invite: BriefcaseBusiness,
  application_update: CircleCheckBig,
  job_update: AlertTriangle,
};

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
  const { notifications: data, loading, error, reload, unreadCount } = useNotifications();  const deletion = useNotificationDeletion();
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<NotificationRow | null>(null);
  const notifications = data;

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

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a dark hero) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <Tap onPress={markAllRead} activeOpacity={0.8}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Tap>
        )}
        {unreadCount === 0 && notifications.length > 0 && (
          <Tap onPress={() => setConfirmClear(true)} activeOpacity={0.8}>
            <Text style={styles.markAllText}>Clear all</Text>
          </Tap>
        )}
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
        visible={pendingDelete !== null}
        title="Delete notification?"
        message={pendingDelete ? `Delete “${pendingDelete.title}” from your notifications?` : ''}
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (!pendingDelete) return;
          const id = pendingDelete.id;
          setPendingDelete(null);
          void deletion.remove(id);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {loading && <ContentSkeleton variant="list" />}
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && notifications.length === 0 && (
          <Text style={styles.stateText}>You have no notifications yet.</Text>
        )}

        {notifications.length > 0 && (
          <View style={styles.notificationList}>
            {notifications.map((notif, i) => {
              const Icon = ICON_BY_TYPE[notif.type] ?? BriefcaseBusiness;
              const isUnread = !notif.read_at;
              return (
                <Tap
                  key={notif.id}
                  style={[
                    styles.notifRow,
                    i < notifications.length - 1 && styles.notifRowBorder,
                    isUnread && styles.notifRowUnread,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => openNotification(notif)}
                >
                  <View style={[styles.notifIcon, isUnread && styles.notifIconUnread]}>
                    <Icon size={19} color={V6Colors.link} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle}>{notif.title}</Text>
                    <Text style={styles.notifBody}>{notif.body}</Text>
                    <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
                  </View>
                  {isUnread && <View style={styles.unreadDot} />}
                  <Tap
                    style={styles.deleteBtn}
                    onPress={() => setPendingDelete(notif)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete notification: ${notif.title}`}
                  >
                    <Trash2 size={16} color={C.ink300} />
                  </Tap>
                </Tap>
              );
            })}
          </View>
        )}
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
    markAllText: { color: V6Colors.link, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 14, paddingBottom: 20 },

    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },

    notificationList: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: 16, overflow: 'hidden',
    },
    notifRow: { flexDirection: 'row', gap: 11, padding: 14, position: 'relative' },
    notifRowBorder: { borderBottomWidth: 1, borderBottomColor: V6Colors.wellBg },
    notifRowUnread: { backgroundColor: V6Colors.infoSurface },
    notifIcon: {
      width: 34, height: 34, borderRadius: 12,
      backgroundColor: V6Colors.canvas, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    notifIconUnread: { backgroundColor: C.surface },
    notifTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
    notifBody: { color: C.ink500, fontSize: 12.5, fontFamily: 'Inter', lineHeight: 16.5, marginTop: 3 },
    notifTime: { color: C.ink300, fontSize: 11.5, fontFamily: 'Inter', marginTop: 4 },
    deleteBtn: { alignSelf: 'center', padding: 4 },
    unreadDot: {
      position: 'absolute', left: 6, top: 17,
      width: 7, height: 7, borderRadius: 4, backgroundColor: C.cyan500,
    },
  });
  return { Colors, V6Colors, C, styles };
}
