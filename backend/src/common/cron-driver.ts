/**
 * Which clock drives the sweeps in PushScheduler and RecommendationsScheduler.
 *
 * 'in-process' (the default, and anything other than the value below) keeps the
 * `@Cron` decorators authoritative. That only delivers on schedule while the
 * API is a long-running process that is actually awake — on a host that sleeps
 * when idle, the sweeps sleep with it while Postgres triggers keep writing the
 * rows they were meant to pick up.
 *
 * 'pg_cron' hands the schedule to Postgres (migration 0025), which is awake
 * regardless, and which calls POST /internal/tick/* to run the very same
 * tick(). This only decides *who calls*, never what runs, so switching back is
 * a redeploy with nothing to undo in the database beyond unscheduling the jobs.
 */
export function isExternallyScheduled(): boolean {
  return process.env.CRON_DRIVER === 'pg_cron';
}
