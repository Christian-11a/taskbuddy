-- Handoff follow-up: the admin Users list shows exactly what a provider is
-- missing since certificates became required (0068). A separate view, so
-- admin_user_overview (0034) is left as it is and replaying old migrations
-- still works; the API attaches these two fields to each user row.
--   identity_verified   the identity half of verification (0068)
--   certificate_status  for the provider's main service:
--     approved  an approved certificate that has not expired (Manila date)
--     pending   one is waiting for review
--     expired   only approved certificates that have expired
--     rejected  only rejected ones
--     null      none uploaded
-- Service role only, like admin_user_overview.

begin;

create or replace view public.admin_user_certificates as
 SELECT pp.profile_id AS id,
    pp.identity_verified,
    cert.status AS certificate_status
   FROM provider_profiles pp
     LEFT JOIN LATERAL ( SELECT CASE
             WHEN bool_or(c.status = 'approved' AND (c.expires_on IS NULL
                  OR c.expires_on >= (now() AT TIME ZONE 'Asia/Manila')::date)) THEN 'approved'
             WHEN bool_or(c.status = 'pending') THEN 'pending'
             WHEN bool_or(c.status = 'approved') THEN 'expired'
             WHEN bool_or(c.status = 'rejected') THEN 'rejected'
             ELSE NULL
           END AS status
           FROM provider_credentials c
          WHERE c.provider_id = pp.profile_id AND c.category_id = pp.category_id) cert ON true;

revoke all on public.admin_user_certificates from public, anon, authenticated;
grant select on public.admin_user_certificates to service_role;

commit;
