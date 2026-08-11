-- TaskBuddy schema — signup consent timestamps + SP category bridge
-- Source of truth: docs/signup-gap-fill-tracker.md
--
-- Two gaps identified in the mobile signup audit (signup_field_audit.md):
--
--   1. No consent timestamps were stored. The app collected T&C acceptance but
--      never persisted it, and the RA 10173 biometric/data-collection consents
--      required for Service Providers did not exist at all.
--
--   2. Service Providers had no way to declare their skill category at signup
--      because provider_profiles.category_id is NOT NULL and provider_profiles
--      cannot be created without a bio (20–400 char CHECK). This migration adds
--      a bridge column (signup_category_id) on profiles so the category is
--      captured immediately at registration, and relaxes the bio constraint so
--      the provider_profiles row can be seeded at signup with a NULL bio that
--      the provider fills in later via Edit Profile.
--
-- Conventions mirror 0001–0014.

-- ===========================================================================
-- 1. Consent timestamps on profiles
--
--    Four nullable timestamptz columns — nullable so existing rows and
--    homeowners (who have no biometric consent) don't need a back-fill.
--    The backend's register() function sets these to now() based on the boolean
--    flags the mobile app sends; the client never sends raw timestamps.
-- ===========================================================================
alter table profiles
    add column if not exists consented_terms_at           timestamptz,
    add column if not exists consented_privacy_at         timestamptz,
    add column if not exists consented_data_collection_at timestamptz,
    add column if not exists consented_biometric_at       timestamptz;

comment on column profiles.consented_terms_at is
    'UTC instant when the user accepted the Terms & Conditions during signup. '
    'NULL for accounts created before this migration.';

comment on column profiles.consented_privacy_at is
    'UTC instant when the user accepted the Privacy Policy during signup. '
    'NULL for accounts created before this migration.';

comment on column profiles.consented_data_collection_at is
    'UTC instant when the user accepted the Data Collection consent during signup. '
    'NULL for accounts created before this migration.';

comment on column profiles.consented_biometric_at is
    'UTC instant when the provider accepted the RA 10173 biometric / govt-ID '
    'processing consent. NULL for homeowners and pre-migration accounts.';

-- ===========================================================================
-- 2. Skill-category bridge on profiles
--
--    A nullable smallint that mirrors provider_profiles.category_id.  It is
--    written during registration (when provider_profiles cannot yet exist) and
--    read by auth.service register() to seed provider_profiles.category_id
--    when the provider_profiles row is first created.
-- ===========================================================================
alter table profiles
    add column if not exists signup_category_id smallint
        references service_categories (id) on delete set null;

comment on column profiles.signup_category_id is
    'Category chosen by a provider at signup, before provider_profiles is '
    'created. Seeded into provider_profiles.category_id on first profile edit. '
    'NULL for homeowners and providers who registered before this migration.';

-- ===========================================================================
-- 3. Relax provider_profiles.bio — allow NULL
--
--    The original CHECK required 20–400 characters (0001). We now create the
--    provider_profiles row at signup (before the provider has written a bio)
--    so the constraint must allow NULL. A NULL bio appears as "incomplete" in
--    the app and the Edit Profile screen requires it before saving.
-- ===========================================================================
alter table provider_profiles
    alter column bio drop not null;

-- Drop the old check and re-add it to allow NULL
alter table provider_profiles
    drop constraint if exists provider_profiles_bio_check;

alter table provider_profiles
    add constraint provider_profiles_bio_check
        check (bio is null or char_length(bio) between 20 and 400);

comment on column provider_profiles.bio is
    'Provider self-description (20–400 chars). NULL when the row was created at '
    'signup before the provider completed their profile. Required by the Edit '
    'Profile screen before the profile is considered complete.';
