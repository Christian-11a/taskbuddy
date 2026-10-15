import { cn } from "@/lib/utils";
import type { CaseEntry } from "@/lib/domain";

/** Human label for each case entry kind. Unknown kinds fall back to the raw kind. */
export const ENTRY_LABEL: Record<string, string> = {
  statement: "Statement",
  appeal: "Appeal",
  clarification: "Admin asked for clarification",
  resolution: "Decision",
  cancellation_response: "Cancellation response",
  system: "System",
};

function labelFor(kind: string): string {
  if (Object.prototype.hasOwnProperty.call(ENTRY_LABEL, kind)) return ENTRY_LABEL[kind];
  const raw = kind.trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Update";
}

/** Dot colour per author role. The role name is also written out, so colour is never the only cue. */
const DOT: Record<string, string> = {
  client: "bg-muted-foreground",
  provider: "bg-primary",
  admin: "bg-info",
  system: "bg-subtle",
};

function roleName(role: string, clientName: string, providerName: string): string {
  if (role === "client") return clientName;
  if (role === "provider") return providerName;
  return "Admin";
}

const ROLE_TEXT: Record<string, string> = { client: "Client", provider: "Provider", admin: "Admin" };

function timeOrder(entry: CaseEntry): number {
  return Date.parse(entry.created_at) || 0;
}

/**
 * A complaint's activity as a readable timeline, oldest first. Entries with no
 * author are system events and show no person's name.
 */
export function CaseTimeline({
  entries,
  clientName,
  providerName,
}: {
  entries: CaseEntry[];
  clientName: string;
  providerName: string;
}) {
  if (entries.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">No case activity yet.</p>;
  }

  const ordered = [...entries].sort((a, b) => timeOrder(a) - timeOrder(b));

  return (
    <ol aria-label="Case timeline" className="space-y-3">
      {ordered.map((entry) => {
        const role = entry.author?.role ?? "system";
        const when = new Date(entry.created_at);
        const validWhen = !Number.isNaN(when.getTime());
        const person = entry.author
          ? entry.author.full_name || roleName(role, clientName, providerName)
          : null;
        const roleText = entry.author ? ROLE_TEXT[role] : null;

        return (
          <li key={entry.id} className="rounded-[10px] border border-border bg-surface-2/50 p-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[role] ?? DOT.system)} />
              <span className="font-semibold text-foreground">{labelFor(entry.kind)}</span>
              {person && (
                <span className="text-muted-foreground">
                  · {person}
                  {roleText && <span className="text-subtle"> ({roleText})</span>}
                </span>
              )}
              {validWhen && (
                <time
                  dateTime={entry.created_at}
                  title={when.toLocaleString()}
                  className="tabular ml-auto text-[11.5px] text-subtle"
                >
                  {when.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </time>
              )}
            </div>

            {entry.body && (
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{entry.body}</p>
            )}

            {entry.message?.body && (
              <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-[12.5px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Job chat evidence:</span> &ldquo;{entry.message.body}&rdquo;
              </blockquote>
            )}

            {entry.attachment_url && (
              <a
                href={entry.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
              >
                View photo evidence
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
