-- Revoke a provider's verification (thesis panel P3-2, docs/handoff-revoke-verification.md).
--
-- WHAT: an admin can take back an APPROVED identity verification or an
-- APPROVED certificate, with a required reason. The account stays active (this
-- is not a suspension); the provider loses Verified through the existing
-- refresh (0068), is told why, and can upload new documents for review.
--   * 'revoked' is a new status on provider_verifications (enum) and
--     provider_credentials (check), with revoked_at / revoked_by / revoke_reason.
--   * The only change allowed after a decision is approved -> revoked.
--   * admin_revoke_verification() does it in ONE transaction: the status
--     change, identity_verified (identity only), the is_verified refresh, the
--     withdrawal of pending proposals for any service the provider can no
--     longer work (provider_approved_categories), the audit row and the
--     notification (push is sent from notifications as for every other notice).
--   * Hired and in-progress jobs are untouched. A pending proposal whose client
--     is already paying to hire (an open xendit_hire_payments row) is also left
--     alone, so a payment is never stranded; the hire flow handles it as before.
--
-- The new enum value is added here and never USED while this file runs (only
-- inside plpgsql bodies and ::text comparisons), so the file applies in one
-- transaction.
--
-- DEPLOY ORDER: migration first. The old API never writes 'revoked', and the
-- new routes fail cleanly (function missing) if the API ships first.

begin;

alter type public.verification_status add value if not exists 'revoked';

alter table public.provider_verifications
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id),
  add column if not exists revoke_reason text check (char_length(revoke_reason) <= 500);

alter table public.provider_credentials
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id),
  add column if not exists revoke_reason text check (char_length(revoke_reason) <= 500);

alter table public.provider_credentials
  drop constraint if exists provider_credentials_status_check;
alter table public.provider_credentials
  add constraint provider_credentials_status_check
  check (status in ('pending', 'approved', 'rejected', 'revoked'));

-- A decided submission is final, except approved -> revoked (0068 refused all).
create or replace function public.provider_verifications_decided_is_final()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status::text <> 'pending' and new.status is distinct from old.status
     and not (old.status::text = 'approved' and new.status::text = 'revoked') then
    raise exception using errcode = 'TB409',
      message = 'This verification was already ' || old.status;
  end if;
  return new;
end;
$$;

-- Same rule for certificates (0068 enforced it only inside decide_credential).
create or replace function public.provider_credentials_decided_is_final()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status
     and not (old.status = 'approved' and new.status = 'revoked') then
    raise exception using errcode = 'TB409',
      message = 'This certificate was already ' || old.status;
  end if;
  return new;
end;
$$;
drop trigger if exists provider_credentials_decided_is_final on public.provider_credentials;
create trigger provider_credentials_decided_is_final
  before update of status on public.provider_credentials
  for each row execute function public.provider_credentials_decided_is_final();

-- A revoked identity counts like a rejection for the old-API guard (0068), so
-- an old is_verified = true write can never bring a revoked identity back.
-- Ordered by the latest decision time, which for a revoke is revoked_at.
create or replace function public.provider_latest_identity_rejected(p_provider_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select v.status::text in ('rejected', 'revoked')
      from public.provider_verifications v
     where v.provider_id = p_provider_id and v.status::text <> 'pending'
     order by coalesce(v.revoked_at, v.reviewed_at, v.updated_at, v.submitted_at) desc,
              v.created_at desc, v.id desc
     limit 1), false);
$$;

-- Admin Users list (0074): a revoked certificate shows as 'revoked'.
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
             WHEN bool_or(c.status = 'revoked') THEN 'revoked'
             WHEN bool_or(c.status = 'rejected') THEN 'rejected'
             ELSE NULL
           END AS status
           FROM provider_credentials c
          WHERE c.provider_id = pp.profile_id AND c.category_id = pp.category_id) cert ON true;

revoke all on public.admin_user_certificates from public, anon, authenticated;
grant select on public.admin_user_certificates to service_role;

