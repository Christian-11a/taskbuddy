import { useCallback } from 'react';
import { api } from '../lib/api';
import { showToast } from '../components/Toast';

/** Shared notification state changes after the server confirms each mutation. */
export function useNotificationDeletion() {
  const remove = useCallback(async (id: string) => {
    try {
      await api.deleteNotification(id);
    } catch {
      showToast('Could not delete that notification.', 'error');
    }
  }, []);
  const clearAll = useCallback(async () => {
    try {
      await api.clearNotifications();
      showToast('Notifications cleared', 'success');
    } catch {
      showToast('Could not clear your notifications.', 'error');
    }
  }, []);
  return { remove, clearAll };
}
