import * as React from "react";
import { cn } from "@/lib/utils";

/** Loading placeholder; the pulse stops under reduced motion. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-surface-2 motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
