-- TaskBuddy schema — self-serve account deletion and registration email OTP
-- Source of truth: backend/BACKEND_SCHEMA.md §27.
--
-- Closes items 1 and 5 of docs/backend-handoff-mobile-todo-gaps.md.
--
-- Apply after 0022 has committed.

-- ===========================================================================
-- 1. profiles.deleted_at — the soft-delete tombstone
--
--    A hard delete is not available to us. `wallet_transactions`, `reviews`,
--    `jobs` and `recommendation_candidates` all cascade off `profiles`, and
--    every one of them has to survive:
--
--      - the ledger is the only account of record for money (§18); rows
--        vanishing under it means it stops reconciling,
--      - the other party's job history and reviews are their record, not the
--        departing user's, and
--      - `recommendation_candidates` is the ML retraining set (§13). Holes in
--        it silently bias the next model.
--
--    So the row stays and is marked instead. Everything user-identifying on
--    it is scrubbed by the API at deletion time (DELETE /profiles/me), which
--    is what actually discharges the erasure obligation; what remains is a
--    referential shell.
--
--    `deactivated_at` is set alongside it, so every existing suspension check
--    — JwtAuthGuard, login, password reset, Google callback — already refuses
--    a deleted account without knowing this column exists.
-- ===========================================================================
alter table profiles
    add column if not exists deleted_at timestamptz;

comment on column profiles.deleted_at is
    'Set by DELETE /profiles/me. The row is retained because the ledger, '
    'reviews, jobs and ML candidate snapshots reference it; identifying '
    'fields are scrubbed at deletion time. Filter it out of anything that '
    'lists or matches people.';

-- Partial: the overwhelming majority of rows are NULL, and every query that
-- cares asks for exactly that.
create index if not exists idx_profiles_not_deleted
    on profiles (id) where deleted_at is null;

-- The admin console reads people through this view. Without the column here a
-- deleted account is indistinguishable from a suspended one.
--
-- `create or replace view` is append-only: Postgres refuses to drop or reorder
-- an existing column (42P16, "cannot drop columns from view"). So the select
-- list below must reproduce the *current* one exactly and add to the end of
-- it — and the current one is 0014's, not 0005's. 0014 appended
-- suspended_until and suspension_reason; an earlier draft of this migration
-- copied 0005's list, which silently meant "drop those two" and failed on
-- push. If a later migration appends more, copy from that one, not from here.
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
    -- ── appended here ────────────────────────────────────────────────────
    p.deleted_at
from profiles p
join auth.users u on u.id = p.id
left join provider_profiles pp on pp.profile_id = p.id
left join service_categories sc on sc.id = pp.category_id;

revoke all on admin_user_overview from anon, authenticated;

-- ===========================================================================
-- 2. profiles.email_verified_at — the OTP's result
--
--    Distinct from auth.users.email_confirmed_at, which Supabase owns and
--    which reflects *its* confirmation link. This column records that the
--    holder of the mailbox typed our six-digit code back at us during signup.
--    Both can be true; neither implies the other.
-- ===========================================================================
alter table profiles
    add column if not exists email_verified_at timestamptz;

comment on column profiles.email_verified_at is
    'Set by POST /auth/verify-email-otp. Not the same as Supabase''s own '
    'email_confirmed_at — that tracks its confirmation link, this tracks the '
    'code the registration flow mails.';

-- ===========================================================================
-- 3. No email_otps table — and why not
--
--    docs/backend-handoff-mobile-todo-gaps.md §5 sketched a hashed-code table
--    with an attempt counter, and also asked the prior question: whether a
--    hand-rolled OTP is wanted at all, or whether Supabase's own confirmation
--    is the actual requirement. It is the latter.
--
--    A code table is the easy half. The half that decides the design is
--    delivery, and this backend has no mail transport of its own — every email
--    the platform sends today (password reset, signup confirmation) leaves
--    through Supabase Auth. Building a second, parallel OTP would mean either
--    adding an SMTP/ESP dependency to send it, or having Supabase mail a code
--    it does not know about, which it cannot.
--
--    Supabase's signup OTP already is a hashed, single-use, expiring,
--    rate-limited code — and it does one thing a private table cannot: it sets
--    auth.users.email_confirmed_at, so the address is confirmed to Auth itself
--    and not merely to us. POST /auth/send-email-otp and
--    POST /auth/verify-email-otp wrap it; see docs/email-otp-setup.md for the
--    one email-template change it needs ({{ .Token }} instead of a link).
--
--    What stays here is `profiles.email_verified_at` above, recording that the
--    registration flow specifically saw the code come back.
-- ===========================================================================
