/**
 * The quick tags on the review screen, and how they reach the API.
 *
 * The review call has no field for tags: a chosen tag is written in front of
 * the comment, as "On time · Friendly · …", so the backend and the profile see
 * one comment string as before.
 */

import { cleanText } from './textRules';

/** The tags, in the order the screen shows them. */
export const REVIEW_TAGS = ['On time', 'Friendly', 'Clean work', 'Fair price', 'Explained clearly'] as const;

/** Mirrors CreateReviewDto's @MaxLength(500) — see backend/src/reviews/dto. */
export const REVIEW_COMMENT_MAX = 500;

const SEPARATOR = ' · ';

/** The chosen tags, in list order, whatever order they were tapped in. */
export function orderedTags(selected: readonly string[]): string[] {
  return REVIEW_TAGS.filter((tag) => selected.includes(tag));
}

/** How many characters the comment box may hold once the tags are in front of it. */
export function reviewCommentLimit(tags: readonly string[]): number {
  if (tags.length === 0) return REVIEW_COMMENT_MAX;
  return Math.max(0, REVIEW_COMMENT_MAX - tags.join(SEPARATOR).length - SEPARATOR.length);
}

/**
 * The review's length as reviewCommentFor sends it, uncut: the tags, the
 * separator, then the comment trimmed. It can be over REVIEW_COMMENT_MAX, which
 * is how the screen knows to ask for a shorter comment instead of cutting it.
 */
export function reviewCommentLength(tags: readonly string[], comment: string): number {
  if (tags.length === 0) return cleanText(comment).length;
  const prefix = tags.join(SEPARATOR).length;
  const text = cleanText(comment).length;
  return text > 0 ? prefix + SEPARATOR.length + text : prefix;
}

/**
 * The `comment` the API receives: the comment cleaned (see cleanText), so spaces
 * and blank lines around it are not sent. Spaces alone send nothing. With no tag
 * it is the comment on its own, or nothing when it is empty.
 */
export function reviewCommentFor(tags: readonly string[], comment: string): string | undefined {
  if (tags.length === 0) return cleanText(comment).slice(0, REVIEW_COMMENT_MAX).trimEnd() || undefined;
  const prefix = tags.join(SEPARATOR);
  const text = cleanText(comment).slice(0, reviewCommentLimit(tags)).trim();
  return text ? `${prefix}${SEPARATOR}${text}` : prefix;
}
