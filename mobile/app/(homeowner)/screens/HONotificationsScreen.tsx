/**
 * HONotificationsScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-notifications screen —
 * flat white .topbar (not a dark hero), a single bordered .notification-list
 * card with hairline-divided .notif-row items (no date-group headers — the
 * mockup renders one flat list), unread rows tinted `#f2fbfd` with a small
 * dot, read rows plain.
 *
 * A notification about a job opens it: "New application" goes straight to
 * that job's proposals, anything else to the job itself. Each row can be
 * deleted, and "Clear all" empties the list.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  BellRing,
  CircleCheckBig,
  Trash2,
  Trophy,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { useNotificationDeletion } from '../../../src/hooks/useNotificationDeletion';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';

const C = V6Colors;
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { timeAgo } from '../../../src/lib/format';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  /** Job/application updates carry the job (and application) they are about. */
  data: { job_id?: string; application_id?: string } | null;
}

const ICON_BY_TYPE: Record<string, typeof BellRing> = {
  recommendation_invite: Trophy,
  application_update: CircleCheckBig,
  job_update: BellRing,
};

interface HONotificationsProps {
  onBack: () => void;
  onOpenJob: (jobId: string) => void;
  /** The job's Proposals screen — where a new application is reviewed. */
  onOpenProposals: (jobId: string) => void;
}

export default function HONotificationsScreen({ onBack, onOpenJob, onOpenProposals }: HONotificationsProps) {
  const { data, loading, error, reload } = useAsyncData(
    () => api.notifications() as Promise<NotificationRow[]>,
    [],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReadId, setPendingReadId] = useState<string | null>(null);
  const deletion = useNotificationDeletion(reload);
  const [confirmClear, setConfirmClear] = useState(false);
  const notifications = deletion.visible(data ?? []);
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    try {
      setActionError(null);
      await api.markAllNotificationsRead();
      reload();
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
      reload();
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
    const jobId = notif.data?.job_id;
    if (!jobId) {
      if (!notif.read_at) void markRead(notif.id);
      return;
    }
    if (!notif.read_at) api.markNotificationRead(notif.id).catch(() => {});
    if (notif.data?.application_id) onOpenProposals(jobId);
    else onOpenJob(jobId);
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a dark hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} activeOpacity={0.8}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {unreadCount === 0 && notifications.length > 0 && (
          <TouchableOpacity onPress={() => setConfirmClear(true)} activeOpacity={0.8}>
            <Text style={styles.markAllText}>Clear all</Text>
          </TouchableOpacity>
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

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {actionError && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{actionError}</Text>
            <TouchableOpacity onPress={() => void reload()} activeOpacity={0.8}>
              <Text style={styles.bannerAction}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {loading && <ActivityIndicator style={{ marginTop: 20 }} color={C.cyan700} />}
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && notifications.length === 0 && (
          <Text style={styles.stateText}>You have no notifications yet.</Text>
        )}

        {notifications.length > 0 && (
          <View style={styles.notificationList}>
            {notifications.map((notif, i) => {
              const Icon = ICON_BY_TYPE[notif.type] ?? BellRing;
              const isUnread = !notif.read_at;
              return (
                <TouchableOpacity
                  key={notif.id}
                  style={[
                    styles.notifRow,
                    i < notifications.length - 1 && styles.notifRowBorder,
                    isUnread && styles.notifRowUnread,
                    pendingReadId === notif.id && styles.notifRowPending,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => openNotification(notif)}
                  disabled={pendingReadId === notif.id}
                >
                  <View style={[styles.notifIcon, isUnread && styles.notifIconUnread]}>
                    <Icon size={19} color={C.cyan700} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle}>{notif.title}</Text>
                    <Text style={styles.notifBody}>{notif.body}</Text>
                    <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
                  </View>
                  {isUnread && <View style={styles.unreadDot} />}
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => void deletion.remove(notif.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete notification: ${notif.title}`}
                  >
                    <Trash2 size={16} color={C.ink300} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.27 },
  markAllText: { color: C.cyan700, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 14, paddingBottom: 20 },

  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  bannerText: { flex: 1, color: '#7f1d1d', fontSize: 12.5, fontFamily: 'Inter', lineHeight: 18 },
  bannerAction: { color: C.cyan700, fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter', marginLeft: 12 },

  notificationList: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, overflow: 'hidden',
  },
  notifRow: { flexDirection: 'row', gap: 11, padding: 14, position: 'relative' },
  notifRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  notifRowUnread: { backgroundColor: '#f2fbfd' },
  notifRowPending: { opacity: 0.7 },
  notifIcon: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: '#f7f9fb', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifIconUnread: { backgroundColor: C.white },
  notifTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
  notifBody: { color: C.ink500, fontSize: 12.5, fontFamily: 'Inter', lineHeight: 16.5, marginTop: 3 },
  notifTime: { color: C.ink300, fontSize: 11.5, fontFamily: 'Inter', marginTop: 4 },
  deleteBtn: { alignSelf: 'center', padding: 4 },
  unreadDot: {
    position: 'absolute', left: 6, top: 17,
    width: 7, height: 7, borderRadius: 4, backgroundColor: C.cyan500,
  },
});
