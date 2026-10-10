import { useCallback, useSyncExternalStore } from 'react';
import { api } from '../lib/api';
import { showToast } from '../components/Toast';

/**
 * How long a deleted notification can be undone. Matches the toast's Undo
 * window, so the Undo button and the commit end together.
 */
export const UNDO_WINDOW_MS = 5000;

async function deleteNow(id: string) {
  try {
    await api.deleteNotification(id);
  } catch {
    showToast('Could not delete that notification.', 'error');
  }
}

async function clearNow() {
  try {
    await api.clearNotifications();
    showToast('Notifications cleared', 'success');
  } catch {
    showToast('Could not clear your notifications.', 'error');
  }
}

// Module-level, not per-screen: a screen that unmounts and mounts again keeps
// hiding rows whose delete is still waiting out its Undo window, and each
// timer still commits even if the screen has gone.
type Listener = () => void;
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let waiting: ReadonlySet<string> = new Set();

function publish(next: ReadonlySet<string>) {
  waiting = next;
  listeners.forEach((listener) => listener());
}

function without(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  next.delete(id);
  return next;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getWaiting() {
  return waiting;
}

function undoDelete(id: string) {
  const timer = timers.get(id);
  if (timer === undefined) return;
  clearTimeout(timer);
  timers.delete(id);
  publish(without(waiting, id));
}

/**
 * The window has passed: send the same delete as an immediate one. The row
 * stays hidden while the request is in flight and comes back only if it fails.
 */
async function commitDelete(id: string) {
  timers.delete(id);
  try {
    await deleteNow(id);
  } finally {
    publish(without(waiting, id));
  }
}

/** Shared notification state changes after the server confirms each mutation. */
export function useNotificationDeletion() {
  const pendingIds = useSyncExternalStore(subscribe, getWaiting);

  const remove = useCallback((id: string) => deleteNow(id), []);

  /** Hides the row and offers Undo; the delete is sent only if the window passes. */
  const removeWithUndo = useCallback((id: string) => {
    if (timers.has(id)) return;
    timers.set(id, setTimeout(() => void commitDelete(id), UNDO_WINDOW_MS));
    publish(new Set(waiting).add(id));
    showToast('Notification deleted', 'info', {
      label: 'Undo',
      onPress: () => undoDelete(id),
    });
  }, []);

  const clearAll = useCallback(async () => {
    // A clear removes everything, so deletes still waiting for their window must not fire afterwards.
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    try {
      await clearNow();
    } finally {
      publish(new Set());
    }
  }, []);

  return { remove, clearAll, removeWithUndo, pendingIds };
}
