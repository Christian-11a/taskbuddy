begin;

-- A complaint concerns a job, even when that job has no escrow.
alter table public.disputes alter column escrow_id drop not null;
create unique index if not exists uq_disputes_one_open_job on public.disputes(job_id) where status = 'open';
alter table public.disputes add column if not exists cancellation_state text
  check (cancellation_state in ('pending', 'contested', 'accepted', 'expired'));
alter table public.disputes add column if not exists cancellation_deadline timestamptz;
create index if not exists idx_disputes_cancellation_due on public.disputes(cancellation_deadline) where status = 'open' and cancellation_state = 'pending';
alter table public.jobs add column if not exists cancelled_by uuid references public.profiles(id);

create table if not exists public.dispute_entries (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  author_id uuid references public.profiles(id),
  kind text not null check (kind in ('statement', 'appeal', 'clarification', 'resolution', 'cancellation_response', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  message_id uuid references public.messages(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists idx_dispute_entries_case on public.dispute_entries(dispute_id, created_at, id);
alter table public.dispute_entries enable row level security;
-- No client writes: authenticated API functions validate actors and evidence.
drop policy if exists dispute_entries_participant_read on public.dispute_entries;
create policy dispute_entries_participant_read on public.dispute_entries for select using (
  exists (select 1 from public.disputes d join public.jobs j on j.id = d.job_id
    where d.id = dispute_id and auth.uid() in (j.client_id, j.assigned_provider_id))
);
drop policy if exists disputes_participant_read on public.disputes;
create policy disputes_participant_read on public.disputes for select using (
  exists (select 1 from public.jobs j where j.id = job_id and auth.uid() in (j.client_id, j.assigned_provider_id))
);

-- Preserve past recorded decisions before allowing appeals to reopen cases.
insert into public.dispute_entries(dispute_id, author_id, kind, body, created_at)
select d.id, d.resolved_by, 'resolution', coalesce(nullif(btrim(d.resolution_note), ''), d.resolution::text), d.resolved_at
from public.disputes d where d.status = 'resolved' and d.resolved_by is not null
and not exists (select 1 from public.dispute_entries e where e.dispute_id = d.id and e.kind = 'resolution');

create or replace function public.raise_job_dispute(p_job_id uuid, p_actor_id uuid, p_reason text, p_details text)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare job jobs; payment escrow_transactions; complaint disputes;
begin
  select * into job from jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if p_actor_id is null or (p_actor_id <> job.client_id and p_actor_id is distinct from job.assigned_provider_id) then
    raise exception 'Not your job';
  end if;
  if job.status = 'completed' then
    if job.completed_at is null or now() >= job.completed_at + interval '72 hours' then
      raise exception 'The three-day dispute window has ended';
    end if;
  elsif job.status not in ('assigned', 'confirmed', 'in_progress', 'cancelled') or job.assigned_provider_id is null then
    raise exception 'This job is not eligible for a complaint';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 200 then raise exception 'A complaint reason is required'; end if;
  select * into complaint from disputes where job_id = p_job_id and status = 'open' for update;
  if found then
    if complaint.cancellation_state <> 'pending' or complaint.cancellation_state is null then
      raise exception using errcode = '23505', message = 'There is already an open complaint for this job';
    end if;
    if now() >= complaint.cancellation_deadline then raise exception 'The cancellation response window has ended'; end if;
    update disputes set cancellation_state = 'contested' where id = complaint.id returning * into complaint;
    insert into dispute_entries(dispute_id, author_id, kind, body)
      values (complaint.id, p_actor_id, 'appeal', btrim(p_reason));
    if p_details is not null and btrim(p_details) <> '' then
      insert into dispute_entries(dispute_id, author_id, kind, body)
        values (complaint.id, p_actor_id, 'statement', btrim(p_details));
    end if;
  else
    select * into payment from escrow_transactions where job_id = p_job_id for update;
    insert into disputes(escrow_id, job_id, raised_by, reason, details)
      values (payment.id, p_job_id, p_actor_id, btrim(p_reason), p_details) returning * into complaint;
  end if;
  update escrow_transactions set status = 'disputed' where job_id = p_job_id and status = 'held';
  insert into notifications(recipient_id, type, title, body, data)
    select id, 'dispute_update', 'Complaint opened', 'A complaint is awaiting admin review. Both participants can add statements and evidence.',
      jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id)
    from profiles where id in (job.client_id, job.assigned_provider_id);
  return complaint;
end;
$$;

create or replace function public.review_work_cancellation()
returns trigger language plpgsql security definer set search_path = public as $$
declare payment escrow_transactions; complaint disputes; pending boolean;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' or old.assigned_provider_id is null then return new; end if;
  select * into complaint from disputes where job_id = old.id and status = 'open' for update;
  select * into payment from escrow_transactions where job_id = old.id for update;
  -- The provider backing out before work is agreement to refund, unless an
  -- existing complaint already requires a reasoned admin decision.
  if old.status in ('assigned', 'confirmed') and new.cancelled_by = old.assigned_provider_id and complaint.id is null then
    if payment.status = 'held' then perform escrow_settle(payment.id, 'held', 'cancelled', 0, 'Refund — provider declined'); end if;
    return new;
  end if;
  pending := old.status in ('assigned', 'confirmed') and complaint.id is null;
  if complaint.id is null then
    insert into disputes(escrow_id, job_id, raised_by, reason, details, cancellation_state, cancellation_deadline)
      values (payment.id, old.id, old.client_id,
        case when pending then 'Cancellation request before work started' else 'Cancellation after work started' end,
        case when pending then 'Provider has 48 hours to agree or contest. Money stays held until a response or deadline.' else 'Admin review required; both participants may add evidence.' end,
        case when pending then 'pending' else 'contested' end,
        case when pending then now() + interval '48 hours' else null end)
      returning * into complaint;
  else
    update disputes set cancellation_state = 'contested' where id = complaint.id returning * into complaint;
  end if;
  update escrow_transactions set status = 'disputed' where id = payment.id and status = 'held';
  insert into notifications(recipient_id, type, title, body, data)
    select id, 'dispute_update', case when pending then 'Cancellation response requested' else 'Cancellation under admin review' end,
      case when pending then 'Provider: agree or contest within 48 hours. No response refunds the client. An open complaint blocks automatic refund.' else 'Any held payment is frozen until an admin records a decision.' end,
      jsonb_build_object('job_id', old.id, 'dispute_id', complaint.id, 'deadline', complaint.cancellation_deadline)
    from profiles where id in (old.client_id, old.assigned_provider_id);
  return new;
end;
$$;

create or replace function public.add_dispute_entry(p_dispute_id uuid, p_actor_id uuid, p_kind text, p_body text, p_message_id uuid default null)
returns public.dispute_entries language plpgsql security definer set search_path = public as $$
declare job jobs; complaint disputes; actor profiles; entry dispute_entries;
begin
  select j.* into job from jobs j join disputes d on d.job_id = j.id where d.id = p_dispute_id for update of j;
  if not found then raise exception 'Complaint not found'; end if;
  select * into complaint from disputes where id = p_dispute_id for update;
  select * into actor from profiles where id = p_actor_id;
  if actor.id is null then raise exception 'Actor not found'; end if;
  if actor.role = 'admin' then
    if p_kind <> 'clarification' or complaint.status <> 'open' then raise exception 'Only clarification requests are allowed here'; end if;
  else
    if actor.id <> job.client_id and actor.id is distinct from job.assigned_provider_id then raise exception 'Not your job'; end if;
    if p_kind not in ('statement', 'appeal') then raise exception 'Invalid participant statement'; end if;
    if complaint.status <> 'open' and p_kind <> 'appeal' then raise exception 'Use an appeal for a closed complaint'; end if;
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 1000 then raise exception 'Statement must contain 1 to 1000 characters'; end if;
  if p_message_id is not null and not exists (
    select 1 from messages m join conversations c on c.id = m.conversation_id
    where m.id = p_message_id and c.job_id = job.id and m.sender_id = actor.id
  ) then raise exception 'Evidence must be your own message from this job'; end if;
  if p_kind = 'appeal' then
    if complaint.cancellation_state = 'pending' and now() >= complaint.cancellation_deadline then raise exception 'The cancellation response window has ended'; end if;
    update disputes set status = 'open', resolution = null, resolution_note = null, resolved_by = null, resolved_at = null,
      cancellation_state = case when cancellation_state = 'pending' then 'contested' else cancellation_state end
      where id = complaint.id;
  end if;
  insert into dispute_entries(dispute_id, author_id, kind, body, message_id)
    values (complaint.id, actor.id, p_kind, btrim(p_body), p_message_id) returning * into entry;
  if actor.role = 'admin' then
    insert into admin_actions(actor_id, action, target_type, target_id, metadata)
      values(actor.id, 'dispute.clarification', 'disputes', complaint.id, jsonb_build_object('entry_id', entry.id));
  end if;
  insert into notifications(recipient_id, type, title, body, data)
    select id, 'dispute_update', case when p_kind = 'clarification' then 'More information requested' else 'Complaint updated' end,
      case when p_kind = 'clarification' then p_body else 'A participant added a ' || p_kind || '. Open the case to read it.' end,
      jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id, 'entry_id', entry.id)
    from profiles where id in (job.client_id, job.assigned_provider_id) and id <> actor.id;
  return entry;
end;
$$;

create or replace function public.respond_job_cancellation(p_dispute_id uuid, p_actor_id uuid, p_accept boolean, p_note text, p_message_id uuid default null)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare job jobs; complaint disputes; payment escrow_transactions;
begin
  select j.* into job from jobs j join disputes d on d.job_id = j.id where d.id = p_dispute_id for update of j;
  if not found then raise exception 'Complaint not found'; end if;
  select * into complaint from disputes where id = p_dispute_id for update;
  if p_actor_id is null or p_actor_id is distinct from job.assigned_provider_id then raise exception 'Only the assigned provider can respond'; end if;
  if complaint.status <> 'open' or complaint.cancellation_state <> 'pending' or complaint.cancellation_state is null then raise exception 'This cancellation is no longer awaiting a response'; end if;
  if now() >= complaint.cancellation_deadline then raise exception 'The cancellation response window has ended'; end if;
  if p_accept is null or p_note is null or char_length(btrim(p_note)) not between 1 and 1000 then raise exception 'A response note is required'; end if;
  if p_message_id is not null and not exists (select 1 from messages m join conversations c on c.id = m.conversation_id where m.id = p_message_id and c.job_id = job.id and m.sender_id = p_actor_id) then raise exception 'Evidence must be your own message from this job'; end if;
  select * into payment from escrow_transactions where job_id = job.id for update;
  if p_accept then
    if payment.status in ('held', 'disputed') then perform escrow_settle(payment.id, payment.status, 'refunded', 0, 'Refund — cancellation agreed'); end if;
    update disputes set status = 'resolved', cancellation_state = 'accepted', resolution = case when payment.id is null or payment.status not in ('held', 'disputed') then 'reviewed'::dispute_resolution else 'refunded_to_client'::dispute_resolution end,
      resolution_note = btrim(p_note), resolved_by = p_actor_id, resolved_at = now() where id = complaint.id returning * into complaint;
  else
    update disputes set cancellation_state = 'contested' where id = complaint.id returning * into complaint;
  end if;
  insert into dispute_entries(dispute_id, author_id, kind, body, message_id) values(complaint.id, p_actor_id, 'cancellation_response', btrim(p_note), p_message_id);
  insert into notifications(recipient_id, type, title, body, data)
    select id, 'dispute_update', case when p_accept then 'Cancellation agreed' else 'Cancellation contested' end,
      case when p_accept then 'Cancellation agreed. Any unsettled escrow was refunded to the client.' else 'Payment stays frozen for admin review. Both participants can add evidence.' end,
      jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id)
    from profiles where id in (job.client_id, job.assigned_provider_id);
  return complaint;
end;
$$;

create or replace function public.expire_job_cancellations()
returns integer language plpgsql security definer set search_path = public as $$
declare candidate record; job jobs; complaint disputes; payment escrow_transactions; settled integer := 0;
begin
  for candidate in select id, job_id from disputes where status = 'open' and cancellation_state = 'pending' and cancellation_deadline <= now() order by cancellation_deadline limit 50 loop
    select * into job from jobs where id = candidate.job_id for update;
    select * into complaint from disputes where id = candidate.id for update;
    if complaint.status <> 'open' or complaint.cancellation_state <> 'pending' or complaint.cancellation_deadline > now() then continue; end if;
    select * into payment from escrow_transactions where job_id = job.id for update;
    if payment.status in ('held', 'disputed') then perform escrow_settle(payment.id, payment.status, 'refunded', 0, 'Refund — cancellation response expired'); end if;
    update disputes set status = 'resolved', cancellation_state = 'expired', resolution = case when payment.id is null or payment.status not in ('held', 'disputed') then 'reviewed'::dispute_resolution else 'refunded_to_client'::dispute_resolution end,
      resolution_note = 'No provider response within 48 hours. Cancellation closed automatically.', resolved_at = now() where id = complaint.id;
    insert into dispute_entries(dispute_id, author_id, kind, body) values(complaint.id, null, 'system', 'No provider response within 48 hours. Cancellation closed automatically.');
    insert into notifications(recipient_id, type, title, body, data)
      select id, 'dispute_update', 'Cancellation response expired', 'No provider response within 48 hours. Any unsettled escrow was refunded to the client.',
        jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id)
      from profiles where id in (job.client_id, job.assigned_provider_id);
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;

