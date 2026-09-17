-- TaskBuddy — recommendation matching eligibility (BACKEND_SCHEMA.md §32)
--
-- Replaces 0002's fn_job_provider_features with the same signature and the
-- same 14 features; only the WHERE clause changes. The old pool admitted three
-- kinds of provider it should not have:
--
--   1. A provider whose bio is still NULL. 0015 made provider_profiles.bio
--      nullable and signup now creates the row with a NULL bio. The model
--      service requires provider_bio to be a string, so ONE such provider in a
--      pool made ml-service reject the whole batch (422) and nobody for that
--      job was scored. recommendation_candidates.provider_bio is NOT NULL too.
--
--   2. An unverified provider. Verification is a gate on applying (§17), so an
--      invite to an unverified provider could only end in a 403 when they tried
--      to act on it.
--
--   3. A provider in the job's category at ANY distance. The old rule was
--      "same category OR within service_radius_km", so a Cebu plumber was
--      eligible for a Quezon City job — and the model, trained on distances up
--      to 20 km, scores 350 km much like 20 km. Every provider is now held to
--      their own service_radius_km, which they set in Edit Profile.
--
-- Also excludes soft-deleted accounts explicitly (0023). Deletion sets
-- deactivated_at as well, so this is belt-and-braces, not a behaviour change.
--
-- Part 2 adds what the scheduler needs to retry jobs that reached
-- 'recommending' but were never scored (§32.3): an attempt timestamp, and a
-- function that claims a batch of such jobs atomically.
--
-- Re-runnable: create or replace with unchanged signatures, add column if not
-- exists. APPLY BEFORE DEPLOYING THE API that ships with it — the scheduler
-- writes jobs.recommendation_attempted_at when it flips a job, and that update
-- fails on a database without the column.

-- ===========================================================================
-- 1. Eligibility
-- ===========================================================================

create or replace function fn_job_provider_features(p_job_id uuid)
returns table (
    provider_id uuid,
    skills_match smallint,
    distance_km numeric,
    provider_avg_rating numeric,
    provider_completed_jobs integer,
    provider_availability smallint,
    job_idle_duration_hrs numeric,
    provider_response_time_hrs numeric,
    provider_years_experience numeric,
    hour_posted smallint,
    provider_skill_category text,
    day_of_week text,
    job_urgency text,
    job_description text,
    provider_bio text
)
language sql stable as $$
    select
        pp.profile_id,
        (pp.category_id = j.category_id)::int::smallint,
        round(haversine_km(j.latitude, j.longitude, pr.latitude, pr.longitude)::numeric, 2),
        coalesce(pp.cached_avg_rating, 3.0),
        pp.cached_completed_jobs,
        pp.is_available::int::smallint,
        round((extract(epoch from (now() - j.posted_at)) / 3600)::numeric, 2),
        coalesce(pp.cached_avg_response_hrs, 2.0),
        pp.years_experience,
        extract(hour from j.posted_at at time zone 'Asia/Manila')::smallint,
        sc.name,
        trim(to_char(j.posted_at at time zone 'Asia/Manila', 'Day')),
        j.urgency::text,
        j.description,
        pp.bio
    from jobs j
    cross join provider_profiles pp
    join profiles pr on pr.id = pp.profile_id
    join service_categories sc on sc.id = pp.category_id
    where j.id = p_job_id
      and pp.is_available
      and pp.is_verified
      and pp.bio is not null
      and pr.deactivated_at is null
      and pr.deleted_at is null
      and pr.latitude is not null and pr.longitude is not null
      and not exists (select 1 from job_applications ja
                      where ja.job_id = j.id and ja.provider_id = pp.profile_id)
      and haversine_km(j.latitude, j.longitude, pr.latitude, pr.longitude)
          <= pp.service_radius_km;
$$;

-- ===========================================================================
-- 2. Retrying unscored jobs
-- ===========================================================================

-- When scoring was last attempted for this job — by the timeout flip, a
-- manual trigger, or a retry. Doubles as a claim: a job attempted recently is
-- left alone, so two scorers do not run the same job at once.
alter table jobs
    add column if not exists recommendation_attempted_at timestamptz;

comment on column jobs.recommendation_attempted_at is
    'Last time recommendation scoring was attempted (timeout, manual or retry). '
    'Retries skip jobs attempted within the retry window. BACKEND_SCHEMA.md §32.3.';

-- Claims up to p_limit jobs that sit in 'recommending' with NO recommendation
-- run and no attempt in the last p_retry_after_seconds, stamps them as
-- attempted, and returns them for scoring.
--
-- The run check happens here, before the limit. Filtering in application code
-- after a LIMIT let already-scored jobs — which legitimately stay
-- 'recommending' until someone is hired — fill every batch, so unscored jobs
-- were never retried once enough scored ones were waiting. Ordering by the
-- last attempt (never-attempted first) rotates through a backlog instead of
-- retrying the same oldest jobs forever. FOR UPDATE SKIP LOCKED makes the
-- claim safe against a concurrent tick.
create or replace function claim_unscored_recommending_jobs(
    p_retry_after_seconds integer,
    p_limit integer
)
returns table (id uuid, title text)
language sql volatile
set search_path = public
as $$
    update jobs j
       set recommendation_attempted_at = now()
     where j.id in (
         select c.id
           from jobs c
          where c.status = 'recommending'
            and not exists (select 1 from recommendation_runs rr
                             where rr.job_id = c.id)
            and (c.recommendation_attempted_at is null
                 or c.recommendation_attempted_at
                    < now() - make_interval(secs => p_retry_after_seconds))
          order by c.recommendation_attempted_at nulls first, c.posted_at
          limit p_limit
          for update skip locked
     )
    returning j.id, j.title;
$$;

revoke all on function public.claim_unscored_recommending_jobs(pg_catalog.int4, pg_catalog.int4)
    from public, anon, authenticated;
grant execute on function public.claim_unscored_recommending_jobs(pg_catalog.int4, pg_catalog.int4)
    to service_role;

