import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import { showToast } from '../components/Toast';

/**
 * Optimistic delete for the notification lists: a row disappears as soon as
 * it is deleted, and comes back (with a toast) only if the request fails.
 */
export function useNotificationDeletion(reload: () => void) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [cleared, setCleared] = useState(false);

  const remove = useCallback(
    async (id: string) => {
      setHidden((prev) => new Set(prev).add(id));
      try {
        await api.deleteNotification(id);
      } catch {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        showToast('Could not delete that notification.', 'error');
      }
    },
    [],
  );

  const clearAll = useCallback(async () => {
    setCleared(true);
    try {
      await api.clearNotifications();
      showToast('Notifications cleared', 'success');
    } catch {
      setCleared(false);
      showToast('Could not clear your notifications.', 'error');
    }
    reload();
  }, [reload]);

  const visible = useCallback(
    <T extends { id: string }>(rows: T[]) => (cleared ? [] : rows.filter((r) => !hidden.has(r.id))),
    [cleared, hidden],
  );

  return { visible, remove, clearAll };
}
