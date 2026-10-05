export type NotificationChange =
  | { kind: 'read' | 'delete'; id: string }
  | { kind: 'readAll' }
  | { kind: 'clear' };
const listeners = new Set<(change: NotificationChange) => void>();
export function notifyNotificationChange(change: NotificationChange) {
  listeners.forEach((listener) => listener(change));
}
export function subscribeNotificationChanges(
  listener: (change: NotificationChange) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
