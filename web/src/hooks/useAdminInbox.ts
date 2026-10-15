"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import type { QueueCounts } from "@/lib/attention";
import {
  INBOX_KEY,
  applyReading,
  canDeleteAll as canDeleteAllEntries,
  deleteAll,
  deleteEntry,
  deleteMany,
  loadInbox,
  makeEntryId,
  markAllRead as markAllEntriesRead,
  markRead as markEntryRead,
  parseInbox,
  saveInbox,
  unreadCount,
  type InboxEntry,
} from "@/lib/inbox";

/**
 * The admin's notification inbox for this browser. New work that arrives while
 * the console is open becomes an unread entry; entries clear themselves when
 * their queue is handled. Pending-work numbers (sidebar, tab title) are not
 * stored here: they still come straight from `queueCounts`.
 */
export function useAdminInbox() {
  const { queueCounts, lastUpdated, isLoggedIn } = useApp();
  const [entries, setEntries] = useState<InboxEntry[]>(() => loadInbox());
  /** The counts from the previous real reading. Null until the first one this session. */
  const previous = useRef<QueueCounts | null>(null);
  /** The lastUpdated in force when the admin signed out. The context keeps the
   *  old counts after logout, so until lastUpdated changes they are not a reading. */
  const signedOutAt = useRef<number | null>(null);

  useEffect(() => {
    saveInbox(entries);
  }, [entries]);

  // Another open tab may have written the inbox. Take its copy rather than
  // overwriting it with this tab's older one.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === INBOX_KEY) setEntries(parseInbox(e.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Each new reading of the counts: rises become entries, handled queues clear.
  useEffect(() => {
    if (!isLoggedIn) {
      previous.current = null;
      signedOutAt.current = lastUpdated;
      return;
    }
    if (lastUpdated === null || lastUpdated === signedOutAt.current) return; // no load of this session yet
    const prev = previous.current;
    previous.current = queueCounts;
    const now = Date.now();
    setEntries((current) => applyReading(current, prev, queueCounts, now, () => makeEntryId(now)));
  }, [isLoggedIn, queueCounts, lastUpdated]);

  const markRead = useCallback((id: string) => setEntries((cur) => markEntryRead(cur, id)), []);
  const markAllRead = useCallback(() => setEntries((cur) => markAllEntriesRead(cur)), []);
  const remove = useCallback((id: string) => setEntries((cur) => deleteEntry(cur, id)), []);
  const removeMany = useCallback((ids: string[]) => setEntries((cur) => deleteMany(cur, ids)), []);
  /** Only clears a fully read inbox; the UI also disables the button until then. */
  const removeAll = useCallback(() => setEntries((cur) => deleteAll(cur)), []);

  return {
    entries,
    unread: unreadCount(entries),
    canDeleteAll: canDeleteAllEntries(entries),
    markRead,
    markAllRead,
    remove,
    removeMany,
    removeAll,
  };
}
