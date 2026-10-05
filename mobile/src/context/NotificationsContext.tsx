import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { api, type NotificationSnapshot } from '../lib/api';
import { subscribeNotificationChanges } from '../lib/notificationEvents';
import { showToast } from '../components/Toast';
import { useRefreshOnForeground } from '../hooks/useRefreshOnForeground';
import { useAuth } from './AuthContext';

interface NotificationsState extends NotificationSnapshot {
  loading: boolean;
  error: string | null;
  reload: () => void;
}
const NotificationsContext = createContext<NotificationsState | null>(null);
const empty: NotificationSnapshot = { notifications: [], unreadCount: 0 };

/** A single foreground connection for the authenticated account. */
export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, isAuthenticated } = useAuth();
  // Remount account state so neither data nor in-flight work crosses accounts.
  return (
    <AccountNotifications
      key={isAuthenticated ? profile?.id : 'signed-out'}
      enabled={isAuthenticated && !!profile}
    >
      {children}
    </AccountNotifications>
  );
}
function AccountNotifications({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const { role, refreshProfile } = useAuth();
  const [snapshot, setSnapshot] = useState(empty);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const serviceNoticeKey = snapshot.notifications
    .filter((notice) => notice.data?.request_id)
    .map((notice) => notice.id)
    .join(',');
  const refreshServices = useCallback(() => {
    if (!enabled || role !== 'provider') return;
    void refreshProfile().catch((err: unknown) =>
      showToast(
        err instanceof Error ? err.message : 'Could not refresh your services.',
        'error',
      ),
    );
  }, [enabled, role, refreshProfile]);
  useEffect(() => {
    if (serviceNoticeKey) refreshServices();
  }, [serviceNoticeKey, refreshServices]);
  useRefreshOnForeground(refreshServices, enabled && role === 'provider');
  const revision = useRef(0);
  const alive = useRef(true);
  const reload = useCallback(() => {
    if (!enabled || AppState.currentState !== 'active') return;
    const request = ++revision.current;
    void api
      .notificationSnapshot()
      .then((result) => {
        if (alive.current && request === revision.current) {
          setSnapshot(result);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (alive.current && request === revision.current) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load notifications.',
          );
          setLoading(false);
        }
      });
  }, [enabled]);
  useEffect(() => {
    alive.current = true;
    if (!enabled)
      return () => {
        alive.current = false;
      };
    let close: (() => void) | undefined;
    let connection = 0;
    const connect = () => {
      const current = ++connection;
      close = api.streamNotifications(
        (result) => {
          if (!alive.current || current !== connection) return;
          ++revision.current;
          setSnapshot(result);
          setError(null);
          setLoading(false);
        },
        (err) => {
          if (alive.current && current === connection) {
            setError(err.message);
            setLoading(false);
          }
        },
      );
    };
    if (AppState.currentState === 'active') connect();
    const state = AppState.addEventListener('change', (next) => {
      ++connection;
      close?.();
      close = undefined;
      ++revision.current;
      if (next === 'active') connect();
    });
    const unsubscribe = subscribeNotificationChanges((change) => {
      ++revision.current;
      setSnapshot((previous) => {
        const rows = previous.notifications;
        if (change.kind === 'clear') return empty;
        if (change.kind === 'readAll')
          return {
            notifications: rows.map((row) => ({
              ...row,
              read_at: row.read_at ?? new Date().toISOString(),
            })),
            unreadCount: 0,
          };
        const row = rows.find((item) => item.id === change.id);
        return {
          notifications:
            change.kind === 'delete'
              ? rows.filter((item) => item.id !== change.id)
              : rows.map((item) =>
                  item.id === change.id
                    ? {
                        ...item,
                        read_at: item.read_at ?? new Date().toISOString(),
                      }
                    : item,
                ),
          unreadCount: previous.unreadCount - (row && !row.read_at ? 1 : 0),
        };
      });
      ++connection;
      close?.();
      close = undefined;
      if (AppState.currentState === 'active') connect();
    });
    return () => {
      alive.current = false;
      ++connection;
      ++revision.current;
      close?.();
      state.remove();
      unsubscribe();
    };
  }, [enabled, reload]);
  return (
    <NotificationsContext.Provider
      value={{ ...snapshot, loading, error, reload }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context)
    throw new Error('useNotifications requires NotificationsProvider');
  return context;
}
