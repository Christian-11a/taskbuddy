import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Status pills. Colour carries meaning: warn = needs review, danger =
 *  problem, ok = done, info = in progress, neutral = inactive. */
export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-soft text-neutral",
        accent: "bg-primary-soft text-primary",
        warn: "bg-warn-soft text-warn",
        danger: "bg-danger-soft text-danger",
        ok: "bg-ok-soft text-ok",
        info: "bg-info-soft text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Leading status dot. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
