-- TaskBuddy schema — job budget, preferred schedule, and photos
-- Source of truth: backend/BACKEND_SCHEMA.md §16 (added alongside this migration).
--
-- The mobile job-creation flow has always collected a budget, a preferred date
-- and time, and photos, but had nowhere to put them — submitJob() dropped them
-- on the floor. The web admin console's Bookings "Amount" column was a hardcoded
-- placeholder for the same reason. This migration gives those three inputs a home.
--
-- It also closes a gap in the calendar: nothing in the product ever created a
-- bookings row, so the provider calendar was permanently empty. Accepting an
-- application now auto-creates the booking from the client's preferred time.
--
-- Additive and backwards-compatible: every new column is nullable or defaulted,
-- so existing rows and the currently-deployed mobile build keep working.
--
-- Conventions mirror 0001–0006: snake_case, timestamptz, CHECK constraints that
-- match the API's class-validator rules.

-- ===========================================================================
-- 1. Job pricing, scheduling, and photos
-- ===========================================================================
alter table jobs
    add column budget numeric(12,2)
        check (budget is null or budget > 0),

    -- The client's preferred start time, chosen when posting. Null means ASAP,
    -- which is how every job behaved before this migration.
    add column scheduled_at timestamptz,

    -- Supabase Storage object paths in the public `job-photos` bucket — not
    -- URLs, so the bucket can be renamed or re-pointed without rewriting rows.
    add column photo_urls text[] not null default '{}'
        check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 6);

comment on column jobs.budget is
    'Client-set budget in PHP. Null for jobs posted before pricing existed.';
comment on column jobs.scheduled_at is
    'Client''s preferred start time. Null = ASAP. Seeds the bookings row on assignment.';
comment on column jobs.photo_urls is
    'Storage object paths in the public job-photos bucket (max 6).';

-- Partial index: the calendar and the timeout poller both care about scheduled jobs.
create index idx_jobs_scheduled_at on jobs (scheduled_at)
    where scheduled_at is not null;

-- ===========================================================================
-- 2. Storage bucket for job photos
--
--    Public read: job photos are shown to any provider browsing the job.
--    Uploads still go through POST /uploads/signed-url, which generates the
--    object path server-side as `<profile id>/<uuid>.<ext>`, so one user cannot
--    overwrite another's objects. No storage RLS policies are needed: signed
--    upload URLs carry their own token, and the API reads with the service key.
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

-- ===========================================================================
-- 3. Auto-create the booking when an application is accepted
--
--    Replaces the 0002 version. The first two statements are unchanged — assign
--    the job and auto-reject the sibling applications — and the insert is new.
--
--    `on conflict (job_id) do nothing` keeps this idempotent: bookings.job_id is
--    unique, and a provider may already have scheduled the job by hand.
-- ===========================================================================
create or replace function handle_application_accepted()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_job jobs%rowtype;
begin
    if new.status = 'accepted' and old.status is distinct from 'accepted' then
        update jobs
           set assigned_provider_id = new.provider_id,
               assigned_at          = now(),
               status               = 'assigned'
         where id = new.job_id
        returning * into v_job;

        update job_applications
           set status     = 'rejected',
               decided_at = now()
         where job_id = new.job_id
           and id <> new.id
           and status = 'pending';

        -- Only jobs the client gave a preferred time for get a calendar entry.
        if v_job.scheduled_at is not null then
            insert into bookings (job_id, provider_id, client_id, scheduled_at)
            values (v_job.id, new.provider_id, v_job.client_id, v_job.scheduled_at)
            on conflict (job_id) do nothing;
        end if;
    end if;
    return new;
end;
$$;
