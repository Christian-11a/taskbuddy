-- TaskBuddy schema — Google OAuth signup pending flag
-- Source of truth: docs/google-role-selection-tracker.md
--
-- Problem: every new Google OAuth user gets role='client' silently via the
-- handle_new_user trigger's coalesce fallback. The user never picks a role and
-- Service Providers can't complete the required extra fields (category, consents).
--
-- Solution: add a `google_signup_pending` boolean that is set to true whenever
-- a new user is created WITHOUT a role in their auth metadata (= Google sign-in).
-- The mobile app detects this flag and shows a role-selection screen before
-- routing the user to their dashboard. Once the user picks a role and completes
-- any required extra fields, the backend clears the flag.
--
-- Conventions mirror 0001–0015.

-- ===========================================================================
-- 1. Flag column on profiles
-- ===========================================================================
alter table profiles
    add column if not exists google_signup_pending boolean not null default false;

comment on column profiles.google_signup_pending is
    'True for accounts created via Google OAuth that have not yet chosen their '
    'role (homeowner or service provider). Set by handle_new_user when '
    'raw_user_meta_data has no ''role'' key. Cleared by POST /auth/complete-google-profile.';

-- ===========================================================================
-- 2. Updated handle_new_user trigger function
--
--    The existing trigger binding (on_auth_user_created) is preserved — we
--    only replace the function body.  Adding google_signup_pending = true when
--    the metadata has no role is the only change; all other behaviour is
--    identical to the 0002 version.
-- ===========================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_role_raw text;
    v_pending  boolean;
begin
    v_role_raw := new.raw_user_meta_data ->> 'role';

    -- When there is no role in the metadata this is a Google (OAuth) sign-in.
    -- Keep role='client' to satisfy the NOT NULL constraint; the pending flag
    -- tells the mobile app to show the role-selection screen instead of routing
    -- straight to the homeowner dashboard.
    v_pending := (v_role_raw is null);

    insert into public.profiles (
        id,
        role,
        full_name,
        phone,
        google_signup_pending
    )
    values (
        new.id,
        coalesce(v_role_raw, 'client')::user_role,
        coalesce(new.raw_user_meta_data ->> 'full_name', 'Unnamed User'),
        new.raw_user_meta_data ->> 'phone',
        v_pending
    );

    return new;
end;
$$;

-- The trigger itself (on_auth_user_created) still points to handle_new_user
-- and does not need to be re-created — replacing the function is sufficient.
