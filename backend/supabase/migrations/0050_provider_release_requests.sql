begin;
create table if not exists public.provider_release_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  next_allowed_at timestamptz
);
alter table public.provider_release_requests add column if not exists next_allowed_at timestamptz;
create index if not exists provider_release_requests_job on public.provider_release_requests(job_id,created_at desc);
alter table public.provider_release_requests enable row level security;
revoke all on public.provider_release_requests from anon, authenticated;
create or replace function public.request_early_payment_release(p_job_id uuid,p_provider_id uuid)
returns public.provider_release_requests language plpgsql security definer set search_path = public, pg_catalog as $$
declare j public.jobs; e public.escrow_transactions; r public.provider_release_requests; last_request timestamptz; first_recent timestamptz; recent_count integer; total_count integer; conversation_id uuid; retry_at timestamptz;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.assigned_provider_id <> p_provider_id then
    raise exception using errcode = 'TB403', message = 'Not the provider for this job';
  end if;
  if j.status <> 'completed' then
    raise exception using errcode = 'TB409', message = 'The job is not complete yet';
  end if;
  select * into e from public.escrow_transactions where job_id = p_job_id;
  if not found or e.status <> 'held' then
    raise exception using errcode = 'TB409', message = 'Payment is no longer held';
  end if;
  if exists(select 1 from public.disputes where job_id=p_job_id and status='open') then
    raise exception using errcode = 'TB409', message = 'A complaint is open';
  end if;
  select max(created_at), min(created_at) filter(where created_at >= now() - interval '12 hours'),
    count(*) filter(where created_at >= now() - interval '12 hours'), count(*)
    into last_request,first_recent,recent_count,total_count from public.provider_release_requests where job_id=p_job_id;
  if total_count >= 6 then
    raise exception using errcode = 'TB409', message = 'No more payment release requests are allowed for this job';
  end if;
  retry_at := greatest(last_request + interval '2 hours',
    case when recent_count >= 2 then first_recent + interval '12 hours' end);
  if retry_at > now() then
    raise exception using errcode = 'TB409', message = 'Request limit reached; try again later',
      detail = to_char(retry_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  end if;
  insert into public.provider_release_requests(job_id,provider_id)
    values(p_job_id,p_provider_id) returning * into r;
  select min(created_at) into first_recent from public.provider_release_requests
    where job_id=p_job_id and created_at >= now() - interval '12 hours';
  r.next_allowed_at := case when total_count + 1 >= 6 then null
    when recent_count + 1 >= 2 then greatest(r.created_at + interval '2 hours', first_recent + interval '12 hours')
    else r.created_at + interval '2 hours' end;
  update public.provider_release_requests set next_allowed_at=r.next_allowed_at where id=r.id;
  insert into public.notifications(recipient_id,type,title,body,data)
    values(j.client_id,'job_update','Provider requested payment release',
      'The provider asked you to release the held payment for ' || j.title,
      jsonb_build_object('job_id',p_job_id,'release_request_id',r.id));
  select id into conversation_id from public.conversations where job_id=p_job_id;
  if conversation_id is not null then
    insert into public.messages(conversation_id,sender_id,body)
      values(conversation_id,p_provider_id,'Requested early payment release for ' || left(j.title,120));
  end if;
  return r;
end; $$;
revoke all on function public.request_early_payment_release(uuid,uuid) from public, anon, authenticated;
grant execute on function public.request_early_payment_release(uuid,uuid) to service_role;
commit;
