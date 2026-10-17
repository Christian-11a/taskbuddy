/**
 * Helpers for putting user text into queries safely. Supabase parameterizes
 * values, but two places still read user text as syntax:
 *
 * - LIKE / ILIKE patterns, where `%` and `_` are wildcards. Postgres uses
 *   `\` as the default LIKE escape, so escaping in TypeScript also works for
 *   the SQL search functions that build `'%' || p_search || '%'`.
 * - PostgREST filter strings passed to `.or()`, where `,` `(` `)` and `.`
 *   split or nest conditions. Double-quoting the value makes it a literal.
 */

/** Escapes `\`, `%` and `_` so the text matches only itself in a LIKE pattern. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Quotes a value for use inside a PostgREST `.or()` / `.filter()` string. */
export function postgrestQuote(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

/** An ILIKE `%text%` pattern, quoted for a PostgREST filter string. */
export function containsPattern(text: string): string {
  return postgrestQuote(`%${escapeLike(text)}%`);
}

/**
 * Trims search text and strips control characters. Returns null when
 * nothing searchable is left, so callers can skip the filter entirely.
 */
export function cleanSearch(text: string | null | undefined): string | null {
  if (text == null) return null;
  const cleaned = text
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  return cleaned === '' ? null : cleaned;
}

/** Cleaned, LIKE-escaped search text for SQL search functions, or null. */
export function likeSearchParam(
  text: string | null | undefined,
): string | null {
  const cleaned = cleanSearch(text);
  return cleaned === null ? null : escapeLike(cleaned);
}
