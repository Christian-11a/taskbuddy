-- TaskBuddy schema — admin console follow-ups
-- Source of truth: backend/BACKEND_SCHEMA.md §23 (added alongside this migration).
--
-- web/README.md "What's Still Needed From the Backend" listed seven gaps the
-- admin console UI was already built for but had no API behind. This migration
-- covers the two that need schema: timed suspensions with a reason (item 1),
-- and a real admin audit log (item 5). The other five items (admin password
-- reset, booking detail, activity pagination, admin chat read-access,
-- verification pre-check) reuse existing tables and need no DDL.
--
-- Conventions mirror 0001–0013.

-- ===========================================================================
-- 1. Timed suspensions — profiles.deactivated_at already gates login (0001);
--    this adds an optional expiry and a human-readable reason.
--
--    IF NOT EXISTS / IF EXISTS everywhere below: this script is written to be
--    safely re-run after a partial failure (e.g. the view rewrite below once
--    failed 42P16 because the new columns were listed before created_at —
--    CREATE OR REPLACE VIEW can only APPEND columns, never insert them; a
--    later select-list position can't rename what Postgres sees as the same
--    column slot).
-- ===========================================================================
alter table profiles
    add column if not exists suspended_until timestamptz,
    add column if not exists suspension_reason text
        check (char_length(suspension_reason) <= 500);

comment on column profiles.suspended_until is
    'Null = indefinite suspension. Once past, the suspension is lazily lifted the '
    'next time deactivated_at is checked (login) — no cron job needed.';
comment on column profiles.suspension_reason is
    'Admin-supplied reason. Null on suspensions predating this column.';

-- admin_user_overview (0005) surfaces these two columns so the Users table can
-- show "Suspended until Aug 12" instead of just "Suspended". Appended at the
-- end of the select list, not inserted before created_at — see note above.
create or replace view admin_user_overview as
select
    p.id,
    u.email,
    p.full_name,
    p.phone,
    p.role,
    p.city,
    p.deactivated_at,
    p.created_at,
    pp.category_id,
    sc.name as category_name,
    pp.cached_avg_rating,
    pp.cached_completed_jobs,
    p.suspended_until,
    p.suspension_reason
from profiles p
join auth.users u on u.id = p.id
left join provider_profiles pp on pp.profile_id = p.id
left join service_categories sc on sc.id = pp.category_id;

revoke all on admin_user_overview from anon, authenticated;

-- ===========================================================================
-- 2. admin_actions — the audit trail for admin-initiated moderation actions.
--    Nothing before this recorded *who* approved a verification, suspended an
--    account, or resolved a dispute — job_status_history (0001) audits job
--    lifecycle, not the admin behind it.
-- ===========================================================================
create table if not exists admin_actions (
    id          uuid primary key default gen_random_uuid(),
    actor_id    uuid not null references profiles (id),
    action      text not null check (char_length(action) between 1 and 100),
    target_type text not null check (char_length(target_type) between 1 and 50),
    target_id   uuid not null,
    metadata    jsonb not null default '{}',
    created_at  timestamptz not null default now()
);

create index if not exists idx_admin_actions_actor   on admin_actions (actor_id, created_at desc);
create index if not exists idx_admin_actions_action  on admin_actions (action, created_at desc);
create index if not exists idx_admin_actions_target  on admin_actions (target_type, target_id);
create index if not exists idx_admin_actions_created on admin_actions (created_at desc);

-- ===========================================================================
-- 3. Row Level Security (defense-in-depth; API uses the service-role key)
-- ===========================================================================
-- Service role only — same treatment as recommendation_runs/recommendation_candidates
-- (§11): no client, including an admin's own browser session, reads this table
-- directly. It exists to be queried through GET /admin/audit.
alter table admin_actions enable row level security;
revoke all on admin_actions from anon, authenticated;
