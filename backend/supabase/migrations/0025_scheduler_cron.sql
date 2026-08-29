-- TaskBuddy schema — Postgres-driven scheduler ticks
-- Source of truth: backend/BACKEND_SCHEMA.md §9 (scheduling).
--
-- RUN THE SECTION 2 SNIPPET BEFORE THIS FILE. It refuses to run otherwise.
--
-- Why
-- ---
-- Two sweeps keep the platform moving, and until now both were in-process
-- `@Cron` decorators (PushScheduler every 30s, RecommendationsScheduler every
-- minute). That works only while the API is a long-running process that is
-- awake.
--
-- The push sweep is the one that breaks. `notifications` rows are written by
-- database triggers on job and application changes, and by escrow and
-- verifications — Postgres writes them with no API request involved, which is
-- exactly why PushScheduler sweeps `pushed_at is null` instead of hanging an
-- "and also push it" line off each call site. So on a host that sleeps when
-- idle, the rows keep being written and nothing delivers them until a user
-- request happens to wake the process. Notifications arrive in a burst when
-- someone opens the app, rather than when the thing they describe happened.
--
-- Postgres is never asleep. This migration makes it the clock.
--
-- What this is NOT
-- ----------------
-- The sweeps are not reimplemented in SQL. Both make outbound HTTP calls that
-- do not belong in PL/pgSQL — push delivery posts batches to Expo after
-- filtering opt-ins and fanning out device tokens, and the recommendations
-- tick calls the model service over ML_SERVICE_URL. Rewriting the
-- claim-before-send ordering in push.scheduler.ts as SQL would be throwing
-- away the part that was reasoned about most carefully.
--
-- Instead: pg_cron schedules, pg_net posts to POST /internal/tick/*, and the
-- existing TypeScript runs unchanged. Postgres is the clock; Nest is the
-- worker.
--
-- The API side
-- ------------
--   * Set CRON_SECRET to the same value used in section 2 below.
--   * Set CRON_DRIVER=pg_cron so the `@Cron` decorators stand down and stop
--     double-ticking (see src/common/cron-driver.ts). Leave it unset and both
--     drivers run; the `running` flags make that harmless but wasteful.
--
-- Conventions mirror 0001–0024.


-- ===========================================================================
-- 1. Extensions
--
--    Both ship with Supabase and are enabled per-project. pg_cron installs
--    into `cron`, pg_net into `net`.
-- ===========================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ===========================================================================
-- 2. Configuration — NOT IN THIS FILE, ON PURPOSE
--
--    This migration is committed to the repo, so it must never hold the shared
--    secret. The two Vault entries are created once, by hand, from a snippet
--    that is never saved anywhere: paste the block below into the Supabase SQL
--    editor with real values, run it, then close the tab without saving.
--
--    Run that snippet BEFORE this file. The check below is what turns "the
--    ticks quietly 401 forever" into an error you see at apply time.
--
--    -----------------------------------------------------------------------
--    select vault.create_secret(
--        'https://taskbuddy-kpek.onrender.com',
--        'taskbuddy_api_base_url',
--        'Origin pg_net posts TaskBuddy scheduler ticks to (migration 0025)'
--    );
--    select vault.create_secret(
--        '<paste the same value as CRON_SECRET on Render>',
--        'taskbuddy_cron_secret',
--        'Shared secret for POST /internal/tick/*'
--    );
--    -----------------------------------------------------------------------
--
--    To rotate later, update in place rather than creating a duplicate name:
--        select vault.update_secret(
--            (select id from vault.secrets where name = 'taskbuddy_cron_secret'),
--            '<new value>'
--        );
-- ===========================================================================
do $config$
begin
    if not exists (select 1 from vault.secrets where name = 'taskbuddy_api_base_url')
    or not exists (select 1 from vault.secrets where name = 'taskbuddy_cron_secret')
    then
        raise exception 'Vault secrets missing — run the section 2 snippet first'
            using hint =
                'Create taskbuddy_api_base_url and taskbuddy_cron_secret via '
                'vault.create_secret(), then re-run this migration.';
    end if;
end
$config$;


-- ===========================================================================
-- 3. scheduler_tick() — one place that knows how to call the API
--
--    Both cron jobs go through this so the Vault lookup and the header are
--    written once. security definer because the jobs run as the scheduling
--    role and `vault.decrypted_secrets` is not theirs to read; execute is
--    revoked from everyone else for the same reason.
--
--    Returns the pg_net request id. pg_net is fire-and-forget: this returns as
--    soon as the request is queued, and the response lands in
--    `net._http_response` later. A tick that 500s is therefore silent here —
--    section 5 has the query that surfaces it.
-- ===========================================================================
create or replace function scheduler_tick(path text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $fn$
declare
    v_base_url text;
    v_secret   text;
begin
    select decrypted_secret into v_base_url
        from vault.decrypted_secrets where name = 'taskbuddy_api_base_url';
    select decrypted_secret into v_secret
        from vault.decrypted_secrets where name = 'taskbuddy_cron_secret';

    -- Missing configuration is a warning, not an error: raising here would put
    -- a failure row in cron.job_run_details every 30 seconds forever, which
    -- buries whatever else went wrong that day.
    if v_base_url is null or v_secret is null then
        raise warning 'scheduler_tick: vault secrets missing, skipping %', path;
        return null;
    end if;

    return net.http_post(
        url     := v_base_url || path,
        body    := '{}'::jsonb,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-taskbuddy-cron-secret', v_secret
        ),
        -- Generous: a push tick claims up to 200 rows and posts them to Expo
        -- in batches of 100. This bounds how long pg_net waits, not how long
        -- the API is allowed to take.
        timeout_milliseconds := 30000
    );
end
$fn$;

revoke all on function scheduler_tick(text) from public, anon, authenticated;

comment on function scheduler_tick(text) is
    'Posts a scheduler tick to the TaskBuddy API using credentials held in '
    'Vault. Called only by the pg_cron jobs created in migration 0025.';


-- ===========================================================================
-- 4. The schedules
--
--    Unscheduled first so this file can be re-run — cron.unschedule raises if
--    the job is absent, hence the `where exists`.
--
--    Sub-minute intervals ('30 seconds') need pg_cron 1.5+. Where the platform
--    is older the schedule falls back to one minute and says so, which slows
--    push delivery but does not break it. Check with:
--        select extversion from pg_extension where extname = 'pg_cron';
-- ===========================================================================
do $sched$
begin
    perform cron.unschedule('taskbuddy-push-tick')
        where exists (select 1 from cron.job where jobname = 'taskbuddy-push-tick');
    perform cron.unschedule('taskbuddy-recommendations-tick')
        where exists (select 1 from cron.job where jobname = 'taskbuddy-recommendations-tick');

    begin
        perform cron.schedule(
            'taskbuddy-push-tick',
            '30 seconds',
            $job$select scheduler_tick('/internal/tick/push')$job$
        );
    exception when others then
        raise warning
            'pg_cron rejected a sub-minute schedule (needs 1.5+); push delivery falls back to 1 minute';
        perform cron.schedule(
            'taskbuddy-push-tick',
            '* * * * *',
            $job$select scheduler_tick('/internal/tick/push')$job$
        );
    end;

    -- Already a whole minute in the TypeScript, so no fallback needed.
    perform cron.schedule(
        'taskbuddy-recommendations-tick',
        '* * * * *',
        $job$select scheduler_tick('/internal/tick/recommendations')$job$
    );
end
$sched$;


-- ===========================================================================
-- 5. Verification — run these by hand after applying
-- ===========================================================================
-- What is scheduled:
--     select jobname, schedule, active from cron.job
--      where jobname like 'taskbuddy-%';
--
-- Whether the jobs are firing (the pg_cron side):
--     select j.jobname, d.status, d.return_message, d.start_time
--       from cron.job_run_details d
--       join cron.job j on j.jobid = d.jobid
--      where j.jobname like 'taskbuddy-%'
--      order by d.start_time desc limit 20;
--
-- Whether the API is accepting them (the pg_net side) — 401 means CRON_SECRET
-- does not match section 2, 503 means it is unset on the API:
--     select status_code, content, created
--       from net._http_response
--      order by created desc limit 20;
--
-- Whether delivery is actually keeping up. This should stay near zero once
-- CRON_DRIVER=pg_cron is live; before this migration, on a sleeping host, it
-- climbs between visits:
--     select count(*) from notifications where pushed_at is null;
--
-- To stop the Postgres-driven ticks (unset CRON_DRIVER on the API first, or
-- nothing will run the sweeps at all):
--     select cron.unschedule('taskbuddy-push-tick');
--     select cron.unschedule('taskbuddy-recommendations-tick');
