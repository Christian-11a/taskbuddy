begin;
create table if not exists public.job_change_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  type text not null check(type in ('schedule','price')),
  new_scheduled_at timestamptz,
  new_budget numeric(10,2),
  reason text not null check(char_length(btrim(reason)) between 1 and 300),
  status text not null default 'pending' check(status in ('pending','accepted','declined','expired','withdrawn')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  decided_at timestamptz,
  check ((type = 'schedule' and new_scheduled_at is not null and new_budget is null)
      or (type = 'price' and new_budget between 1 and 100000 and new_scheduled_at is null))
);
create unique index if not exists job_change_one_pending on public.job_change_requests(job_id,type) where status = 'pending';
create index if not exists job_change_job on public.job_change_requests(job_id,created_at desc);
alter table public.job_change_requests enable row level security;
revoke all on public.job_change_requests from anon, authenticated;
create or replace function public.job_change_expire(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.job_change_requests set status = 'expired', decided_at = now()
    where job_id = p_job_id and status = 'pending' and expires_at <= now();
end; $$;
create or replace function public.job_change_expire_all()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.job_change_requests set status = 'expired', decided_at = now()
    where status = 'pending' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
create or replace function public.job_change_propose(p_job_id uuid,p_actor uuid,p_type text,p_schedule timestamptz,p_budget numeric,p_reason text)
returns public.job_change_requests language plpgsql security definer set search_path = public as $$
declare j public.jobs; e public.escrow_transactions; r public.job_change_requests; other_id uuid;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found or p_actor not in (j.client_id,j.assigned_provider_id) then
    raise exception using errcode = 'TB403', message = 'Not a participant in this job';
  end if;
  if j.status not in ('assigned','confirmed') then
    raise exception using errcode = 'TB409', message = 'Changes are only available before work starts';
  end if;
  if exists(select 1 from public.disputes where job_id = p_job_id and status = 'open') then
    raise exception using errcode = 'TB409', message = 'A complaint is open';
  end if;
  if p_type = 'price' then
    select * into e from public.escrow_transactions where job_id = p_job_id;
    if not found or e.status <> 'held' or e.funding_method <> 'wallet' then
      raise exception using errcode = 'TB409', message = 'Price changes require a wallet-funded held payment';
    end if;
  end if;
  perform public.job_change_expire(p_job_id);
  insert into public.job_change_requests(job_id,requested_by,type,new_scheduled_at,new_budget,reason)
    values(p_job_id,p_actor,p_type,p_schedule,p_budget,p_reason) returning * into r;
  other_id := case when p_actor = j.client_id then j.assigned_provider_id else j.client_id end;
  insert into public.notifications(recipient_id,type,title,body,data)
    values(other_id,'job_update','Job change requested',p_reason,
      jsonb_build_object('job_id',p_job_id,'change_request_id',r.id));
  return r;
end; $$;
create or replace function public.job_change_decide(p_request_id uuid,p_actor uuid,p_decision text)
returns public.job_change_requests language plpgsql security definer set search_path = public as $$
declare r public.job_change_requests; j public.jobs; e public.escrow_transactions; delta numeric; other_id uuid; v_job_id uuid;
begin
  select job_id into v_job_id from public.job_change_requests where id = p_request_id;
  if not found then raise exception using errcode = 'TB404', message = 'Change request not found'; end if;
  select * into j from public.jobs where id = v_job_id for update;
  perform public.job_change_expire(j.id);
  select * into r from public.job_change_requests where id = p_request_id for update;
  if r.status <> 'pending' then raise exception using errcode = 'TB409', message = 'Change request is no longer pending'; end if;
  if p_actor not in (j.client_id,j.assigned_provider_id) then
    raise exception using errcode = 'TB403', message = 'Not a participant in this job';
  end if;
  if j.status not in ('assigned','confirmed') or exists(select 1 from public.disputes where job_id=j.id and status='open') then
    raise exception using errcode = 'TB409', message = 'This job can no longer be changed';
  end if;
  if p_decision = 'withdrawn' then
    if p_actor <> r.requested_by then raise exception using errcode = 'TB403', message = 'Only the proposer may withdraw'; end if;
  elsif p_decision in ('accepted','declined') then
    if p_actor = r.requested_by then raise exception using errcode = 'TB403', message = 'The other participant must decide'; end if;
  else
    raise exception using errcode = 'TB400', message = 'Invalid decision';
  end if;
  if p_decision = 'accepted' then
    if r.type = 'schedule' then
      if r.new_scheduled_at <= now() then raise exception using errcode = 'TB409', message = 'The proposed date is in the past'; end if;
      update public.jobs set scheduled_at = r.new_scheduled_at where id = j.id;
      update public.bookings set scheduled_at = r.new_scheduled_at where job_id = j.id;
    else
      select * into e from public.escrow_transactions where job_id = j.id for update;
      if not found or e.status <> 'held' or e.funding_method <> 'wallet' then
        raise exception using errcode = 'TB409', message = 'Payment is no longer eligible for a price change';
      end if;
      delta := r.new_budget - e.amount;
      if delta > 0 then
        insert into public.wallet_transactions(profile_id,direction,kind,status,amount,title,job_id)
          values(j.client_id,'debit','escrow_hold','completed',delta,'Additional hold — ' || left(j.title,90),j.id);
      elsif delta < 0 then
        insert into public.wallet_transactions(profile_id,direction,kind,status,amount,title,job_id)
          values(j.client_id,'credit','refund','completed',-delta,'Price adjustment — ' || left(j.title,90),j.id);
      end if;
      update public.escrow_transactions set amount = r.new_budget where id = e.id;
      update public.jobs set budget = r.new_budget where id = j.id;
    end if;
  end if;
  update public.job_change_requests set status = p_decision,decided_at = now() where id = r.id returning * into r;
  other_id := case when p_actor = j.client_id then j.assigned_provider_id else j.client_id end;
  insert into public.notifications(recipient_id,type,title,body,data)
    values(other_id,'job_update','Job change ' || p_decision,'The ' || r.type || ' change was ' || p_decision,
      jsonb_build_object('job_id',j.id,'change_request_id',r.id));
  return r;
end; $$;
revoke all on function public.job_change_expire(uuid) from public, anon, authenticated;
revoke all on function public.job_change_expire_all() from public, anon, authenticated;
revoke all on function public.job_change_propose(uuid,uuid,text,timestamptz,numeric,text) from public, anon, authenticated;
revoke all on function public.job_change_decide(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.job_change_expire(uuid) to service_role;
grant execute on function public.job_change_expire_all() to service_role;
grant execute on function public.job_change_propose(uuid,uuid,text,timestamptz,numeric,text) to service_role;
grant execute on function public.job_change_decide(uuid,uuid,text) to service_role;
commit;
