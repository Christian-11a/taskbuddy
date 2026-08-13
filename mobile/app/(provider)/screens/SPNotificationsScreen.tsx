/**
 * SPNotificationsScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-notifications screen —
 * flat white .topbar (not a dark hero), a single bordered .notification-list
 * card with hairline-divided .notif-row items (no date-group headers — the
 * mockup renders one flat list), unread rows tinted `#f2fbfd` with a small
 * dot, read rows plain. Same pattern as HONotificationsScreen.tsx.
 */

import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  CircleCheckBig,
} from 'lucide-react-native';
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
}

const ICON_BY_TYPE: Record<string, typeof BriefcaseBusiness> = {
  recommendation_invite: BriefcaseBusiness,
  application_update: CircleCheckBig,
  job_update: AlertTriangle,
};

interface SPNotificationsScreenProps {
  onBack: () => void;
}

export default function SPNotificationsScreen({ onBack }: SPNotificationsScreenProps) {
  const { data, loading, error, reload } = useAsyncData(
    () => api.notifications() as Promise<NotificationRow[]>,
    [],
  );
  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    reload();
  };

  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    reload();
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
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {loading && <ActivityIndicator style={{ marginTop: 20 }} color={C.cyan700} />}
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
                <TouchableOpacity
                  key={notif.id}
                  style={[
                    styles.notifRow,
                    i < notifications.length - 1 && styles.notifRowBorder,
                    isUnread && styles.notifRowUnread,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => isUnread && markRead(notif.id)}
                >
                  <View style={[styles.notifIcon, isUnread && styles.notifIconUnread]}>
                    <Icon size={19} color={C.cyan700} />
                  </View>
                  <View style={{ flex: 1, paddingRight: isUnread ? 10 : 0 }}>
                    <Text style={styles.notifTitle}>{notif.title}</Text>
                    <Text style={styles.notifBody}>{notif.body}</Text>
                    <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
                  </View>
                  {isUnread && <View style={styles.unreadDot} />}
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

  notificationList: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, overflow: 'hidden',
  },
  notifRow: { flexDirection: 'row', gap: 11, padding: 14, position: 'relative' },
  notifRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  notifRowUnread: { backgroundColor: '#f2fbfd' },
  notifIcon: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: '#f7f9fb', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifIconUnread: { backgroundColor: C.white },
  notifTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
  notifBody: { color: C.ink500, fontSize: 12.5, fontFamily: 'Inter', lineHeight: 16.5, marginTop: 3 },
  notifTime: { color: C.ink300, fontSize: 11.5, fontFamily: 'Inter', marginTop: 4 },
  unreadDot: {
    position: 'absolute', right: 13, top: 17,
    width: 7, height: 7, borderRadius: 4, backgroundColor: C.cyan500,
  },
});
