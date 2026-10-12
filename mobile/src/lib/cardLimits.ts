/**
 * The card limits: the smallest and largest amount a single card payment may be.
 * Kept apart from the API client, with no network code, so the rules that depend
 * on them (the job budget, for one) can be tested on their own. api.ts re-exports
 * both, so screens keep importing them from the API module.
 */

/** TaskBuddy's card/top-up floor; matches the backend's PHP50 bound. */
export const MIN_TOPUP_PHP = 50;

/** The most a single card payment may be: the backend's top-up/hire ceiling. */
export const MAX_CARD_PHP = 100_000;
