"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, ShieldCheck, Trash2, WalletCards, Wrench, type LucideIcon } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { displayCount, QUEUE_IDS, totalAttention, type QueueId } from "@/lib/attention";
import type { InboxEntry } from "@/lib/inbox";
import type { Page } from "@/lib/domain";
import { pageToPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useAdminInbox } from "@/hooks/useAdminInbox";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const QUEUE_PAGE: Record<QueueId, Page> = {
  verifications: "verifications",
  disputes: "disputes",
  withdrawals: "withdrawals",
  "skill-requests": "skill-requests",
};

/** The queue's name as the console's navigation and summary use it. */
const QUEUE_LABEL: Record<QueueId, string> = {
  verifications: "Verifications",
  disputes: "Disputes",
  withdrawals: "Failed payouts",
  "skill-requests": "Service requests",
};

const QUEUE_ICON: Record<QueueId, LucideIcon> = {
  verifications: ShieldCheck,
  disputes: AlertTriangle,
  withdrawals: WalletCards,
  "skill-requests": Wrench,
};

const QUEUE_TONE: Record<QueueId, string> = {
  verifications: "text-warn",
  disputes: "text-danger",
  withdrawals: "text-warn",
  "skill-requests": "text-warn",
};

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function announce(unread: number): string {
  return unread === 1 ? "1 unread notification" : `${unread} unread notifications`;
}

/**
 * The admin's notification bell and inbox. The inbox (see useAdminInbox) keeps
 * new-work entries until they are read or deleted, and clears them when their
 * queue is handled. The badge counts unread entries. The pending-work summary
 * below shows the live queue numbers, the same ones the sidebar uses.
 */
