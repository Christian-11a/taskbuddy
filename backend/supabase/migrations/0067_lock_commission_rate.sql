-- Lock the platform fee at hire.
--
-- Until now the commission was read from platform_settings at release, so an
-- admin changing the rate between hire and completion changed what a provider
-- was paid. The rate is now copied onto the escrow row when the money is first
-- held (insert) or re-held (cancelled -> held), and release uses that copy.
-- A null commission_rate (rows released/refunded before this migration) means
-- "use the current platform rate", so older rows behave as before.
--
-- escrow_settle computes the commission itself from the locked rate and ignores
-- p_commission when a rate is locked, so an API instance still running the old
-- code (which passes the current rate's commission) cannot bypass the lock
-- during a deploy. With no locked rate, p_commission is used as before.
begin;

alter table public.escrow_transactions
  add column if not exists commission_rate numeric(5,4)
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 0.5));

comment on column public.escrow_transactions.commission_rate is
  'Platform commission rate (fraction) locked when the escrow was held. '
  'Null on rows settled before 0067; release then falls back to the current '
  'platform_settings.commission_rate.';

-- Stamp the rate whenever an escrow enters 'held' (new row, or re-hold of a
-- cancelled one). Done in a trigger so escrow_place_hold need not be replaced.
create or replace function public.escrow_lock_commission_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'held' and (tg_op = 'INSERT' or old.status is distinct from 'held') then
    select coalesce(s.commission_rate, 0) into new.commission_rate
      from public.platform_settings as s where s.id = true;
    new.commission_rate := coalesce(new.commission_rate, 0);
  end if;
  return new;
end;
$$;

revoke all on function public.escrow_lock_commission_rate() from public, anon, authenticated;

drop trigger if exists escrow_lock_commission_rate on public.escrow_transactions;
create trigger escrow_lock_commission_rate
  before insert or update of status on public.escrow_transactions
  for each row execute function public.escrow_lock_commission_rate();

-- Money still held today gets the current rate.
update public.escrow_transactions as e
   set commission_rate = coalesce((select s.commission_rate from public.platform_settings as s where s.id = true), 0)
 where e.status in ('held', 'disputed') and e.commission_rate is null;

-- resolve_job_dispute (0041) with one change: release uses the locked rate,
-- falling back to the current rate when it is null.
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
      rate := payment.commission_rate;
      if rate is null then
        select commission_rate into strict rate from platform_settings where id = true;
      end if;
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

revoke all on function public.resolve_job_dispute(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.resolve_job_dispute(uuid,uuid,text,text) to service_role;

-- escrow_settle (0060) with the commission taken from the locked rate.
create or replace function public.escrow_settle(
  p_escrow_id  pg_catalog.uuid,
  p_expected   public.escrow_status,
  p_next       public.escrow_status,
  p_commission pg_catalog.numeric default 0,
  p_title      pg_catalog.text default null
)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row        public.escrow_transactions;
  v_job        public.jobs;
  v_commission pg_catalog.numeric := coalesce(p_commission, 0);
  v_locked     pg_catalog.numeric;
begin
  if p_next = 'held' then
    raise exception using errcode = 'TB409', message = 'Use escrow_place_hold to hold funds';
  end if;

  -- Lock the job before changing its escrow, so a complaint and the release
  -- cannot both win. Released as soon as the client confirms completion
  -- (0060); an open complaint still blocks it.
  if p_expected = 'held' and p_next = 'released' then
    select j.* into v_job from public.jobs as j
      join public.escrow_transactions as e on e.job_id = j.id
      where e.id = p_escrow_id for update of j;
    if not found then return null; end if;
    if v_job.status <> 'completed' or v_job.completed_at is null
       or exists (select 1 from public.disputes as d
                  where d.job_id = v_job.id and d.status = 'open') then
      return null;
    end if;
  end if;

  -- 0067: a locked rate wins over whatever commission the caller computed.
  -- round(numeric, 2) matches the API's centavo preview (half away from zero).
  if p_next = 'released' then
    select pg_catalog.round(e.amount * e.commission_rate, 2) into v_locked
      from public.escrow_transactions as e
     where e.id = p_escrow_id and e.commission_rate is not null;
    if v_locked is not null then v_commission := v_locked; end if;
  end if;

  update public.escrow_transactions as e
     set status = p_next,
         released_at = case when p_next = 'released' then pg_catalog.now() else e.released_at end,
         refunded_at = case when p_next = 'refunded' then pg_catalog.now() else e.refunded_at end,
         commission_amount = case when p_next = 'released' then v_commission else e.commission_amount end,
         transfer_status = case
                             when p_next = 'released' and e.funding_method = 'card' then 'pending'
                             else e.transfer_status
                           end
   where e.id = p_escrow_id
     and e.status = p_expected
  returning * into v_row;

  if not found then
    return null;
  end if;

  if p_next = 'released' then
    if v_commission < 0 or v_commission > v_row.amount then
      raise exception using errcode = 'TB409', message = 'Commission out of range';
    end if;
    if v_row.amount - v_commission > 0 then
      insert into public.wallet_transactions
        (profile_id, direction, kind, status, amount, title, job_id)
      values
        (v_row.provider_id, 'credit', 'payout', 'completed', v_row.amount - v_commission,
         pg_catalog.left(coalesce(p_title, 'Payout'), 120), v_row.job_id);
    end if;
  elsif p_next in ('refunded', 'cancelled') then
    insert into public.wallet_transactions
      (profile_id, direction, kind, status, amount, title, job_id)
    values
      (v_row.client_id, 'credit', 'refund', 'completed', v_row.amount,
       pg_catalog.left(coalesce(p_title, 'Refund'), 120), v_row.job_id);
  end if;

  return pg_catalog.to_jsonb(v_row);
end;
$$;

revoke all on function public.escrow_settle(uuid, public.escrow_status, public.escrow_status, numeric, text) from public, anon, authenticated;
grant execute on function public.escrow_settle(uuid, public.escrow_status, public.escrow_status, numeric, text) to service_role;

commit;
