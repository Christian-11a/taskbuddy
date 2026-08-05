-- TaskBuddy schema — push notification transport
-- Source of truth: backend/BACKEND_SCHEMA.md §20.
--
-- Until now `notifications` was the whole notification system: rows are written
-- by triggers and services, and the app polled for them. mobile/README.md says
-- it plainly — "The backend has no push-notification transport."
--
-- This migration adds the two pieces a transport needs:
--   1. somewhere to keep the device tokens to deliver to, and
--   2. a marker on `notifications` so each row is pushed at most once.
--
-- Delivery itself is Expo's Push API, driven by an in-process @Cron scheduler
-- (PushScheduler) — the same implementer's choice already made for the
-- recommendation timeout sweep rather than pg_cron/pg_net.
--
-- Conventions mirror 0001–0011.

-- ===========================================================================
-- 1. Which platform a token came from
-- ===========================================================================
do $$
begin
    if not exists (select 1 from pg_type where typname = 'device_platform') then
        create type device_platform as enum ('ios', 'android', 'web');
    end if;
end $$;

-- ===========================================================================
-- 2. Registered devices
--
--    `token` is the Expo push token (ExponentPushToken[...]), unique across the
--    whole table rather than per profile: reinstalling or signing in as someone
--    else on the same handset reuses the same token, and the row must follow
--    the current owner instead of being duplicated. POST /devices upserts on
--    it, which is what moves a handed-down device to its new account.
-- ===========================================================================
create table if not exists device_tokens (
    id           uuid primary key default gen_random_uuid(),
    profile_id   uuid not null references profiles (id) on delete cascade,
    token        text not null unique,
    platform     device_platform not null,

    -- Refreshed on every re-registration. A token Expo rejects as
    -- DeviceNotRegistered is deleted outright, so this is for observability
    -- and for pruning handsets that simply stopped opening the app.
    last_seen_at timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

-- The scheduler's hot path: every token for a batch of recipients.
create index if not exists idx_device_tokens_profile
    on device_tokens (profile_id);

comment on table device_tokens is
    'Expo push tokens. Unique on token so a device follows its current owner '
    'rather than accumulating a row per account that has signed in on it.';

-- ===========================================================================
-- 3. Delivery marker
--
--    NULL means "not yet pushed", which is what the scheduler claims rows on.
--    A partial index keeps that scan proportional to the backlog rather than
--    to the size of the table — notifications is append-only and every row
--    that has been pushed stays here forever.
-- ===========================================================================
alter table notifications
    add column if not exists pushed_at timestamptz;

create index if not exists idx_notifications_unpushed
    on notifications (created_at)
 where pushed_at is null;

comment on column notifications.pushed_at is
    'When this row was handed to the push transport (not when the device '
    'displayed it — Expo delivery is best-effort and receipts are not tracked). '
    'NULL means pending; the scheduler stamps it to claim the row.';

-- Rows that predate this migration must not produce a burst of push
-- notifications for week-old events the first time the scheduler runs.
update notifications
   set pushed_at = created_at
 where pushed_at is null;

-- ===========================================================================
-- 4. Row Level Security (defense-in-depth; API uses service-role key)
-- ===========================================================================
alter table device_tokens enable row level security;

drop policy if exists device_tokens_owner_read on device_tokens;
create policy device_tokens_owner_read on device_tokens
    for select using (profile_id = auth.uid());
