begin;

alter table public.jobs
  add column if not exists address_details text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'jobs_address_details_length'
      and conrelid = 'public.jobs'::pg_catalog.regclass
  ) then
    alter table public.jobs
      add constraint jobs_address_details_length
      check (address_details is null or char_length(address_details) between 1 and 120);
  end if;
end;
$$;

comment on column public.jobs.address_details is
  'Optional house number, unit, floor, or landmark; does not change the signed map pin.';

commit;
