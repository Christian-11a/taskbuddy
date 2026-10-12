/** A help question and the answer shown under it. */
export interface HelpEntry {
  q: string;
  a: string;
}

/**
 * Help entries whose question or answer contains every word typed in the
 * search box (case-insensitive, in any order). A blank search keeps them all.
 */
export function filterHelpEntries<T extends HelpEntry>(entries: readonly T[], search: string): T[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((entry) => {
    const text = `${entry.q} ${entry.a}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
