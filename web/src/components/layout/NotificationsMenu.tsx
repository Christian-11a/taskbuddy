"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCircle2, ShieldCheck } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { pageToPath } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MAX_PER_KIND = 5;

/** Pending verifications and open disputes — the two things that need an admin now. */
export function NotificationsMenu() {
  const { verifications, disputes } = useApp();
  const pending = verifications.filter((v) => v.status === "pending");
  const open = disputes.filter((d) => d.isOpen);
  const count = pending.length + open.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={count > 0 ? `Notifications (${count} need attention)` : "Notifications"}>
          <Bell />
          <AnimatePresence>
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 26 }}
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold tabular text-on-solid ring-2 ring-surface"
              >
                {count > 99 ? "99+" : count}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[340px] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] font-semibold">Needs your attention</span>
          {count > 0 && <span className="text-[12px] tabular text-muted-foreground">{count} open</span>}
        </div>
        <DropdownMenuSeparator className="my-0" />
        {count === 0 ? (
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
                      {v.documents.length} document{v.documents.length === 1 ? "" : "s"} · Submitted {v.date}
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
          </div>
        )}
        {count > 0 && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="p-1">
              <DropdownMenuItem asChild>
                <Link href={pageToPath(pending.length > 0 ? "verifications" : "disputes")} className="justify-center font-medium text-primary">
                  Review {pending.length > 0 ? "verifications" : "disputes"}
                </Link>
              </DropdownMenuItem>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
