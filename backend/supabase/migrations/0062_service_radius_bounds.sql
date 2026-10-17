-- Providers set how far they travel for jobs. The API accepted 0.5–1000 km,
-- which let typos like 500 km silently widen matching. Bound it to 1–50 km
-- (src/profiles/service-radius.ts) and clamp existing rows into range first.

begin;

update public.provider_profiles
   set service_radius_km = least(greatest(service_radius_km, 1), 50)
 where service_radius_km < 1 or service_radius_km > 50;

alter table public.provider_profiles
  drop constraint if exists provider_profiles_service_radius_km_check;
alter table public.provider_profiles
  add constraint provider_profiles_service_radius_km_check
    check (service_radius_km between 1 and 50);

commit;
