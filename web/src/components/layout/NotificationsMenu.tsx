"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCircle2, ShieldCheck, WalletCards, Wrench, type LucideIcon } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { displayCount, QUEUE_IDS, totalAttention, type QueueId } from "@/lib/attention";
import type { Page } from "@/lib/domain";
import { pageToPath } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MAX_PER_KIND = 5;

const QUEUE_PAGE: Record<QueueId, Page> = {
  verifications: "verifications",
  disputes: "disputes",
  withdrawals: "withdrawals",
  "skill-requests": "skill-requests",
};

/** The words used in the "Review ..." footer link. */
const REVIEW_LABEL: Record<QueueId, string> = {
  verifications: "verifications",
  disputes: "disputes",
  withdrawals: "withdrawals",
  "skill-requests": "service requests",
};

/** Queues shown as one summary row each (their items are not listed here). */
const SUMMARY_QUEUES: { id: "withdrawals" | "skill-requests"; icon: LucideIcon; label: string; one: string; many: string }[] = [
  { id: "withdrawals", icon: WalletCards, label: "withdrawals", one: "withdrawal waiting to be paid", many: "withdrawals waiting to be paid" },
  { id: "skill-requests", icon: Wrench, label: "service requests", one: "service request to review", many: "service requests to review" },
];

/**
 * Everything that needs an admin: pending verifications and open disputes
 * (listed by name), plus a summary row for each other queue. The badge and the
 * "All caught up" state come from `queueCounts`, so a queue that failed to load
 * (`null`) is shown as unknown, never as empty.
 */
export function NotificationsMenu() {
  const { verifications, disputes, queueCounts } = useApp();
  const pending = verifications.filter((v) => v.status === "pending");
  const open = disputes.filter((d) => d.isOpen);
  const total = totalAttention(queueCounts);
  const allLoaded = QUEUE_IDS.every((id) => queueCounts[id] !== null);
  const caughtUp = allLoaded && total === 0;
  const firstWaiting = QUEUE_IDS.find((id) => (queueCounts[id] ?? 0) > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={total > 0 ? `Notifications (${total} need attention)` : "Notifications"}>
          <Bell />
          <AnimatePresence>
            {total > 0 && (
              <motion.span
                key={total}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 26 }}
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold tabular text-on-solid ring-2 ring-surface"
              >
                {total > 99 ? "99+" : total}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[340px] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] font-semibold">Needs your attention</span>
          {total > 0 && <span className="text-[12px] tabular text-muted-foreground">{total} open</span>}
        </div>
        <DropdownMenuSeparator className="my-0" />
        {caughtUp ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <CheckCircle2 className="size-6 text-ok" aria-hidden="true" />
            <span className="text-[13px] font-medium">All caught up!</span>
            <span className="text-[12px] text-muted-foreground">Nothing is waiting for review.</span>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto p-1">
            {pending.length > 0 && <DropdownMenuLabel>Pending verifications</DropdownMenuLabel>}
            {pending.slice(0, MAX_PER_KIND).map((v) => (
              <DropdownMenuItem key={v.id} asChild>
                <Link href={pageToPath("verifications")} className="items-start">
                  <ShieldCheck className="mt-0.5 !text-warn" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v.name} needs verification</span>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {v.method === "stripe_identity"
                        ? `Stripe Identity check · Submitted ${v.date}`
                        : `${v.documents.length} document${v.documents.length === 1 ? "" : "s"} · Submitted ${v.date}`}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
            {open.length > 0 && <DropdownMenuLabel>Open disputes</DropdownMenuLabel>}
            {open.slice(0, MAX_PER_KIND).map((d) => (
              <DropdownMenuItem key={d.id} asChild>
                <Link href={pageToPath("disputes")} className="items-start">
                  <AlertTriangle className="mt-0.5 !text-danger" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.jobTitle}: dispute raised</span>
                    <span className="block text-[11.5px] text-muted-foreground">{d.clientName} · {d.amount} · {d.createdAt}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
            {SUMMARY_QUEUES.map(({ id, icon: Icon, label, one, many }) => {
              const n = queueCounts[id];
              if (n === null) {
                return (
                  <div key={id} className="px-2.5 py-2 text-[12px] text-muted-foreground">
                    {`Couldn't check ${label}. Retrying…`}
                  </div>
                );
              }
              if (n <= 0) return null;
              return (
                <DropdownMenuItem key={id} asChild>
                  <Link href={pageToPath(QUEUE_PAGE[id])} className="items-start">
                    <Icon className="mt-0.5 !text-warn" />
                    <span className="min-w-0 font-medium">
                      {`${displayCount(n)} ${n === 1 ? one : many}`}
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
        {firstWaiting && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="p-1">
              <DropdownMenuItem asChild>
                <Link href={pageToPath(QUEUE_PAGE[firstWaiting])} className="justify-center font-medium text-primary">
                  {`Review ${REVIEW_LABEL[firstWaiting]}`}
                </Link>
              </DropdownMenuItem>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
