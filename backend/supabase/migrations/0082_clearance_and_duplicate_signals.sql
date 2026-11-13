-- Provider screening beyond identity and certificate (thesis panel P3-2):
--   1. NBI or police clearance as part of verification.
--   2. Duplicate signals for the admin: the same certificate or clearance
--      number, the same uploaded document file, or the same phone number on
--      another account.
--
-- CLEARANCE
--   provider_clearances holds one row per upload: type (nbi | police), the
--   clearance number, its expiry (required: clearances are time-limited), the
--   private photo (provider-credentials bucket, "<provider_id>/<uuid>.<ext>"),
--   and the same decided/revoked fields as certificates (0054, 0080).
--   It counts toward Verified only while verification_settings.require_clearance
--   is true. The switch starts OFF so no provider loses Verified before the app
--   can upload a clearance; set_clearance_required(true) turns it on and
--   recomputes every provider in the same call.
--   With it on, is_verified and provider_approved_categories (the eligibility
--   rule for proposals, hiring and matching) also need an approved, unexpired
--   clearance. Bodies otherwise as in 0068.
--
-- DUPLICATES
--   provider_duplicate_signals(provider) lists other accounts that share:
--     certificate_number / clearance_number (letters and digits only, 4+),
--     document (identical uploaded file: same storage eTag, in the
--               verification-docs or provider-credentials bucket),
--     phone (the last 10 digits).
--   Signals only inform the admin; nothing is blocked automatically.
--
-- DEPLOY ORDER: migration first (the API calls the new functions).

begin;

-- ---------------------------------------------------------------------------
-- Settings: is a clearance required for Verified?
-- ---------------------------------------------------------------------------
create table if not exists public.verification_settings (
  id boolean primary key default true check (id),
  require_clearance boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.verification_settings (id) values (true) on conflict (id) do nothing;
alter table public.verification_settings enable row level security;
revoke all on public.verification_settings from public, anon, authenticated;
grant select, update on public.verification_settings to service_role;

-- ---------------------------------------------------------------------------
-- Clearances
-- ---------------------------------------------------------------------------
create table if not exists public.provider_clearances (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references public.provider_profiles(profile_id) on delete cascade,
  clearance_type    text not null check (clearance_type in ('nbi', 'police')),
  clearance_number  text not null check (char_length(btrim(clearance_number)) between 2 and 60),
  issued_on         date,
  expires_on        date not null,
  document_path     text not null unique check (document_path like provider_id::text || '/%'),
  status            text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  rejection_reason  text check (char_length(rejection_reason) <= 500),
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  revoked_at        timestamptz,
  revoked_by        uuid references public.profiles(id),
  revoke_reason     text check (char_length(revoke_reason) <= 500),
  created_at        timestamptz not null default now(),
  check (issued_on is null or expires_on >= issued_on)
);
create index if not exists provider_clearances_provider
  on public.provider_clearances (provider_id, created_at desc);
create index if not exists provider_clearances_pending
  on public.provider_clearances (created_at) where status = 'pending';
-- One clearance under review at a time.
create unique index if not exists provider_clearances_one_pending
  on public.provider_clearances (provider_id) where status = 'pending';

alter table public.provider_clearances enable row level security;
revoke all on public.provider_clearances from public, anon, authenticated;
grant all on public.provider_clearances to service_role;

-- A decision is final, except approved -> revoked (same rule as 0080).
create or replace function public.provider_clearances_decided_is_final()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status
     and not (old.status = 'approved' and new.status = 'revoked') then
    raise exception using errcode = 'TB409',
      message = 'This clearance was already ' || old.status;
  end if;
  return new;
end;
$$;
drop trigger if exists provider_clearances_decided_is_final on public.provider_clearances;
create trigger provider_clearances_decided_is_final
  before update of status on public.provider_clearances
  for each row execute function public.provider_clearances_decided_is_final();

-- Clearance rule: met when not required, or with an approved, unexpired one
-- ("today" is Manila, as in 0068).
create or replace function public.provider_clearance_ok(p_provider_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((select s.require_clearance from public.verification_settings s where s.id), false)
      or exists (
        select 1 from public.provider_clearances c
         where c.provider_id = p_provider_id
           and c.status = 'approved'
           and c.expires_on >= (now() at time zone 'Asia/Manila')::date);
$$;

-- ---------------------------------------------------------------------------
-- Verified and eligibility now include the clearance rule (bodies from 0068).
-- ---------------------------------------------------------------------------
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
                       and public.provider_clearance_ok(pp.profile_id)
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
                         and public.provider_clearance_ok(pp.profile_id)
     where pp.is_verified is distinct from
           (pp.identity_verified
            and public.provider_has_valid_credential(pp.profile_id, pp.category_id)
            and public.provider_clearance_ok(pp.profile_id))
    returning 1
  )
  select count(*)::int into n from changed;
  perform set_config('taskbuddy.refreshing', 'off', true);
  return n;
end;
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
    and public.provider_has_valid_credential(new.profile_id, new.category_id)
    and public.provider_clearance_ok(new.profile_id);
  return new;
end;
$$;

create or replace function public.provider_approved_categories(p_provider_id uuid)
returns table(category_id smallint)
language sql stable security definer set search_path = public as $$
  select pp.category_id from provider_profiles pp
  where pp.profile_id = p_provider_id and pp.identity_verified
    and public.provider_has_valid_credential(pp.profile_id, pp.category_id)
    and public.provider_clearance_ok(pp.profile_id)
  union
  select sc.category_id from provider_secondary_categories sc
  join provider_profiles pp on pp.profile_id = sc.provider_id
  where sc.provider_id = p_provider_id and pp.identity_verified
    and public.provider_has_valid_credential(sc.provider_id, sc.category_id)
    and public.provider_clearance_ok(sc.provider_id);
$$;

-- The proposal / hire guard (0068) names the missing clearance instead of
-- reporting it as a missing certificate. Body otherwise as in 0068.
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
                where pp.profile_id = provider and pp.identity_verified)
       and not public.provider_clearance_ok(provider) then
      raise exception 'You need an approved, unexpired NBI or police clearance to take jobs';
    end if;
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

