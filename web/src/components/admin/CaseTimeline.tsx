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

/**
 * Who an admin clarification is addressed to. The backend's clarification entry
 * has no recipient field, so the audience is written into the text itself.
 */
export type ClarificationAudience = "both" | "client" | "provider";

/** The text the case form puts in front of a clarification. Read back by parseClarificationAddress. */
export const CLARIFICATION_PREFIX: Record<ClarificationAudience, string> = {
  both: "To both parties: ",
  client: "To the client: ",
  provider: "To the provider: ",
};

/** How an addressed clarification is labelled on the case. */
export const CLARIFICATION_ADDRESS_LABEL: Record<ClarificationAudience, string> = {
  both: "To both parties",
  client: "To the client",
  provider: "To the provider",
};

const ADDRESS_PATTERN = /^To (both parties|the client|the provider): /;
const AUDIENCE_BY_PHRASE: Record<string, ClarificationAudience> = {
  "both parties": "both",
  "the client": "client",
  "the provider": "provider",
};

/**
 * Splits the addressing prefix off a clarification's text. A clarification
 * without a prefix (written before addressing existed) comes back unchanged,
 * with no audience, so nothing is claimed about who it was meant for.
 */
export function parseClarificationAddress(body: string): { audience: ClarificationAudience | null; text: string } {
  const match = ADDRESS_PATTERN.exec(body);
  if (!match) return { audience: null, text: body };
  return { audience: AUDIENCE_BY_PHRASE[match[1]], text: body.slice(match[0].length) };
}

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

/**
 * Party lanes: client statements sit at the start, provider statements at the
 * end, so the two sides read against each other. Admin and system entries span
 * the full width.
 */
const LANE: Record<string, "start" | "end" | "full"> = { client: "start", provider: "end" };

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
        const lane = LANE[role] ?? "full";
        const addressed = entry.kind === "clarification" ? parseClarificationAddress(entry.body) : null;
        const text = addressed ? addressed.text : entry.body;

        return (
          <li
            key={entry.id}
            data-party={role}
            data-lane={lane}
            className={cn(
              "rounded-[10px] border border-border bg-surface-2/50 p-3.5",
              lane === "start" && "mr-auto max-w-[88%] border-l-2 border-l-muted-foreground/50",
              lane === "end" && "ml-auto max-w-[88%] border-r-2 border-r-primary/60",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[role] ?? DOT.system)} />
              <span className="font-semibold text-foreground">{labelFor(entry.kind)}</span>
              {person && (
                <span className="text-muted-foreground">
                  · {person}
                  {roleText && <span className="text-subtle"> ({roleText})</span>}
                </span>
              )}
              {addressed?.audience && (
                <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">
                  {CLARIFICATION_ADDRESS_LABEL[addressed.audience]}
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

            {text && (
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">{text}</p>
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
