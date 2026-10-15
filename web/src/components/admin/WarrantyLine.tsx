"use client";

import { Check, Clock } from "lucide-react";
import { formatHoursLeft, warrantyStatus } from "@/lib/warranty";

/**
 * The 72-hour warranty after a job completes, for admin drawers. Shows nothing
 * when the job has no usable completion time.
 */
export function WarrantyLine({ completedAt, escrowStatus }: { completedAt: string | null; escrowStatus: string | null }) {
  const warranty = warrantyStatus(completedAt, new Date());

  if (warranty.state === "none") return null;

  if (warranty.state === "closed") {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Check className="size-3.5 shrink-0" /> Warranty closed
      </p>
    );
  }

  const held = escrowStatus === "IN_ESCROW";
  return (
    <div className="space-y-1 text-[12.5px]">
      <p className="flex items-center gap-2 font-medium text-warn">
        <Clock className="size-3.5 shrink-0" /> Warranty open · {formatHoursLeft(warranty.hoursLeft)}
      </p>
      {held && <p className="pl-[22px] text-muted-foreground">Payment is held until the warranty ends</p>}
    </div>
  );
}
