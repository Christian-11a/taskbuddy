-- Skill credentials a provider uploads to back a service they offer: TESDA
-- National Certificates, PRC licences, trade certificates. An admin checks
-- each one (TESDA has a public lookup but no API) before it shows as a
-- "Certified" badge on that service.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('provider-credentials', 'provider-credentials', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.provider_credentials (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references provider_profiles(profile_id) on delete cascade,
  category_id      smallint not null references service_categories(id),
  credential_type  text not null
    check (credential_type in ('tesda_nc', 'prc_license', 'trade_certificate', 'other')),
  title            text not null check (char_length(btrim(title)) between 2 and 120),
  issuer           text not null check (char_length(btrim(issuer)) between 2 and 120),
  credential_number text check (char_length(credential_number) <= 60),
  issued_on        date,
  expires_on       date,
  document_path    text not null unique check (document_path like provider_id::text || '/%'),
  status           text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text check (char_length(rejection_reason) <= 500),
  reviewed_by      uuid references profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

create index if not exists provider_credentials_provider
  on provider_credentials (provider_id, created_at desc);
create index if not exists provider_credentials_pending
  on provider_credentials (created_at) where status = 'pending';

-- Only the service-role API reads and writes, and issues the private URLs.
alter table public.provider_credentials enable row level security;

create or replace function public.limit_provider_credentials()
returns trigger language plpgsql set search_path = public as $$
begin
  perform 1 from provider_profiles where profile_id = new.provider_id for update;
  if (select count(*) from provider_credentials where provider_id = new.provider_id) >= 20 then
    raise exception using errcode = 'TB409', message = 'You can upload at most 20 credentials';
  end if;
  return new;
end;
$$;

create or replace trigger provider_credentials_limit
  before insert on public.provider_credentials
  for each row execute function public.limit_provider_credentials();

commit;