-- A clearance added, decided, re-dated or removed: recompute that provider.
create or replace function public.provider_clearances_sync_verified()
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
drop trigger if exists provider_clearances_sync_verified on public.provider_clearances;
create trigger provider_clearances_sync_verified
  after insert or delete or update of status, expires_on, provider_id
  on public.provider_clearances
  for each row execute function public.provider_clearances_sync_verified();

-- Turn the requirement on or off and recompute everyone now. Returns how many
-- providers' Verified changed.
create or replace function public.set_clearance_required(p_required boolean)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  update public.verification_settings
     set require_clearance = p_required, updated_at = now()
   where id;
  return public.refresh_all_providers_verified();
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin decision on a pending clearance, one transaction (as decide_credential).
-- Errors: TB404 not found, TB409 already decided, TB400 expired.
-- ---------------------------------------------------------------------------
create or replace function public.decide_clearance(
  p_clearance_id uuid, p_approve boolean, p_reviewed_by uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.provider_clearances%rowtype;
  v_status text := case when p_approve then 'approved' else 'rejected' end;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_verified boolean;
  v_label text;
begin
  select * into v_row from public.provider_clearances where id = p_clearance_id for update;
  if not found then
    raise exception using errcode = 'TB404', message = 'Clearance not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception using errcode = 'TB409', message = 'This clearance was already ' || v_row.status;
  end if;
  if p_approve and v_row.expires_on < v_today then
    raise exception using errcode = 'TB400',
      message = 'This clearance expired on ' || v_row.expires_on || '. Ask the provider to upload a current one.';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception using errcode = 'TB400', message = 'Give a reason for the rejection';
  end if;

  update public.provider_clearances
     set status = v_status, reviewed_by = p_reviewed_by, reviewed_at = now(),
         rejection_reason = case when p_approve then null else left(btrim(p_reason), 500) end
   where id = p_clearance_id and status = 'pending';

  v_verified := public.refresh_provider_verified(v_row.provider_id);
  v_label := case when v_row.clearance_type = 'nbi' then 'NBI clearance' else 'police clearance' end;

  insert into public.notifications (recipient_id, type, title, body, data)
  values (v_row.provider_id, 'verification_update',
          case when p_approve then 'Clearance approved' else 'Verification needs changes' end,
          case when p_approve then 'Your ' || v_label || ' was approved.'
               else 'Your ' || v_label || ' was not accepted: ' || btrim(p_reason) end,
          jsonb_build_object('kind', 'clearance', 'id', p_clearance_id));

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (p_reviewed_by,
          case when p_approve then 'clearance.approve' else 'clearance.reject' end,
          'provider_clearances', p_clearance_id,
          case when p_approve then jsonb_build_object('provider_id', v_row.provider_id)
               else jsonb_build_object('provider_id', v_row.provider_id, 'reason', btrim(p_reason)) end);

  return jsonb_build_object('provider_id', v_row.provider_id, 'status', v_status, 'verified', v_verified);
end;
$$;

-- ---------------------------------------------------------------------------
-- Revoke now also takes p_kind = 'clearance' (body from 0080 otherwise).
-- ---------------------------------------------------------------------------
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
  if p_kind not in ('identity', 'credential', 'clearance') then
    raise exception using errcode = 'TB400', message = 'Unknown verification kind';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'TB400',
      message = 'Give a reason of 10 to 500 characters';
  end if;

  -- Lock order as in 0080: pending applications, then profiles, then the row.
  if p_kind = 'identity' then
    select v.provider_id into v_provider from public.provider_verifications v where v.id = p_id;
  elsif p_kind = 'credential' then
    select c.provider_id into v_provider from public.provider_credentials c where c.id = p_id;
  else
    select c.provider_id into v_provider from public.provider_clearances c where c.id = p_id;
  end if;
  if v_provider is null then
    raise exception using errcode = 'TB404',
      message = case p_kind when 'identity' then 'Verification not found'
                            when 'credential' then 'Certificate not found'
                            else 'Clearance not found' end;
  end if;
  perform 1 from public.job_applications a
   where a.provider_id = v_provider and a.status = 'pending'
   order by a.id
     for update;
  perform 1 from public.profiles where id = v_provider for update;

  if p_kind = 'identity' then
    select v.status::text into v_status
      from public.provider_verifications v where v.id = p_id for update;
  elsif p_kind = 'credential' then
    select c.status, c.title into v_status, v_title
      from public.provider_credentials c where c.id = p_id for update;
  else
    select c.status,
           case when c.clearance_type = 'nbi' then 'NBI clearance' else 'police clearance' end
      into v_status, v_title
      from public.provider_clearances c where c.id = p_id for update;
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
  elsif p_kind = 'credential' then
    update public.provider_credentials
       set status = 'revoked', revoked_at = now(), revoked_by = p_admin_id,
           revoke_reason = v_reason
     where id = p_id;
  else
    update public.provider_clearances
       set status = 'revoked', revoked_at = now(), revoked_by = p_admin_id,
           revoke_reason = v_reason
     where id = p_id;
  end if;

  v_verified := public.refresh_provider_verified(v_provider);

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
          case p_kind when 'identity' then 'verification.revoke'
                      when 'credential' then 'credential.revoke'
                      else 'clearance.revoke' end,
          case p_kind when 'identity' then 'provider_verifications'
                      when 'credential' then 'provider_credentials'
                      else 'provider_clearances' end,
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

-- ---------------------------------------------------------------------------
-- Duplicate signals for one provider.
-- ---------------------------------------------------------------------------
create or replace function public.provider_duplicate_signals(p_provider_id uuid)
returns table(kind text, other_id uuid, other_name text, other_status text)
language sql stable security definer set search_path = '' as $$
  with
  norm_cert as (
    select c.provider_id, upper(regexp_replace(coalesce(c.credential_number, ''), '[^A-Za-z0-9]', '', 'g')) as n
      from public.provider_credentials c
  ),
  norm_clear as (
    select c.provider_id, upper(regexp_replace(c.clearance_number, '[^A-Za-z0-9]', '', 'g')) as n
      from public.provider_clearances c
  ),
  files as (
    select split_part(o.name, '/', 1) as owner, o.metadata ->> 'eTag' as tag
      from storage.objects o
     where o.bucket_id in ('verification-docs', 'provider-credentials')
       and coalesce(o.metadata ->> 'eTag', '') <> ''
  ),
  digits as (
    select p.id, right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) as d
      from public.profiles p
  ),
  hits as (
    select 'certificate_number'::text as kind, o.provider_id as other_id
      from norm_cert m join norm_cert o on o.n = m.n and o.provider_id <> m.provider_id
     where m.provider_id = p_provider_id and char_length(m.n) >= 4
    union
    select 'clearance_number', o.provider_id
      from norm_clear m join norm_clear o on o.n = m.n and o.provider_id <> m.provider_id
     where m.provider_id = p_provider_id and char_length(m.n) >= 4
    union
    select 'document', o.owner::uuid
      from files m join files o on o.tag = m.tag and o.owner <> m.owner
     where m.owner = p_provider_id::text
       and o.owner ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    union
    select 'phone', o.id
      from digits m join digits o on o.d = m.d and o.id <> m.id
     where m.id = p_provider_id and char_length(m.d) = 10
  )
  select h.kind, h.other_id, p.full_name,
         case when p.deleted_at is not null then 'deleted'
              when p.deactivated_at is not null then 'suspended'
              else 'active' end
    from hits h
    join public.profiles p on p.id = h.other_id
   order by h.kind, p.full_name;
$$;

revoke all on function public.provider_clearance_ok(uuid) from public, anon, authenticated;
revoke all on function public.provider_clearances_decided_is_final() from public, anon, authenticated;
revoke all on function public.provider_clearances_sync_verified() from public, anon, authenticated;
revoke all on function public.set_clearance_required(boolean) from public, anon, authenticated;
revoke all on function public.decide_clearance(uuid, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.provider_duplicate_signals(uuid) from public, anon, authenticated;
revoke all on function public.admin_revoke_verification(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.provider_clearance_ok(uuid) to service_role;
grant execute on function public.set_clearance_required(boolean) to service_role;
grant execute on function public.decide_clearance(uuid, boolean, uuid, text) to service_role;
grant execute on function public.provider_duplicate_signals(uuid) to service_role;
grant execute on function public.admin_revoke_verification(text, uuid, uuid, text) to service_role;

commit;
