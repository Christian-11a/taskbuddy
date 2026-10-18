-- Certificates required for verification.
--
-- WHAT: a provider is verified (provider_profiles.is_verified, the one flag
-- applications, hire funding, matching and admin filters read) only when BOTH
-- their identity check passed AND they hold an approved, unexpired credential
-- (provider_credentials) for their primary service category.
--   * provider_profiles.identity_verified holds the identity half. Until now
--     is_verified reflected identity only (set on identity approval in
--     verifications.service.ts markVerified, or inherited in
--     profiles.service.ts upsertProviderProfile; nothing ever cleared it), so
--     the backfill copies it across.
--   * refresh_provider_verified(provider) recomputes is_verified; 
--     refresh_all_providers_verified() does so for everyone (daily expiry tick)
--     and returns how many rows changed.
--   * Triggers recompute automatically when a credential changes or when the
--     primary category / identity flag changes, so no code path can forget.
--     The app still calls the functions explicitly (idempotent) and the daily
--     tick is still needed because expiry is time-based, not an UPDATE.
--
-- "Today" is Manila: (now() at time zone 'Asia/Manila')::date, the same day
-- credentials.service.ts computes (UTC+8). Expiry on that day is still valid;
-- the day after it is expired.
--
-- DEPLOY ORDER: safe either way.
--   * Migration first: the OLD API's markVerified writes only is_verified = true
--     (and false on reject). The BEFORE trigger below reads such a write, made
--     without touching identity_verified, as an identity decision and keeps
--     identity_verified in step, so identity approvals made in the window are
--     honoured and the certificate rule is still applied on top.
--   * API first: the new API's decision RPCs do not exist yet, so identity and
--     credential decisions fail cleanly (nothing half-written). Once this
--     migration runs, the backfill repairs any stranded approved submission.
-- BEHAVIOUR CHANGE: the backfill refreshes every provider, so providers who
-- are verified today but have no approved, unexpired certificate for their
-- primary service become UNVERIFIED (decision D5e) until they upload one and an
-- admin approves it. They KEEP identity_verified (it is set from an approved
-- submission OR from is_verified being true today), so a certificate is all
-- they still need. This includes test accounts.
-- PER-SERVICE: provider_approved_categories (matching, applications, hiring)
-- now needs identity_verified AND a valid certificate for each category, live.

begin;

alter table public.provider_profiles
  add column if not exists identity_verified boolean not null default false;

-- Backfill, safe to rerun, and it runs BEFORE the refresh below reads or
-- rewrites is_verified: identity_verified := true for every provider whose
-- LATEST DECIDED (approved or rejected) submission is approved, OR whose
-- is_verified is true right now (verified under the old identity-only rule,
-- possibly by hand with no submission). Pending submissions are ignored.
-- If the latest decision is a rejection and is_verified is false, the flag is
-- left alone, so a rerun never resurrects an identity that a later rejection
-- cleared; and it never clears anything. On reruns is_verified = true already
-- implies identity_verified under the new rule, so the second clause is inert.
update public.provider_profiles pp
   set identity_verified = true
 where not pp.identity_verified
   and (pp.is_verified
        or exists (
          select 1
            from (
              select distinct on (v.provider_id) v.provider_id, v.status
                from public.provider_verifications v
               where v.status <> 'pending' and v.provider_id = pp.profile_id
               order by v.provider_id,
                        coalesce(v.reviewed_at, v.updated_at, v.submitted_at) desc,
                        v.created_at desc, v.id desc
            ) latest
           where latest.status = 'approved'));

comment on column public.provider_profiles.identity_verified is
  'Identity check (ID + selfie) passed. is_verified additionally needs an approved, unexpired credential for the primary category; see refresh_provider_verified.';

-- Pure predicate shared by the refresh functions and the triggers.
create or replace function public.provider_has_valid_credential(
  p_provider_id uuid, p_category_id smallint)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.provider_credentials c
     where c.provider_id = p_provider_id
       and c.category_id = p_category_id
       and c.status = 'approved'
       and (c.expires_on is null
            or c.expires_on >= (now() at time zone 'Asia/Manila')::date)
  );
$$;

