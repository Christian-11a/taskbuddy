import { ApiError } from './api';
import { friendlyApiMessage } from './apiMessages';

/**
 * What Find providers says when the request fails. A 5xx means the matching service
 * did not answer, and so does a failure that is not an ApiError, where the request
 * never got an answer at all. The job itself is fine, so the sentence says it stays
 * open. Any other ApiError keeps the server's own explanation, in plain words.
 *
 * Pure, so each mapping is tested on its own.
 */

const MATCHING_UNAVAILABLE_MESSAGE =
  "We couldn't reach the matching service just now. Your job is still open and providers can see it. Try again in a few minutes.";

/** Said when a refusal comes back without any explanation. */
const FALLBACK_MESSAGE = 'Could not look for providers. Please try again.';

export function findProvidersFailureMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return MATCHING_UNAVAILABLE_MESSAGE;
  if (error.status >= 500) return MATCHING_UNAVAILABLE_MESSAGE;
  // Status 0 is api.ts's own "cannot reach the server" message, which tells the person to check the connection.
  // That is the accurate reading for a dropped connection, so it is kept.
  return friendlyApiMessage(error.message) || FALLBACK_MESSAGE;
}
