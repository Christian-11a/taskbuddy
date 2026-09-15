-- TaskBuddy schema — take direct table writes away from signed-in users
-- Source of truth: backend/BACKEND_SCHEMA.md §11 (RLS) and §17 (verification
-- is a gate).
--
-- Apply after 0025.
--
-- Why
-- ---
-- 0003 wrote its policies as "defense-in-depth ... for any direct supabase-js
-- access from the frontends", back when a frontend might have talked to
-- PostgREST itself. None does: the mobile app and the web console talk only
-- to the NestJS API (BACKEND_SCHEMA.md §20, "the device talks to this API
-- and nothing else"), and the API writes with the service-role key, which
-- bypasses RLS entirely. The anon client in the API is used for Supabase Auth
-- calls only, never for table access.
--
-- So these policies protect nothing the API needs, and they grant something
-- dangerous to anyone holding a user's access token and the project's anon
-- key — which is public by design:
--
--   - provider_profiles_update_own lets a provider set their own
--     `is_verified = true`. Verification is now the gate on applying and on
--     being hired (§17); a policy that lets the gated party open the gate
--     makes it a badge again.
--   - profiles_update_own lets a user set their own `role`, and would let a
--     suspended or deleted account clear `deactivated_at`.
--   - jobs_client_all lets a client move their own job's status, budget or
--     assigned provider behind escrow's back.
--   - the job_applications update policies let a client mark an application
--     `accepted` directly — firing handle_application_accepted, assigning the
--     job and rejecting every rival — without escrow ever holding the money.
--   - reviews / messages / job_tasks / notifications inserts and updates skip
--     the checks the API makes (completed-job-only reviews, conversation
--     participation, checklist state, mark-read only).
--
-- The rule after this migration: authenticated users may READ what 0003
-- allowed; every WRITE goes through the API. Row-level SELECT policies are
-- unchanged, and no function or trigger is affected — every trigger that
-- writes on a user's behalf is SECURITY DEFINER (0002, 0016).
--
-- Storage policies on `verification-docs` (0019) are deliberately untouched:
-- those govern the Storage bucket, not these tables.
--
-- Re-runnable: every statement is `drop policy if exists` or guarded.

-- ===========================================================================
-- 1. Identity — nobody edits their own role, verification or suspension
-- ===========================================================================
drop policy if exists profiles_update_own on profiles;
drop policy if exists provider_profiles_insert_own on provider_profiles;
drop policy if exists provider_profiles_update_own on provider_profiles;

-- ===========================================================================
-- 2. Jobs — reads stay; status, money and assignment move only through the API
-- ===========================================================================
drop policy if exists jobs_client_all on jobs;
drop policy if exists jobs_client_read on jobs;
create policy jobs_client_read on jobs
    for select using (client_id = auth.uid());

-- ===========================================================================
-- 3. Applications — a hire is an escrow hold first (§28.3), never a row flip
-- ===========================================================================
drop policy if exists applications_provider_insert on job_applications;
drop policy if exists applications_provider_update on job_applications;
drop policy if exists applications_client_update on job_applications;

-- ===========================================================================
-- 4. Everything else the API validates before writing
-- ===========================================================================
drop policy if exists reviews_client_insert on reviews;
drop policy if exists messages_participant_insert on messages;
drop policy if exists job_tasks_provider_update on job_tasks;
drop policy if exists notifications_recipient_update on notifications;

-- ===========================================================================
-- Verification — expect zero rows: no INSERT/UPDATE/DELETE/ALL policy left on
-- these tables for the `authenticated` or `public` roles.
-- ===========================================================================
-- select tablename, policyname, cmd
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('profiles', 'provider_profiles', 'jobs',
--                      'job_applications', 'reviews', 'messages',
--                      'job_tasks', 'notifications')
--    and cmd <> 'SELECT';
