-- Price change requests without a wallet (migration 0056 retired it).
--
-- A price change used to be settled from the client's wallet: an increase
-- debited it, a decrease credited it. With no balance to draw on:
--   * a decrease credits the difference, which pass_through_balances() then
--     refunds to the client's original payment method;
--   * an increase, once accepted, waits in `awaiting_payment` for the client
--     to pay the difference at checkout (PayMongo test mode). The payment
--     webhook calls job_change_apply_payment(), which holds it in escrow and
--     only then changes the job's price. Unpaid, it expires after 24 hours and
--     the price stays as it was.
begin;

alter table public.job_change_requests
  drop constraint if exists job_change_requests_status_check;
alter table public.job_change_requests
  add constraint job_change_requests_status_check
  check (status in ('pending','awaiting_payment','accepted','declined','expired','withdrawn'));

-- One open request per job and type, whether it waits for a decision or a payment.
drop index if exists public.job_change_one_pending;
create unique index job_change_one_pending
  on public.job_change_requests(job_id, type)
  where status in ('pending', 'awaiting_payment');

create or replace function public.job_change_expire(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.job_change_requests set status = 'expired', decided_at = now()
    where job_id = p_job_id and status in ('pending','awaiting_payment') and expires_at <= now();
end; $$;

create or replace function public.job_change_expire_all()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.job_change_requests set status = 'expired', decided_at = now()
    where status in ('pending','awaiting_payment') and expires_at <= now();
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
    -- Card-at-hire (Stripe Connect) payouts are sourced from one charge and
    -- cannot change amount; every other held payment can.
    if not found or e.status <> 'held' or e.funding_method <> 'wallet' then
      raise exception using errcode = 'TB409', message = 'This payment cannot change price';
    end if;
    if p_budget = e.amount then
      raise exception using errcode = 'TB409', message = 'That is already the price';
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
        -- Agreed, but nothing changes until the client pays the difference.
        update public.job_change_requests
           set status = 'awaiting_payment', decided_at = now(), expires_at = now() + interval '24 hours'
         where id = r.id returning * into r;
        insert into public.notifications(recipient_id,type,title,body,data)
          values(j.client_id,'payment_update','Pay the price difference',
            'The new price is agreed. Pay PHP ' || to_char(delta,'FM999,999,990.00') ||
            ' within 24 hours to confirm it, or the price stays as it was.',
            jsonb_build_object('job_id',j.id,'change_request_id',r.id));
        return r;
      elsif delta < 0 then
        -- Credited here; pass_through_balances() refunds it to the payment method.
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

-- The client's payment of the difference arrived (the webhook has already
-- credited it). Holds it and applies the new price. Raises TB409 when the
-- request can no longer take it — expired, withdrawn, job started, complaint
-- open, wrong amount — and the caller then refunds the payment.
create or replace function public.job_change_apply_payment(p_request_id uuid, p_amount numeric)
returns public.job_change_requests language plpgsql security definer set search_path = public as $$
declare r public.job_change_requests; j public.jobs; e public.escrow_transactions; delta numeric; v_job_id uuid;
begin
  select job_id into v_job_id from public.job_change_requests where id = p_request_id;
  if not found then raise exception using errcode = 'TB404', message = 'Change request not found'; end if;
  select * into j from public.jobs where id = v_job_id for update;
  perform public.job_change_expire(j.id);
  select * into r from public.job_change_requests where id = p_request_id for update;
  if r.status = 'accepted' then return r; end if; -- a redelivered payment
  if r.status <> 'awaiting_payment' then
    raise exception using errcode = 'TB409', message = 'The price change is no longer waiting for payment';
  end if;
  if j.status not in ('assigned','confirmed') or exists(select 1 from public.disputes where job_id=j.id and status='open') then
    raise exception using errcode = 'TB409', message = 'This job can no longer be changed';
  end if;
  select * into e from public.escrow_transactions where job_id = j.id for update;
  if not found or e.status <> 'held' then
    raise exception using errcode = 'TB409', message = 'The payment is no longer held';
  end if;
  delta := r.new_budget - e.amount;
  if delta <= 0 or p_amount <> delta then
    raise exception using errcode = 'TB409', message = 'The amount paid does not match the price difference';
  end if;
  insert into public.wallet_transactions(profile_id,direction,kind,status,amount,title,job_id)
    values(j.client_id,'debit','escrow_hold','completed',delta,'Additional hold — ' || left(j.title,90),j.id);
  update public.escrow_transactions set amount = r.new_budget where id = e.id;
  update public.jobs set budget = r.new_budget where id = j.id;
  update public.job_change_requests set status = 'accepted', decided_at = now() where id = r.id returning * into r;
  insert into public.notifications(recipient_id,type,title,body,data)
    values(j.assigned_provider_id,'job_update','New price confirmed',
      'The client paid the difference. The job is now PHP ' || to_char(r.new_budget,'FM999,999,990.00') || '.',
      jsonb_build_object('job_id',j.id,'change_request_id',r.id));
  return r;
end; $$;

revoke all on function public.job_change_apply_payment(uuid, numeric) from public, anon, authenticated;
grant execute on function public.job_change_apply_payment(uuid, numeric) to service_role;
commit;
