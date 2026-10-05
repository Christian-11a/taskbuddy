begin;
-- Reuse 0037's profile lock shared with primary-service approval. Recheck an
-- assigned job's service when its category changes, not only on first hire.
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
    raise exception 'This job requires an approved skill on your verified provider profile';
  end if;
  return new;
end;
$$;
create or replace trigger trg_assignment_approved_skill before update of assigned_provider_id, category_id on public.jobs
for each row execute function public.guard_job_skill();
commit;
