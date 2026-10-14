import { useState } from 'react';
import { api } from '../lib/api';
import { showToast } from '../components/Toast';

/** The confirm title for deleting `count` chosen notifications. */
export function deleteTitle(count: number): string {
  return `Delete ${count} notification${count === 1 ? '' : 's'}?`;
}

/** The toast for a batch delete: all removed, or how many were and how many were not. */
export function deletedToast(total: number, failed: number): { text: string; kind: 'success' | 'error' } {
  const noun = total === 1 ? 'notification' : 'notifications';
  if (failed === 0) return { text: `Deleted ${total} ${noun}`, kind: 'success' };
  return { text: `Deleted ${total - failed} of ${total} — ${failed} couldn't be removed`, kind: 'error' };
}

/**
 * Select mode for a notifications list: long-press a row to start, toggle rows, then delete the chosen
 * ones one by one. A delete that fails is counted and the rest still go; the failed rows stay in the list
 * (the list drops a row only when its delete succeeds). Select mode ends when nothing is chosen, or after a delete.
 */
export function useNotificationSelection(ids: string[]) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);

  const cancel = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const start = (id: string) => {
    setSelecting(true);
    setSelected(new Set([id]));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) cancel();
    else setSelected(next);
  };

  const selectAll = () => setSelected(new Set(ids));

  const deleteSelected = async () => {
    const chosen = ids.filter((id) => selected.has(id));
    setDeleting(true);
    let failed = 0;
    for (const id of chosen) {
      try {
        await api.deleteNotification(id);
      } catch {
        failed += 1;
      }
    }
    setDeleting(false);
    cancel();
    const toast = deletedToast(chosen.length, failed);
    showToast(toast.text, toast.kind);
  };

  return { selecting, selected, deleting, start, toggle, selectAll, cancel, deleteSelected };
}