-- p_kind: 'identity' (provider_verifications.id) | 'credential' (provider_credentials.id)
-- Errors: TB400 bad kind / reason, TB404 not found, TB409 not approved.
create or replace function public.admin_revoke_verification(
  p_kind text, p_id uuid, p_admin_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_provider uuid;
  v_status text;
  v_title text;
  v_verified boolean;
  v_withdrawn integer;
  v_body text;
begin
  if p_kind not in ('identity', 'credential') then
    raise exception using errcode = 'TB400', message = 'Unknown verification kind';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'TB400',
      message = 'Give a reason of 10 to 500 characters';
  end if;

  -- Lock order: the provider's pending applications, then the profiles row
  -- (the lock guard_job_skill in 0068 takes before it checks a proposal or a
  -- hire), then the submission/certificate row itself. A proposal sent while
  -- this runs either committed before (and is withdrawn below) or waits on the
  -- profiles lock and is then refused.
  if p_kind = 'identity' then
    select v.provider_id into v_provider from public.provider_verifications v where v.id = p_id;
  else
    select c.provider_id into v_provider from public.provider_credentials c where c.id = p_id;
  end if;
  if v_provider is null then
    raise exception using errcode = 'TB404',
      message = case when p_kind = 'identity' then 'Verification not found' else 'Certificate not found' end;
  end if;
  -- Hiring locks the application row and then (guard_job_skill) the profiles
  -- row; take them in that same order so a revoke and a hire never deadlock.
  perform 1 from public.job_applications a
   where a.provider_id = v_provider and a.status = 'pending'
   order by a.id
     for update;
  perform 1 from public.profiles where id = v_provider for update;

  if p_kind = 'identity' then
    select v.status::text into v_status
      from public.provider_verifications v where v.id = p_id for update;
  else
    select c.status, c.title into v_status, v_title
      from public.provider_credentials c where c.id = p_id for update;
  end if;
  if v_status <> 'approved' then
    raise exception using errcode = 'TB409',
      message = case when v_status = 'revoked' then 'This was already revoked'
                     else 'Only an approved verification can be revoked' end;
  end if;

  if p_kind = 'identity' then
    update public.provider_verifications
       set status = 'revoked', revoked_at = now(), revoked_by = p_admin_id,
           revoke_reason = v_reason
     where id = p_id;
    update public.provider_profiles
       set identity_verified = false
     where profile_id = v_provider;
  else
    update public.provider_credentials
       set status = 'revoked', revoked_at = now(), revoked_by = p_admin_id,
           revoke_reason = v_reason
     where id = p_id;
  end if;

  v_verified := public.refresh_provider_verified(v_provider);

  -- Not-yet-hired proposals for a service the provider can no longer work
  -- (provider_approved_categories, the rule guard_job_skill applies to new
  -- proposals) are withdrawn. This covers a secondary-service certificate too,
  -- where the primary Verified badge stays. Proposals the client is already
  -- paying for are left to the hire flow, which rechecks and refunds.
  with withdrawn as (
    update public.job_applications a
       set status = 'withdrawn', decided_at = now()
      from public.jobs j
     where j.id = a.job_id
       and a.provider_id = v_provider and a.status = 'pending'
       and not exists (
         select 1 from public.provider_approved_categories(v_provider) ok
          where ok.category_id = j.category_id)
       and not exists (
         select 1 from public.xendit_hire_payments x
          where x.application_id = a.id
            and x.status in ('creating', 'pending', 'processing', 'needs_review'))
    returning 1)
  select count(*)::int into v_withdrawn from withdrawn;

  v_body := case when p_kind = 'identity'
                 then 'Your ID verification was revoked: '
                 else 'Your ' || v_title || ' was revoked: ' end
            || v_reason
            || case when v_verified then ''
                    else ' Upload new documents to get verified again.' end;
  insert into public.notifications (recipient_id, type, title, body, data)
  values (v_provider, 'verification_update', 'Verification revoked', v_body,
          jsonb_build_object('kind', p_kind, 'id', p_id));

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (p_admin_id,
          case when p_kind = 'identity' then 'verification.revoke' else 'credential.revoke' end,
          case when p_kind = 'identity' then 'provider_verifications' else 'provider_credentials' end,
          p_id,
          jsonb_build_object('reason', v_reason, 'provider_id', v_provider,
                             'withdrawn_proposals', v_withdrawn));

  return jsonb_build_object(
    'provider_id', v_provider,
    'kind', p_kind,
    'status', 'revoked',
    'verified', v_verified,
    'withdrawn_proposals', v_withdrawn);
end;
$$;

revoke all on function public.admin_revoke_verification(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_verification(text, uuid, uuid, text) to service_role;
revoke all on function public.provider_credentials_decided_is_final() from public, anon, authenticated;

commit;