create or replace function public.resolve_job_dispute(p_dispute_id uuid, p_actor_id uuid, p_resolution text, p_note text)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare job jobs; complaint disputes; payment escrow_transactions; commission numeric; rate numeric;
begin
  if not exists (select 1 from profiles where id = p_actor_id and role = 'admin') then raise exception 'Admin access required'; end if;
  select j.* into job from jobs j join disputes d on d.job_id = j.id where d.id = p_dispute_id for update of j;
  if not found then raise exception 'Complaint not found'; end if;
  select * into complaint from disputes where id = p_dispute_id for update;
  if complaint.status <> 'open' then raise exception 'This complaint is already closed'; end if;
  if p_note is null or char_length(btrim(p_note)) not between 1 and 1000 then raise exception 'A reasoned resolution note is required'; end if;
  if p_resolution is null or p_resolution not in ('released_to_provider', 'refunded_to_client', 'reviewed') then raise exception 'Invalid resolution'; end if;
  select * into payment from escrow_transactions where job_id = job.id for update;
  if payment.id is null or payment.status in ('released', 'refunded', 'cancelled') then
    if p_resolution <> 'reviewed' then raise exception 'No unsettled payment: record an admin decision without moving money'; end if;
  else
    if p_resolution = 'reviewed' then raise exception 'Resolve the held payment by releasing or refunding it'; end if;
    if p_resolution = 'released_to_provider' then
      select commission_rate into strict rate from platform_settings where id = true;
      commission := round(payment.amount * rate, 2);
      -- The open case gives the admin, rather than automatic settlement, authority.
      if payment.status = 'held' then update escrow_transactions set status = 'disputed' where id = payment.id; end if;
      perform escrow_settle(payment.id, 'disputed', 'released', commission, 'Payout — ' || job.title);
    else
      perform escrow_settle(payment.id, payment.status, 'refunded', 0, 'Refund — complaint resolved');
    end if;
  end if;
  update disputes set status = 'resolved', resolution = p_resolution::dispute_resolution,
    cancellation_state = case when cancellation_state = 'pending' then 'contested' else cancellation_state end,
    resolution_note = btrim(p_note), resolved_by = p_actor_id, resolved_at = now()
    where id = complaint.id returning * into complaint;
  insert into dispute_entries(dispute_id, author_id, kind, body) values(complaint.id, p_actor_id, 'resolution', btrim(p_note));
  insert into admin_actions(actor_id, action, target_type, target_id, metadata)
    values(p_actor_id, 'dispute.resolve', 'disputes', complaint.id, jsonb_build_object('resolution', p_resolution, 'note', btrim(p_note)));
  insert into notifications(recipient_id, type, title, body, data)
    select id, 'dispute_update', 'Complaint resolved', 'An admin recorded a decision: ' || p_resolution || '. ' || p_note,
      jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id)
    from profiles where id in (job.client_id, job.assigned_provider_id);
  return complaint;
end;
$$;

revoke all on function public.raise_job_dispute(uuid,uuid,text,text), public.add_dispute_entry(uuid,uuid,text,text,uuid), public.respond_job_cancellation(uuid,uuid,boolean,text,uuid), public.expire_job_cancellations(), public.resolve_job_dispute(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.raise_job_dispute(uuid,uuid,text,text), public.add_dispute_entry(uuid,uuid,text,text,uuid), public.respond_job_cancellation(uuid,uuid,boolean,text,uuid), public.expire_job_cancellations(), public.resolve_job_dispute(uuid,uuid,text,text) to service_role;
commit;
