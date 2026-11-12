-- Certificates: the provider states the expiry date, or says there is none
-- (panel follow-up, docs/handoff-mobile-expiry-and-revoked.md).
--
-- expires_on null used to mean both "never expires" and "the provider skipped
-- it". no_expiry = true now records "the provider says no expiry date is
-- printed", so an admin can check that claim against the photo. Requiring one
-- of the two is enforced by the API behind REQUIRE_CREDENTIAL_EXPIRY, switched
-- on only after the new app is out (the current app sends neither).
--
-- DEPLOY ORDER: this migration before the API (the API reads no_expiry).

begin;

alter table public.provider_credentials
  add column if not exists no_expiry boolean not null default false;

alter table public.provider_credentials
  drop constraint if exists provider_credentials_no_expiry_or_date;
alter table public.provider_credentials
  add constraint provider_credentials_no_expiry_or_date
  check (not (no_expiry and expires_on is not null));

comment on column public.provider_credentials.no_expiry is
  'The provider says the certificate has no expiry date printed. Never true together with expires_on.';

commit;
