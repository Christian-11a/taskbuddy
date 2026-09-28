import * as React from "react";
import { cn } from "@/lib/utils";

/** A keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-surface-2 px-1.5 font-sans text-[10.5px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