-- The refresh functions flag their own writes (transaction-local setting) so
-- the provider_profiles trigger below can tell them from an old-API write.
create or replace function public.refresh_provider_verified(p_provider_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v boolean;
begin
  perform set_config('taskbuddy.refreshing', 'on', true);
  update public.provider_profiles pp
     set is_verified = pp.identity_verified
                       and public.provider_has_valid_credential(pp.profile_id, pp.category_id)
   where pp.profile_id = p_provider_id
  returning pp.is_verified into v;
  perform set_config('taskbuddy.refreshing', 'off', true);
  return coalesce(v, false);
end;
$$;

create or replace function public.refresh_all_providers_verified()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform set_config('taskbuddy.refreshing', 'on', true);
  with changed as (
    update public.provider_profiles pp
       set is_verified = pp.identity_verified
                         and public.provider_has_valid_credential(pp.profile_id, pp.category_id)
     where pp.is_verified is distinct from
           (pp.identity_verified
            and public.provider_has_valid_credential(pp.profile_id, pp.category_id))
    returning 1
  )
  select count(*)::int into n from changed;
  perform set_config('taskbuddy.refreshing', 'off', true);
  return n;
end;
$$;

-- Triggers: keep is_verified right without relying on every caller.
-- 1) A profile is created, or its primary category / identity flag changes:
--    compute in BEFORE INSERT/UPDATE so there is no second write and no recursion.
-- The trigger also fires on is_verified, for the OLD API (markVerified writes
-- only is_verified: true on approve, false on reject). A write that CHANGES
-- is_verified WITHOUT changing identity_verified, made outside the refresh
-- functions, is read as an identity decision: identity_verified follows it,
-- EXCEPT that an old is_verified = true never grants identity while the
-- provider's latest decided submission is a rejection (identity stays as it
-- was, normally false; is_verified is recomputed below). Then is_verified is
-- recomputed with the certificate rule, so the old API can never verify
-- someone who has no valid certificate. Refresh writes are excluded by the
-- taskbuddy.refreshing flag (and could not trip the rule anyway: they only
-- write true when identity_verified is already true). On INSERT, an
-- is_verified = true row with identity_verified = false is treated the same way.
create or replace function public.provider_latest_identity_rejected(p_provider_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select v.status = 'rejected'
      from public.provider_verifications v
     where v.provider_id = p_provider_id and v.status <> 'pending'
     order by coalesce(v.reviewed_at, v.updated_at, v.submitted_at) desc,
              v.created_at desc, v.id desc
     limit 1), false);
$$;

create or replace function public.provider_profiles_sync_verified()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('taskbuddy.refreshing', true), 'off') <> 'on' then
    if tg_op = 'INSERT' then
      if coalesce(new.is_verified, false) and not new.identity_verified
         and not public.provider_latest_identity_rejected(new.profile_id) then
        new.identity_verified := true;
      end if;
    elsif new.is_verified is distinct from old.is_verified
          and new.identity_verified is not distinct from old.identity_verified then
      if not coalesce(new.is_verified, false) then
        new.identity_verified := false;
      elsif not public.provider_latest_identity_rejected(new.profile_id) then
        new.identity_verified := true;
      end if;
    end if;
  end if;
  new.is_verified := new.identity_verified
    and public.provider_has_valid_credential(new.profile_id, new.category_id);
  return new;
end;
$$;

-- A decided submission is final. The OLD API's review() updates by id without a
-- pending check, so a webhook that read 'pending' earlier could overwrite a
-- rejection (or approval) made since. Refuse any change of status once decided
-- (decisions go through the pending-only decide_* functions).
create or replace function public.provider_verifications_decided_is_final()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception using errcode = 'TB409',
      message = 'This verification was already ' || old.status;
  end if;
  return new;
end;
$$;
drop trigger if exists provider_verifications_decided_is_final on public.provider_verifications;
create trigger provider_verifications_decided_is_final
  before update of status on public.provider_verifications
  for each row execute function public.provider_verifications_decided_is_final();

drop trigger if exists provider_profiles_sync_verified on public.provider_profiles;
create trigger provider_profiles_sync_verified
  before insert or update of identity_verified, category_id, is_verified on public.provider_profiles
  for each row execute function public.provider_profiles_sync_verified();

