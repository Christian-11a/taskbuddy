import type { Conversation } from './api';

export type ConversationFilter = 'active' | 'unread' | 'finished' | 'all';

export const CONVERSATION_FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'unread', label: 'Unread' },
  { key: 'finished', label: 'Finished' },
  { key: 'all', label: 'All' },
];

/** Chats get a search box once there are more than this many. */
export const SEARCH_THRESHOLD = 8;

/** A conversation plus the service it belongs to (looked up from the job list). */
export type ConversationItem = Conversation & { service?: string | null; display_status?: string | null };

/** The status to show: an open complaint ('disputed') wins over the work status. */
export function effectiveStatus(c: { job_status: string | null; display_status?: string | null }): string | null {
  return c.display_status === 'disputed' ? 'disputed' : c.job_status;
}

const FINISHED = new Set(['completed', 'cancelled', 'expired']);

/** Finished = the job is over. Everything else (including unknown status) counts as active. */
export function isFinished(c: { job_status: string | null; display_status?: string | null }): boolean {
  const st = effectiveStatus(c);
  return !!st && FINISHED.has(st);
}

export function isActive(c: { job_status: string | null; display_status?: string | null }): boolean {
  return !isFinished(c);
}

const unreadOf = (c: Conversation) => c.unread_count ?? 0;
const timeOf = (c: Conversation) => Date.parse(c.last_message_at ?? c.created_at) || 0;

/** Most recent first. */
export function sortConversations<T extends Conversation>(list: T[]): T[] {
  return [...list].sort((a, b) => timeOf(b) - timeOf(a));
}

export function matchesFilter(c: Conversation, filter: ConversationFilter): boolean {
  switch (filter) {
    case 'active': return isActive(c);
    case 'finished': return isFinished(c);
    case 'unread': return unreadOf(c) > 0;
    default: return true;
  }
}

/** Chats with unread messages (the Unread chip's count). */
export function countUnreadChats(list: Conversation[]): number {
  return list.filter((c) => unreadOf(c) > 0).length;
}

/** Unread chats the current filter hides (an unread chat on a finished job is not in Active). */
export function unreadOutsideFilter(list: Conversation[], filter: ConversationFilter): number {
  return list.filter((c) => unreadOf(c) > 0 && !matchesFilter(c, filter)).length;
}

export function matchesSearch(c: Conversation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (c.job_title ?? '').toLowerCase().includes(q) || (c.counterpart_name ?? '').toLowerCase().includes(q);
}

/** Services present in a list, with counts, biggest first. Empty when no service is known. */
export function serviceCounts(list: ConversationItem[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of list) if (c.service) map.set(c.service, (map.get(c.service) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The filter, search and service pick applied together, newest first. */
export function applyConversationFilters(
  list: ConversationItem[],
  opts: { filter: ConversationFilter; query?: string; service?: string | null },
): ConversationItem[] {
  return sortConversations(
    list.filter(
      (c) =>
        matchesFilter(c, opts.filter) &&
        matchesSearch(c, opts.query ?? '') &&
        (!opts.service || c.service === opts.service),
    ),
  );
}

export interface ConversationSection { title: string; data: ConversationItem[] }

/** "All" shows Active jobs, then Finished; other filters are one untitled group. */
export function conversationSections(items: ConversationItem[], filter: ConversationFilter): ConversationSection[] {
  if (items.length === 0) return [];
  if (filter !== 'all') return [{ title: '', data: items }];
  const active = items.filter(isActive);
  const finished = items.filter(isFinished);
  return [
    ...(active.length ? [{ title: 'Active jobs', data: active }] : []),
    ...(finished.length ? [{ title: 'Finished', data: finished }] : []),
  ];
}

export function emptyCopy(filter: ConversationFilter, role: 'client' | 'provider'): { title: string; body: string } {
  const hires = role === 'client' ? 'when you hire a provider' : 'when a client hires you';
  switch (filter) {
    case 'active': return { title: 'No active chats', body: `Chats start ${hires}.` };
    case 'unread': return { title: 'No unread chats', body: "You're all caught up." };
    case 'finished': return { title: 'No finished chats', body: 'Chats from completed or cancelled jobs show up here.' };
    default: return { title: 'No conversations yet', body: `Chats start ${hires}.` };
  }
}
