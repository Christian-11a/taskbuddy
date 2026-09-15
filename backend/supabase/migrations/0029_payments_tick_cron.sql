-- TaskBuddy schema — schedule the payments sweep from Postgres
-- Source of truth: backend/BACKEND_SCHEMA.md §29.6.
--
-- Apply after 0028.
--
-- The payments sweep (PaymentsScheduler, POST /internal/tick/payments) retries
-- card-funded payout transfers that are still pending or due after a failure,
-- and settles escrows left `held` on jobs that already completed or were
-- cancelled. Like the push and recommendation sweeps, it runs in-process by
-- default and needs Postgres to drive it on a host that sleeps when idle.
--
-- This only adds a job to what 0025 set up. If 0025 was never applied (no
-- pg_cron, or the Vault secrets were never created) it does nothing and says
-- so; the in-process @Cron keeps running the sweep as long as CRON_DRIVER is
-- not 'pg_cron'. Re-runnable.

do $sched$
begin
    if not exists (select 1 from pg_extension where extname = 'pg_cron')
       or not exists (select 1 from pg_proc where proname = 'scheduler_tick')
    then
        raise notice
            '0029: pg_cron or scheduler_tick() (0025) not present — payments '
            'sweep stays in-process. Nothing scheduled.';
        return;
    end if;

    perform cron.unschedule('taskbuddy-payments-tick')
        where exists (select 1 from cron.job where jobname = 'taskbuddy-payments-tick');

    -- Every five minutes. Transfers are also attempted inline at release, so
    -- this is the retry and reconciliation path, not the main one.
    perform cron.schedule(
        'taskbuddy-payments-tick',
        '*/5 * * * *',
        $job$select scheduler_tick('/internal/tick/payments')$job$
    );
end
$sched$;

-- Verification:
--     select jobname, schedule, active from cron.job
--      where jobname = 'taskbuddy-payments-tick';
--
-- To stop it:
--     select cron.unschedule('taskbuddy-payments-tick');
