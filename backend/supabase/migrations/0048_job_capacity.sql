-- Server enforcement for the UAT capacity limits. A row lock serializes
-- concurrent requests by the same account.
begin;
create table if not exists public.job_capacity_settings (
  id boolean primary key default true check(id),
  client_active_max integer not null default 3 check(client_active_max > 0),
  provider_active_max integer not null default 3 check(provider_active_max > 0),
  provider_pending_max integer not null default 3 check(provider_pending_max > 0),
  daily_hours_max numeric not null default 8 check(daily_hours_max > 0),
  rest_hours numeric not null default 1 check(rest_hours >= 0),
  travel_kmh numeric not null default 20 check(travel_kmh > 0)
);
insert into public.job_capacity_settings(id) values(true) on conflict(id) do nothing;
alter table public.job_capacity_settings enable row level security;
revoke all on public.job_capacity_settings from anon, authenticated;
create or replace function public.job_default_hours(p_category smallint)
returns numeric language sql stable set search_path = public as $$
  select case name when 'Manicure' then 1 when 'Pedicure' then 1
    when 'Plumbing' then 2 when 'Handyman' then 3 when 'Cleaning' then 4 end
  from service_categories where id = p_category;
$$;
create or replace function public.guard_client_job_capacity()
returns trigger language plpgsql set search_path = public as $$
declare cfg public.job_capacity_settings;
begin
  perform 1 from public.profiles where id = new.client_id for update;
  select * into cfg from public.job_capacity_settings where id = true;
  if (select count(*) from public.jobs where client_id = new.client_id
      and status in ('open','recommending','assigned','confirmed','in_progress')) >= cfg.client_active_max then
    raise exception using errcode = 'TB409', message = 'You have 3 active jobs. Finish one to create another.';
  end if;
  return new;
end; $$;
drop trigger if exists guard_client_job_capacity on public.jobs;
create trigger guard_client_job_capacity before insert on public.jobs
  for each row execute function public.guard_client_job_capacity();
create or replace function public.guard_provider_pending_capacity()
returns trigger language plpgsql set search_path = public as $$
declare cfg public.job_capacity_settings;
begin
  if new.status <> 'pending' then return new; end if;
  perform 1 from public.profiles where id = new.provider_id for update;
  select * into cfg from public.job_capacity_settings where id = true;
  if (select count(*) from public.job_applications where provider_id = new.provider_id and status = 'pending') >= cfg.provider_pending_max then
    raise exception using errcode = 'TB409', message = 'You have 3 pending applications. Wait for a decision before applying again.';
  end if;
  return new;
end; $$;
drop trigger if exists guard_provider_pending_capacity on public.job_applications;
create trigger guard_provider_pending_capacity before insert on public.job_applications
  for each row execute function public.guard_provider_pending_capacity();
create or replace function public.guard_provider_booking_capacity()
returns trigger language plpgsql set search_path = public as $$
declare cfg public.job_capacity_settings; prior public.jobs; new_hours numeric; old_hours numeric; travel_hours numeric; total_hours numeric;
begin
  if new.assigned_provider_id is null or new.status not in ('assigned','confirmed','in_progress')
     or (old.assigned_provider_id is not distinct from new.assigned_provider_id and old.scheduled_at is not distinct from new.scheduled_at) then
    return new;
  end if;
  perform 1 from public.profiles where id = new.assigned_provider_id for update;
  select * into cfg from public.job_capacity_settings where id = true;
  if (select count(*) from public.jobs where assigned_provider_id = new.assigned_provider_id
      and id <> new.id and status in ('assigned','confirmed','in_progress')) >= cfg.provider_active_max then
    raise exception using errcode = 'TB409', message = 'This provider already has 3 active jobs';
  end if;
  if new.scheduled_at is null then return new; end if;
  new_hours := public.job_default_hours(new.category_id);
  total_hours := new_hours;
  for prior in select * from public.jobs where assigned_provider_id = new.assigned_provider_id
      and id <> new.id and status in ('assigned','confirmed','in_progress')
      and scheduled_at is not null loop
    old_hours := public.job_default_hours(prior.category_id);
    if (prior.scheduled_at at time zone 'Asia/Manila')::date = (new.scheduled_at at time zone 'Asia/Manila')::date then
      total_hours := total_hours + old_hours;
    end if;
    travel_hours := public.haversine_km(prior.latitude,prior.longitude,new.latitude,new.longitude) / cfg.travel_kmh;
    if new.scheduled_at < prior.scheduled_at + (old_hours + cfg.rest_hours + travel_hours) * interval '1 hour'
       and prior.scheduled_at < new.scheduled_at + (new_hours + cfg.rest_hours + travel_hours) * interval '1 hour' then
      raise exception using errcode = 'TB409', message = 'This provider has an overlapping booking';
    end if;
  end loop;
  if total_hours > cfg.daily_hours_max then
    raise exception using errcode = 'TB409', message = 'This provider has reached the daily work limit';
  end if;
  return new;
end; $$;
drop trigger if exists guard_provider_booking_capacity on public.jobs;
create trigger guard_provider_booking_capacity before update of assigned_provider_id, status, scheduled_at on public.jobs
  for each row execute function public.guard_provider_booking_capacity();
revoke all on function public.job_default_hours(smallint) from public, anon, authenticated;
revoke all on function public.guard_client_job_capacity() from public, anon, authenticated;
revoke all on function public.guard_provider_pending_capacity() from public, anon, authenticated;
revoke all on function public.guard_provider_booking_capacity() from public, anon, authenticated;
create or replace function public.admin_update_job_capacity(
  p_actor uuid, p_client_max integer, p_provider_max integer, p_pending_max integer,
  p_daily_hours numeric, p_rest_hours numeric, p_travel_kmh numeric)
returns public.job_capacity_settings language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_row public.job_capacity_settings;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and deactivated_at is null and deleted_at is null) then
    raise exception using errcode='TB403', message='Admin access required';
  end if;
  update public.job_capacity_settings set client_active_max=p_client_max,
    provider_active_max=p_provider_max,provider_pending_max=p_pending_max,
    daily_hours_max=p_daily_hours,rest_hours=p_rest_hours,travel_kmh=p_travel_kmh
    where id=true returning * into v_row;
  if not found then raise exception using errcode='TB404', message='Job capacity settings not found'; end if;
  insert into public.admin_actions(actor_id,action,target_type,target_id,metadata)
    values(p_actor,'job_capacity.update','job_capacity_settings','00000000-0000-0000-0000-000000000000',to_jsonb(v_row));
  return v_row;
end; $$;
revoke all on function public.admin_update_job_capacity(uuid,integer,integer,integer,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.admin_update_job_capacity(uuid,integer,integer,integer,numeric,numeric,numeric) to service_role;
commit;