-- 2) A credential is added, approved, rejected, re-dated or removed.
create or replace function public.provider_credentials_sync_verified()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_provider_verified(old.provider_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_provider_verified(new.provider_id);
  end if;
  return null;
end;
$$;

drop trigger if exists provider_credentials_sync_verified on public.provider_credentials;
create trigger provider_credentials_sync_verified
  after insert or delete or update of status, expires_on, category_id, provider_id
  on public.provider_credentials
  for each row execute function public.provider_credentials_sync_verified();

-- De-dup for expiry notices: one 30-day warning and one "expired" notice per
-- credential, each CLAIMED with UPDATE ... WHERE ... IS NULL RETURNING so
-- concurrent ticks cannot both send it.
do $$
declare
  first_run boolean := not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'provider_credentials'
       and column_name = 'expired_notified_at');
begin
  alter table public.provider_credentials
    add column if not exists expiry_notified_at timestamptz;
  alter table public.provider_credentials
    add column if not exists expired_notified_at timestamptz;
  -- Credentials that were already expired before this migration are history,
  -- not news: do not announce them on the first tick.
  if first_run then
    update public.provider_credentials
       set expired_notified_at = now()
     where status = 'approved' and expires_on is not null
       and expires_on < (now() at time zone 'Asia/Manila')::date;
  end if;
end $$;

-- A re-dated credential starts its notice cycle again.
create or replace function public.provider_credentials_reset_notices()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.expires_on is distinct from old.expires_on then
    new.expiry_notified_at := null;
    new.expired_notified_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists provider_credentials_reset_notices on public.provider_credentials;
create trigger provider_credentials_reset_notices
  before update of expires_on on public.provider_credentials
  for each row execute function public.provider_credentials_reset_notices();

-- Daily tick: warn 30 days before expiry (once per credential), tell the
-- provider when an APPROVED certificate has actually passed its expiry date
-- (once per credential), and refresh every provider's flag. Losing the flag for
-- any other reason sends no "expired" notice.
create or replace function public.credential_expiry_tick()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_warned int;
  v_expired int;
  v_changed int;
begin
  with due as (
    update public.provider_credentials c
       set expiry_notified_at = now()
     where c.status = 'approved'
       and c.expires_on is not null
       and c.expires_on >= v_today
       and c.expires_on <= v_today + 30
       and c.expiry_notified_at is null
    returning c.provider_id, c.title, c.expires_on
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, data)
    select provider_id, 'verification_update', 'Your certificate expires soon',
           'Your ' || title || ' expires on ' || to_char(expires_on, 'Mon DD, YYYY')
             || '. Upload a renewed certificate to stay verified.',
           '{}'::jsonb
      from due
    returning 1
  )
  select count(*)::int into v_warned from ins;

  -- Refresh first so the wording below reflects the new state.
  v_changed := public.refresh_all_providers_verified();

  with gone as (
    update public.provider_credentials c
       set expired_notified_at = now()
     where c.status = 'approved'
       and c.expires_on is not null
       and c.expires_on < v_today
       and c.expired_notified_at is null
    returning c.provider_id, c.category_id, c.title
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, data)
    select g.provider_id, 'verification_update', 'Your certificate expired',
           case
             when public.provider_has_valid_credential(g.provider_id, g.category_id)
               then 'Your ' || g.title || ' has expired. Your other certificate for this service is still valid.'
             when pp.category_id = g.category_id
               then 'Your ' || g.title || ' has expired, so your verified status was removed. Upload a current certificate to send proposals again.'
             else 'Your ' || g.title || ' has expired, so you cannot take jobs in that service until you upload a current certificate.'
           end,
           '{}'::jsonb
      from gone g
      left join public.provider_profiles pp on pp.profile_id = g.provider_id
    returning 1
  )
  select count(*)::int into v_expired from ins;

  return jsonb_build_object('warned', v_warned, 'expired', v_expired, 'changed', v_changed);
end;
$$;

