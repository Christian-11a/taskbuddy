import * as React from "react";
import { cn } from "@/lib/utils";

/** The console's standard surface: white (or raised charcoal) card with an
 *  optional titled header row. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  as: Comp = "section",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Comp className={cn("flex min-w-0 flex-col rounded-[12px] border border-border bg-surface shadow-ui-sm", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("min-w-0 flex-1 px-5 pb-5 pt-3", bodyClassName)}>{children}</div>
    </Comp>
  );
}

/** Page title block used at the top of every rebuilt admin page. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-medium text-subtle">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Quiet placeholder for "nothing here" states. */
export function EmptyState({ icon, title, description, action, className }: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-1 grid size-10 place-items-center rounded-full bg-surface-2 text-subtle [&_svg]:size-5">{icon}</div>}
      <div className="text-[13.5px] font-medium">{title}</div>
      {description && <div className="max-w-sm text-[12.5px] text-muted-foreground">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
