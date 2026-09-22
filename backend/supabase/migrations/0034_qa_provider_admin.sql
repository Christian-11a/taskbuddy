-- TaskBuddy — provider and admin follow-ups from the September QA pass
--
-- 1. provider_verifications.document_type — which government ID was uploaded.
-- 2. jobs.provider_accept_* — where the provider was when they accepted.
-- 3. skill_change_requests + provider_secondary_categories — a provider's
--    service can only change through an admin-approved request.
-- 4. admin_user_overview — verification status for the admin Users list.
--
-- Conventions mirror 0001-0033. Every statement is idempotent.

-- ===========================================================================
-- 1. Government ID type
-- ===========================================================================
alter table provider_verifications
    add column if not exists document_type text;

alter table provider_verifications
    drop constraint if exists provider_verifications_document_type_check;
alter table provider_verifications
    add constraint provider_verifications_document_type_check
    check (document_type is null or document_type in
        ('umid', 'drivers_license', 'passport', 'philsys', 'postal_id'));

comment on column provider_verifications.document_type is
    'The ID the provider said they uploaded. Null on rows from before 0034 '
    'and on Stripe Identity rows opened without a manual upload.';

-- ===========================================================================
-- 2. Provider location at accept time
--
--    A provider's profile address is where they are usually based, not where
--    they are today. Accepting a booking now records their current location
--    so the client (and support) see a real distance, not the home address.
-- ===========================================================================
alter table jobs
    add column if not exists provider_accept_address   text,
    add column if not exists provider_accept_latitude  double precision,
    add column if not exists provider_accept_longitude double precision;

comment on column jobs.provider_accept_address is
    'The provider''s location when they accepted the booking (POST /jobs/:id/accept).';

-- ===========================================================================
-- 3. Service changes go through admins
-- ===========================================================================
-- Decisions reach the provider as a notification (same pattern as 0008).
alter type notification_type add value if not exists 'skill_request_update';

do $$
begin
    if not exists (select 1 from pg_type where typname = 'skill_request_type') then
        create type skill_request_type as enum ('change_primary', 'add_secondary');
    end if;
    if not exists (select 1 from pg_type where typname = 'skill_request_status') then
        create type skill_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
    end if;
end $$;

create table if not exists skill_change_requests (
    id             uuid primary key default gen_random_uuid(),
    provider_id    uuid not null references profiles (id) on delete cascade,
    type           skill_request_type not null,
    category_id    smallint not null references service_categories (id),
    reason         text not null check (char_length(reason) between 10 and 500),
    status         skill_request_status not null default 'pending',
    reviewed_by    uuid references profiles (id),
    reviewed_at    timestamptz,
    review_note    text check (char_length(review_note) <= 500),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

-- One open request per provider keeps the admin queue honest.
create unique index if not exists uq_skill_change_requests_one_pending
    on skill_change_requests (provider_id)
 where status = 'pending';

create index if not exists idx_skill_change_requests_status
    on skill_change_requests (status, created_at desc);

drop trigger if exists trg_skill_change_requests_updated_at on skill_change_requests;
create trigger trg_skill_change_requests_updated_at
    before update on skill_change_requests
    for each row execute function set_updated_at();

create table if not exists provider_secondary_categories (
    provider_id  uuid not null references provider_profiles (profile_id) on delete cascade,
    category_id  smallint not null references service_categories (id),
    approved_at  timestamptz not null default now(),
    primary key (provider_id, category_id)
);

-- The API reaches both tables with the service-role key only; RLS with no
-- policies keeps a user-scoped key out, same as oauth_handoffs (0033).
alter table skill_change_requests enable row level security;
alter table provider_secondary_categories enable row level security;

-- ===========================================================================
-- 4. Verification status on the admin Users list
--
--    `create or replace view` is append-only (see 0023): the list below is
--    0023's exactly, with the new columns added at the end.
-- ===========================================================================
create or replace view admin_user_overview as
select
    -- ── 0005's columns, in 0005's order ──────────────────────────────────
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
    -- ── appended by 0014 ─────────────────────────────────────────────────
    p.suspended_until,
    p.suspension_reason,
    -- ── appended by 0023 ─────────────────────────────────────────────────
    p.deleted_at,
    -- ── appended here ────────────────────────────────────────────────────
    pp.is_verified,
    lv.status as latest_verification_status
from profiles p
join auth.users u on u.id = p.id
left join provider_profiles pp on pp.profile_id = p.id
left join service_categories sc on sc.id = pp.category_id
left join lateral (
    select v.status
      from provider_verifications v
     where v.provider_id = p.id
     order by v.submitted_at desc
     limit 1
) lv on true;

revoke all on admin_user_overview from anon, authenticated;
