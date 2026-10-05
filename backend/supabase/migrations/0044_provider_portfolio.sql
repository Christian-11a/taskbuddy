begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('provider-portfolio','provider-portfolio',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.provider_portfolio (
 id uuid primary key default gen_random_uuid(),
 provider_id uuid not null references provider_profiles(profile_id) on delete cascade,
 image_path text not null unique,
 caption text not null check(char_length(btrim(caption)) between 1 and 400),
 position integer not null default 0 check(position between 0 and 10000),
 category_id smallint references service_categories(id),
 created_at timestamptz not null default now(),
 check(image_path like provider_id::text || '/%')
);
create index if not exists provider_portfolio_order on provider_portfolio(provider_id,position,created_at,id);
alter table public.provider_portfolio enable row level security;
-- Only the service-role API reads/writes entries and issues private image URLs.
create or replace function public.limit_provider_portfolio()
returns trigger language plpgsql set search_path=public as $$
begin
 perform 1 from provider_profiles where profile_id=new.provider_id for update;
 if (select count(*) from provider_portfolio where provider_id=new.provider_id)>=20 then
  raise exception 'A portfolio can contain at most 20 photos';
 end if;
 return new;
end;
$$;
create or replace trigger provider_portfolio_limit before insert on public.provider_portfolio
for each row execute function public.limit_provider_portfolio();
commit;
