-- TaskBuddy schema — platform maintenance mode
-- Source of truth: backend/BACKEND_SCHEMA.md §24 (added alongside this migration).
--
-- The admin console's Settings page has had a "Maintenance Mode" toggle since
-- it was first built, but it only ever wrote to the admin's own browser
-- localStorage — flipping it did nothing to the actual app. This migration
-- adds a real, shared switch so the toggle finally does what it looks like it
-- does.
--
-- Conventions mirror 0001–0014.

-- ===========================================================================
-- 1. platform_settings — a deliberately single-row table.
--
--    `id` is a boolean constrained to `true` so the table can never hold a
--    second row (a second insert violates the primary key). Simpler than a
--    singleton-by-convention uuid, and the intent — "there is exactly one of
--    these" — is visible in the schema itself.
-- ===========================================================================
create table if not exists platform_settings (
    id                  boolean primary key default true check (id),
    maintenance_mode    boolean not null default false,
    maintenance_message text,
    updated_at          timestamptz not null default now(),
    updated_by          uuid references profiles (id)
);

insert into platform_settings (id) values (true)
    on conflict (id) do nothing;

comment on table platform_settings is
    'Single-row platform-wide configuration. Today this is only maintenance '
    'mode; other admin-console "Platform" settings (name, support email) '
    'remain local-only until they have a real backend use — see '
    'web/README.md.';

-- ===========================================================================
-- 2. Row Level Security (defense-in-depth; the API uses the service-role key)
-- ===========================================================================
-- Service role only, same treatment as admin_actions (0014): no client reads
-- or writes this directly. Read via GET /admin/maintenance (or the middleware
-- that gates every request); written via PATCH /admin/maintenance.
alter table platform_settings enable row level security;
revoke all on platform_settings from anon, authenticated;