-- Identity decision, ONE transaction: the submission row (only while still
-- 'pending'; an already-decided row is never overwritten),
-- provider_profiles.identity_verified, the is_verified refresh, the admin audit
-- row and the provider's notification. A failure anywhere (including the audit
-- or the notice) rolls ALL of it back, so there is never a saved decision with
-- no audit or no notice, nor an approved submission with identity_verified
-- false. Used by the admin legacy path and the Stripe Identity webhook
-- (p_reviewed_by null: no audit row, "Verification failed" wording).
-- Errors: TB404 not found, TB409 already decided / no service profile.
create or replace function public.decide_identity_verification(
  p_verification_id uuid, p_approve boolean, p_reviewed_by uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ver public.provider_verifications%rowtype;
  v_status public.verification_status := case when p_approve then 'approved' else 'rejected' end;
  v_verified boolean;
  v_primary_ok boolean;
  v_pending_primary boolean;
  v_title text;
  v_body text;
begin
  select * into v_ver from public.provider_verifications
   where id = p_verification_id for update;
  if not found then
    raise exception using errcode = 'TB404', message = 'Verification not found';
  end if;
  if v_ver.status <> 'pending' then
    raise exception using errcode = 'TB409', message = 'This verification was already ' || v_ver.status;
  end if;
  if p_approve and not exists (select 1 from public.provider_profiles where profile_id = v_ver.provider_id) then
    raise exception using errcode = 'TB409',
      message = 'This provider has not set up their service profile yet';
  end if;

  update public.provider_verifications
     set status = v_status, reviewed_by = p_reviewed_by, reviewed_at = now(),
         rejection_reason = case when p_approve then null else left(p_reason, 500) end
   where id = p_verification_id and status = 'pending';

  update public.provider_profiles
     set identity_verified = p_approve
   where profile_id = v_ver.provider_id;

  v_verified := public.refresh_provider_verified(v_ver.provider_id);
  select public.provider_has_valid_credential(pp.profile_id, pp.category_id),
         exists (select 1 from public.provider_credentials c
                  where c.provider_id = pp.profile_id and c.status = 'pending'
                    and c.category_id = pp.category_id)
    into v_primary_ok, v_pending_primary
    from public.provider_profiles pp where pp.profile_id = v_ver.provider_id;

  if p_approve then
    if v_verified then
      v_title := 'Verification approved';
      v_body := 'Your ID and certificate are verified. Your profile now shows a verified badge.';
    elsif coalesce(v_pending_primary, false) then
      v_title := 'ID verified';
      v_body := 'Your ID has been verified. Your certificate for your main service is waiting for review.';
    else
      v_title := 'Upload your certificate to finish verification';
      v_body := 'Your ID has been verified. Upload a certificate for your main service (TESDA, PRC or trade) to finish verification.';
    end if;
  elsif p_reviewed_by is null then
    v_title := 'Verification failed';
    v_body := coalesce(nullif(btrim(p_reason), ''), 'We could not verify your ID. You can try again.');
  else
    v_title := 'Verification needs changes';
    v_body := case when nullif(btrim(coalesce(p_reason, '')), '') is not null
                   then 'Your verification needs changes: ' || btrim(p_reason)
                   else 'Your verification needs changes. You can submit new documents.' end;
  end if;
  insert into public.notifications (recipient_id, type, title, body, data)
  values (v_ver.provider_id, 'verification_update', v_title, v_body, '{}'::jsonb);

  if p_reviewed_by is not null then
    insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
    values (p_reviewed_by,
            case when p_approve then 'verification.approve' else 'verification.reject' end,
            'provider_verifications', p_verification_id,
            case when p_approve then '{}'::jsonb else jsonb_build_object('reason', p_reason) end);
  end if;

  return jsonb_build_object(
    'provider_id', v_ver.provider_id,
    'status', v_status,
    'identity_verified', p_approve,
    'verified', v_verified,
    'primary_certificate_valid', coalesce(v_primary_ok, false),
    'has_pending_certificate', coalesce(v_pending_primary, false));
end;
$$;

-- Credential decision, ONE transaction: the pending-only status change, the
-- refresh, the admin audit row and the notification. Errors: TB404 not found,
-- TB409 already decided, TB400 an expired certificate cannot be approved.
create or replace function public.decide_credential(
  p_credential_id uuid, p_approve boolean, p_reviewed_by uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cred public.provider_credentials%rowtype;
  v_status text := case when p_approve then 'approved' else 'rejected' end;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_verified boolean;
  v_identity boolean;
  v_primary_cat smallint;
  v_primary_ok boolean;
  v_pending_primary boolean;
  v_title text;
  v_body text;
begin
  select * into v_cred from public.provider_credentials
   where id = p_credential_id for update;
  if not found then
    raise exception using errcode = 'TB404', message = 'Credential not found';
  end if;
  if v_cred.status <> 'pending' then
    raise exception using errcode = 'TB409', message = 'This certificate was already ' || v_cred.status;
  end if;
  if p_approve and v_cred.expires_on is not null and v_cred.expires_on < v_today then
    raise exception using errcode = 'TB400',
      message = 'This certificate expired on ' || v_cred.expires_on || '. Ask the provider to upload a current one.';
  end if;

  update public.provider_credentials
     set status = v_status, reviewed_by = p_reviewed_by, reviewed_at = now(),
         rejection_reason = case when p_approve then null else left(p_reason, 500) end
   where id = p_credential_id and status = 'pending';

  v_verified := public.refresh_provider_verified(v_cred.provider_id);
  select pp.identity_verified, pp.category_id into v_identity, v_primary_cat
    from public.provider_profiles pp where pp.profile_id = v_cred.provider_id;
  v_primary_ok := public.provider_has_valid_credential(v_cred.provider_id, v_primary_cat);
  v_pending_primary := exists (
    select 1 from public.provider_credentials c
     where c.provider_id = v_cred.provider_id and c.status = 'pending'
       and c.category_id = v_primary_cat);

  if not p_approve then
    -- Always, even if the provider stays verified through another certificate.
    v_title := 'Verification needs changes';
    v_body := coalesce(nullif(btrim(p_reason), ''), 'Your certificate was not accepted.');
  elsif v_verified then
    v_title := 'You are verified';
    v_body := 'Your ' || v_cred.title || ' was approved. Your profile now shows a verified badge.';
  elsif not coalesce(v_identity, false) then
    v_title := 'Credential approved';
    v_body := 'Your ' || v_cred.title || ' was approved. Finish your ID check to become verified.';
  elsif not v_primary_ok then
    v_title := 'Credential approved';
    v_body := 'Your ' || v_cred.title || ' was approved. ' ||
      case when v_pending_primary
           then 'Your certificate for your main service is still waiting for review.'
           else 'Upload a certificate for your main service to become verified.' end;
  else
    v_title := 'Credential approved';
    v_body := 'Your ' || v_cred.title || ' was approved. You can now take jobs in that service.';
  end if;
  insert into public.notifications (recipient_id, type, title, body, data)
  values (v_cred.provider_id, 'verification_update', v_title, v_body, '{}'::jsonb);

  if p_reviewed_by is not null then
    insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
    values (p_reviewed_by,
            case when p_approve then 'credential.approve' else 'credential.reject' end,
            'provider_credentials', p_credential_id,
            case when p_approve then '{}'::jsonb else jsonb_build_object('reason', btrim(p_reason)) end);
  end if;

  return jsonb_build_object(
    'provider_id', v_cred.provider_id,
    'title', v_cred.title,
    'category_id', v_cred.category_id,
    'status', v_status,
    'is_primary', v_primary_cat is not distinct from v_cred.category_id,
    'identity_verified', coalesce(v_identity, false),
    'verified', v_verified,
    'primary_certificate_valid', v_primary_ok,
    'has_pending_primary_certificate', v_pending_primary);
end;
$$;

-- One decision per verification case, identity and certificate in ONE
-- transaction (a failure in either part rolls the whole call back).
--   p_verification_id: pending provider_verifications row, or null (certificate-only
--                      case, e.g. Stripe already approved identity)
--   p_credential_id:   pending provider_credentials row, or null
--   p_decision:        'approve' | 'reject'
--   p_failed:          reject only: subset of {'id','selfie','certificate'}
--   p_note:            reason shown to the provider
-- Approve: pending parts are approved. Reject: failed parts are rejected, any
-- other pending part is approved (the admin judged it fine). Errors use TB409
-- (conflict) / TB400 (bad request).
create or replace function public.admin_decide_verification_case(
  p_admin uuid, p_verification_id uuid, p_credential_id uuid,
  p_decision text, p_failed text[], p_note text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ver public.provider_verifications%rowtype;
  v_cred public.provider_credentials%rowtype;
  v_provider uuid;
  v_failed text[] := coalesce(p_failed, '{}');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id_fail boolean;
  v_cert_fail boolean;
  v_ver_status text;
  v_cred_status text;
  v_verified boolean;
  v_identity boolean;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_primary_cat smallint;
  v_parts text[] := '{}';
  v_title text;
  v_body text;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'TB400', message = 'Decision must be approve or reject';
  end if;
  if p_verification_id is null and p_credential_id is null then
    raise exception using errcode = 'TB400', message = 'Nothing to review';
  end if;
  if not v_failed <@ array['id', 'selfie', 'certificate'] then
    raise exception using errcode = 'TB400', message = 'failed_parts may only contain id, selfie, certificate';
  end if;
  if p_decision = 'reject' and cardinality(v_failed) = 0 then
    raise exception using errcode = 'TB400', message = 'Pick at least one failed part';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception using errcode = 'TB400', message = 'A note is required when rejecting';
  end if;
  if p_decision = 'approve' then v_failed := '{}'; end if;
  v_id_fail := v_failed && array['id', 'selfie'];
  v_cert_fail := 'certificate' = any (v_failed);

  if p_verification_id is not null then
    select * into v_ver from public.provider_verifications
     where id = p_verification_id for update;
    if not found then
      raise exception using errcode = 'TB409', message = 'Verification not found';
    end if;
    if v_ver.status <> 'pending' then
      raise exception using errcode = 'TB409', message = 'This verification was already ' || v_ver.status;
    end if;
    v_provider := v_ver.provider_id;
  end if;
  if p_credential_id is not null then
    select * into v_cred from public.provider_credentials
     where id = p_credential_id for update;
    if not found then
      raise exception using errcode = 'TB409', message = 'Credential not found';
    end if;
    if v_cred.status <> 'pending' then
      raise exception using errcode = 'TB409', message = 'This certificate was already ' || v_cred.status;
    end if;
    if v_provider is not null and v_provider <> v_cred.provider_id then
      raise exception using errcode = 'TB400', message = 'Verification and certificate belong to different providers';
    end if;
    v_provider := v_cred.provider_id;
  end if;

  if not exists (select 1 from public.provider_profiles where profile_id = v_provider) then
    raise exception using errcode = 'TB409', message = 'This provider has not set up their service profile yet';
  end if;
  if p_verification_id is null and v_id_fail then
    raise exception using errcode = 'TB400', message = 'Identity was already approved; only the certificate can fail';
  end if;
  if p_credential_id is null and v_cert_fail then
    raise exception using errcode = 'TB400', message = 'There is no pending certificate on this case';
  end if;

  if p_verification_id is not null then
    v_ver_status := case when v_id_fail then 'rejected' else 'approved' end;
    update public.provider_verifications
       set status = v_ver_status::public.verification_status, reviewed_by = p_admin, reviewed_at = now(),
           rejection_reason = case when v_id_fail then v_note end
     where id = p_verification_id;
    update public.provider_profiles
       set identity_verified = (v_ver_status = 'approved')
     where profile_id = v_provider;
  end if;

  if p_credential_id is not null then
    v_cred_status := case when v_cert_fail then 'rejected' else 'approved' end;
    if v_cred_status = 'approved' and v_cred.expires_on is not null and v_cred.expires_on < v_today then
      raise exception using errcode = 'TB400',
        message = 'This certificate expired on ' || v_cred.expires_on || '. Ask the provider to upload a current one.';
    end if;
    update public.provider_credentials
       set status = v_cred_status, reviewed_by = p_admin, reviewed_at = now(),
           rejection_reason = case when v_cert_fail then left(v_note, 500) else null end
     where id = p_credential_id;
  end if;

  v_verified := public.refresh_provider_verified(v_provider);
  select identity_verified into v_identity from public.provider_profiles where profile_id = v_provider;

  if 'id' = any (v_failed) then v_parts := array_append(v_parts, 'ID photo'); end if;
  if 'selfie' = any (v_failed) then v_parts := array_append(v_parts, 'selfie'); end if;
  if v_cert_fail then v_parts := array_append(v_parts, 'certificate'); end if;

  select pp.category_id into v_primary_cat from public.provider_profiles pp where pp.profile_id = v_provider;
  -- A reject decision ALWAYS says what to redo, even when the provider stays
  -- verified through another certificate.
  if p_decision = 'reject' then
    v_title := 'Verification needs changes';
    v_body := 'Please redo: ' || array_to_string(v_parts, ', ') || '. ' || v_note
              || case when v_verified then ' Your verified status is unchanged.' else '' end;
  elsif v_verified then
    v_title := 'You are verified';
    v_body := 'Your ID and certificate were approved. Your profile now shows a verified badge.';
  elsif v_identity and exists (select 1 from public.provider_credentials c
                                where c.provider_id = v_provider and c.status = 'pending'
                                  and c.category_id = v_primary_cat) then
    v_title := 'ID verified';
    v_body := 'Your ID is verified. Your certificate is waiting for review.';
  elsif v_identity then
    v_title := 'Upload your certificate to finish verification';
    v_body := 'Your ID is verified. Upload a certificate for your main service to finish verification.';
  elsif p_credential_id is not null then
    v_title := 'Certificate approved';
    v_body := 'Your certificate was approved. Finish your ID check to become verified.';
  else
    v_title := 'Verification updated';
    v_body := 'Your verification was reviewed.';
  end if;
  insert into public.notifications (recipient_id, type, title, body, data)
  values (v_provider, 'verification_update', v_title, v_body, '{}'::jsonb);

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (p_admin, 'verification.case_' || p_decision, 'provider_verifications',
          coalesce(p_verification_id, p_credential_id),
          jsonb_build_object('verification_id', p_verification_id, 'credential_id', p_credential_id,
                             'failed', v_failed, 'note', v_note));

  return jsonb_build_object(
    'provider_id', v_provider,
    'identity', case when p_verification_id is null then 'unchanged' else v_ver_status end,
    'certificate', case when p_credential_id is null then 'unchanged' else v_cred_status end,
    'identity_verified', v_identity,
    'verified', v_verified);
end;
$$;

-- Per-service qualification (owner rule: not certified for a service -> cannot
-- work in it). provider_approved_categories gates matching, applications and
-- hiring per category. Validity is checked LIVE (Manila date), so an expiry
-- takes effect immediately even if the daily tick is late:
--   * primary category: identity_verified AND a valid certificate for it
--   * each approved secondary category: identity_verified AND a valid
--     certificate for THAT category
-- is_verified stays the profile badge (primary rule).
create or replace function public.provider_approved_categories(p_provider_id uuid)
returns table(category_id smallint)
language sql stable security definer set search_path = public as $$
  select pp.category_id from provider_profiles pp
  where pp.profile_id = p_provider_id and pp.identity_verified
    and public.provider_has_valid_credential(pp.profile_id, pp.category_id)
  union
  select sc.category_id from provider_secondary_categories sc
  join provider_profiles pp on pp.profile_id = sc.provider_id
  where sc.provider_id = p_provider_id and pp.identity_verified
    and public.provider_has_valid_credential(sc.provider_id, sc.category_id);
$$;
revoke all on function public.provider_approved_categories(uuid) from public, anon, authenticated;
grant execute on function public.provider_approved_categories(uuid) to service_role;

-- Same body as 0043, with a clearer refusal when the missing piece is the
-- certificate for that service.
create or replace function public.guard_job_skill()
returns trigger language plpgsql set search_path = public as $$
declare provider uuid; category smallint;
begin
  if tg_table_name = 'job_applications' then
    provider := new.provider_id;
    select category_id into strict category from jobs where id = new.job_id;
  else
    if new.assigned_provider_id is null or
      (new.assigned_provider_id is not distinct from old.assigned_provider_id and new.category_id = old.category_id) then return new; end if;
    provider := new.assigned_provider_id;
    category := new.category_id;
  end if;
  perform 1 from profiles where id = provider for update;
  if not exists (select 1 from provider_approved_categories(provider) where category_id = category) then
    if exists (select 1 from provider_profiles pp
                where pp.profile_id = provider and pp.identity_verified
                  and (pp.category_id = category
                       or exists (select 1 from provider_secondary_categories sc
                                   where sc.provider_id = provider and sc.category_id = category))) then
      raise exception 'You need an approved, unexpired certificate for % to take this job',
        (select name from service_categories where id = category);
    end if;
    raise exception 'This job requires an approved skill on your verified provider profile';
  end if;
  return new;
end;
$$;

-- Matching: eligibility per category now comes from provider_approved_categories
-- alone (identity + live certificate); the stored is_verified flag is the
-- primary-service badge and must not hide a provider certified for a
-- secondary service. Same body as 0037 otherwise.
create or replace function fn_job_provider_features(p_job_id uuid)
returns table (
    provider_id uuid,
    skills_match smallint,
    distance_km numeric,
    provider_avg_rating numeric,
    provider_completed_jobs integer,
    provider_availability smallint,
    job_idle_duration_hrs numeric,
    provider_response_time_hrs numeric,
    provider_years_experience numeric,
    hour_posted smallint,
    provider_skill_category text,
    day_of_week text,
    job_urgency text,
    job_description text,
    provider_bio text
)
language sql stable as $$
    select
        pp.profile_id,
        1::smallint,
        round(haversine_km(j.latitude, j.longitude, pr.latitude, pr.longitude)::numeric, 2),
        coalesce(pp.cached_avg_rating, 3.0),
        pp.cached_completed_jobs,
        pp.is_available::int::smallint,
        round((extract(epoch from (now() - j.posted_at)) / 3600)::numeric, 2),
        coalesce(pp.cached_avg_response_hrs, 2.0),
        pp.years_experience,
        extract(hour from j.posted_at at time zone 'Asia/Manila')::smallint,
        (select name from service_categories where id = j.category_id),
        trim(to_char(j.posted_at at time zone 'Asia/Manila', 'Day')),
        j.urgency::text,
        j.description,
        pp.bio
    from jobs j
    cross join provider_profiles pp
    join profiles pr on pr.id = pp.profile_id
    join service_categories sc on sc.id = pp.category_id
    where j.id = p_job_id
      and j.category_id in (select category_id from provider_approved_categories(pp.profile_id))
      and pp.is_available
      and pp.bio is not null
      and pr.deactivated_at is null
      and pr.deleted_at is null
      and pr.latitude is not null and pr.longitude is not null
      and not exists (select 1 from job_applications ja
                      where ja.job_id = j.id and ja.provider_id = pp.profile_id)
      and haversine_km(j.latitude, j.longitude, pr.latitude, pr.longitude)
          <= pp.service_radius_km;
$$;

-- D5e backfill: verified providers without a valid certificate lose the flag.
select public.refresh_all_providers_verified();

revoke all on function public.provider_has_valid_credential(uuid, smallint) from public, anon, authenticated;
revoke all on function public.refresh_provider_verified(uuid) from public, anon, authenticated;
revoke all on function public.refresh_all_providers_verified() from public, anon, authenticated;
revoke all on function public.provider_profiles_sync_verified() from public, anon, authenticated;
revoke all on function public.provider_credentials_sync_verified() from public, anon, authenticated;
grant execute on function public.provider_has_valid_credential(uuid, smallint) to service_role;
grant execute on function public.refresh_provider_verified(uuid) to service_role;
grant execute on function public.refresh_all_providers_verified() to service_role;
revoke all on function public.credential_expiry_tick() from public, anon, authenticated;
revoke all on function public.admin_decide_verification_case(uuid, uuid, uuid, text, text[], text) from public, anon, authenticated;
revoke all on function public.provider_credentials_reset_notices() from public, anon, authenticated;
revoke all on function public.decide_identity_verification(uuid, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.decide_credential(uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.decide_identity_verification(uuid, boolean, uuid, text) to service_role;
grant execute on function public.decide_credential(uuid, boolean, uuid, text) to service_role;
revoke all on function public.provider_latest_identity_rejected(uuid) from public, anon, authenticated;
revoke all on function public.provider_verifications_decided_is_final() from public, anon, authenticated;
grant execute on function public.credential_expiry_tick() to service_role;
grant execute on function public.admin_decide_verification_case(uuid, uuid, uuid, text, text[], text) to service_role;

commit;