export function NotificationsMenu() {
  const { queueCounts } = useApp();
  const inbox = useAdminInbox();
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  /** Set when the panel closes to show the confirmation, so focus stays in the dialog. */
  const keepFocusInDialog = useRef(false);
  const titleId = useId();
  const hintId = useId();

  const unread = inbox.unread;
  const caughtUp = QUEUE_IDS.every((id) => queueCounts[id] !== null) && totalAttention(queueCounts) === 0;
  // An entry can clear on its own while selected; only ids still listed count.
  const selectedIds = selected.filter((id) => inbox.entries.some((e) => e.id === id));

  function closePanel() {
    setOpen(false);
    setSelecting(false);
    setSelected([]);
  }

  function toggleSelected(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function openEntry(entry: InboxEntry) {
    inbox.markRead(entry.id);
    closePanel();
  }

  function deleteSelected() {
    inbox.removeMany(selectedIds);
    setSelected([]);
  }

  function askClearAll() {
    keepFocusInDialog.current = true;
    closePanel();
    setConfirmingClear(true);
  }

  function closeClearDialog() {
    setConfirmingClear(false);
    bellRef.current?.focus();
  }

  return (
    <>
      <span className="sr-only" aria-live="polite">{unread > 0 ? announce(unread) : ""}</span>
      <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : closePanel())}>
        <PopoverTrigger asChild>
          <Button
            ref={bellRef}
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
          >
            <Bell />
            <AnimatePresence>
              {unread > 0 && (
                <motion.span
                  key={unread}
                  aria-hidden="true"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 26 }}
                  className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold tabular text-on-solid ring-2 ring-surface"
                >
                  {unread > 99 ? "99+" : unread}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          aria-labelledby={titleId}
          className="w-[360px] max-w-[calc(100vw-2rem)] p-0"
          onCloseAutoFocus={(e) => {
            if (keepFocusInDialog.current) {
              e.preventDefault(); // the confirmation takes focus; don't pull it back to the bell
              keepFocusInDialog.current = false;
            }
          }}
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
            <h2 id={titleId} className="text-[13px] font-semibold">Inbox</h2>
            {unread > 0 && <span className="text-[12px] tabular text-muted-foreground">{unread} unread</span>}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
            <Button size="sm" variant="ghost" onClick={inbox.markAllRead} disabled={unread === 0}>
              <CheckCheck /> Mark all as read
            </Button>
            {inbox.entries.length > 0 && !selecting && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelecting(true)}>
                Select
              </Button>
            )}
            {selecting && (
              <div className="ml-auto flex items-center gap-1.5">
                <Button size="sm" variant="destructive-outline" onClick={deleteSelected} disabled={selectedIds.length === 0}>
                  <Trash2 /> {selectedIds.length > 0 ? `Delete selected (${selectedIds.length})` : "Delete selected"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setSelecting(false); setSelected([]); }}>
                  Done
                </Button>
              </div>
            )}
          </div>

          <div className="max-h-[340px] overflow-y-auto border-t border-border">
            {inbox.entries.length > 0 ? (
              <ul aria-label="Notifications" className="space-y-0.5 p-1.5">
                {inbox.entries.map((entry) => (
                  <InboxRow
                    key={entry.id}
                    entry={entry}
                    selecting={selecting}
                    checked={selectedIds.includes(entry.id)}
                    onToggle={toggleSelected}
                    onOpen={openEntry}
                    onDelete={inbox.remove}
                  />
                ))}
              </ul>
            ) : caughtUp ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <CheckCircle2 className="size-6 text-ok" aria-hidden="true" />
                <span className="text-[13px] font-medium">All caught up!</span>
                <span className="text-[12px] text-muted-foreground">Nothing is waiting for review.</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <span className="text-[13px] font-medium">No notifications yet</span>
                <span className="text-[12px] text-muted-foreground">New work shows up here as it arrives.</span>
              </div>
            )}
          </div>

          <div className="border-t border-border px-2 pb-1.5 pt-2">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Pending work</div>
            {QUEUE_IDS.map((id) => {
              const n = queueCounts[id];
              const Icon = QUEUE_ICON[id];
              return (
                <Link
                  key={id}
                  href={pageToPath(QUEUE_PAGE[id])}
                  onClick={closePanel}
                  className="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-[13px] outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="flex-1">{QUEUE_LABEL[id]}</span>
                  {n === null ? (
                    <span className="text-[12px] text-muted-foreground">Couldn&apos;t check</span>
                  ) : (
                    <span className={cn("tabular", n > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {displayCount(n) ?? "0"}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {inbox.entries.length > 0 && (
            <div className="border-t border-border p-3">
              <Button
                variant="destructive-outline"
                size="sm"
                className="w-full"
                onClick={askClearAll}
                disabled={!inbox.canDeleteAll}
                aria-describedby={inbox.canDeleteAll ? undefined : hintId}
              >
                <Trash2 /> Delete all
              </Button>
              {!inbox.canDeleteAll && (
                <p id={hintId} className="mt-2 text-center text-[11.5px] text-muted-foreground">
                  Mark every notification as read to clear the inbox.
                </p>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={confirmingClear}
        title="Delete all notifications?"
        message="This clears the inbox in this browser. Pending work stays in the queues and on the sidebar."
        confirmLabel="Delete all"
        cancelLabel="Cancel"
        onConfirm={() => {
          inbox.removeAll();
          closeClearDialog();
        }}
        onCancel={closeClearDialog}
      />
    </>
  );
}

interface InboxRowProps {
  entry: InboxEntry;
  selecting: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpen: (entry: InboxEntry) => void;
  onDelete: (id: string) => void;
}

function InboxRow({ entry, selecting, checked, onToggle, onOpen, onDelete }: InboxRowProps) {
  const Icon = QUEUE_ICON[entry.queue];
  const content = (
    <>
      <Icon className={cn("mt-0.5 size-4 shrink-0", QUEUE_TONE[entry.queue])} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px]", entry.read ? "text-muted-foreground" : "font-semibold text-foreground")}>
          {!entry.read && <span className="sr-only">Unread: </span>}
          {entry.title}
        </span>
        <span className="block text-[11.5px] text-subtle">{`${QUEUE_LABEL[entry.queue]} · ${formatWhen(entry.createdAt)}`}</span>
      </span>
      {!entry.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
    </>
  );
  const rowClass = "flex min-w-0 flex-1 items-start gap-2.5 rounded-[8px] px-2 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

  if (selecting) {
    return (
      <li>
        <label className={cn(rowClass, "cursor-pointer hover:bg-accent")}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(entry.id)}
            aria-label={entry.title}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          {content}
        </label>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1 rounded-[8px] hover:bg-accent focus-within:bg-accent">
      <Link href={pageToPath(QUEUE_PAGE[entry.queue])} onClick={() => onOpen(entry)} className={rowClass}>
        {content}
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete notification: ${entry.title}`}
        onClick={() => onDelete(entry.id)}
        className="mr-1 shrink-0 text-subtle hover:text-danger"
      >
        <Trash2 />
      </Button>
    </li>
  );
}
