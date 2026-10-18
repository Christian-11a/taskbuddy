-- Money correctness fixes from the October audit (Phase 3; H3, H5, H6).
--
-- 1. escrow_place_hold (0028): after a hire fell through, its cancelled hold
--    kept the first provider, so every later paid hire of someone else was
--    refused and refunded. A cancelled hold may now be re-held for any
--    provider at the job's current price.
-- 2. pass_through_balances (0058): a client's payment is credited and then
--    held in two steps, and a sweep in between refunded it, so a paid hire
--    failed. Client top-up credits younger than 15 minutes are left alone.
-- 3. job_change_apply_payment (0057): the price difference was debited with
--    no wallet lock or balance check, so a sweep in between could leave the
--    client's balance negative. It now locks and checks first.
--
-- Only `create or replace`: existing grants carry over.

begin;

create or replace function public.escrow_place_hold(
  p_job_id            pg_catalog.uuid,
  p_provider_id       pg_catalog.uuid,
  p_funding_method    pg_catalog.text default 'wallet',
  p_payment_intent_id pg_catalog.text default null,
  p_charge_id         pg_catalog.text default null
)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job       record;
  v_existing  public.escrow_transactions;
  v_had_row   boolean;
  v_row       public.escrow_transactions;
  v_amount    pg_catalog.numeric;
  v_available pg_catalog.numeric;
begin
  if p_funding_method not in ('wallet', 'card') then
    raise exception using errcode = 'TB409', message = 'Unknown funding method';
  end if;

  select j.id, j.title, j.budget, j.client_id into v_job
    from public.jobs as j where j.id = p_job_id;
  if not found then
    raise exception using errcode = 'TB404', message = 'Job not found';
  end if;
  if v_job.budget is null then
    return pg_catalog.jsonb_build_object('escrow', null, 'placed', false);
  end if;

  perform public.wallet_lock(v_job.client_id);

  select * into v_existing
    from public.escrow_transactions as e
   where e.job_id = p_job_id
     for update;
  v_had_row := found;

  if v_had_row then
    -- A cancelled hold (a hire that fell through) may be re-held for any
    -- provider at the job's current price (0073). A live one stays with its
    -- provider.
    if v_existing.status <> 'cancelled' and v_existing.provider_id <> p_provider_id then
      raise exception using errcode = 'TB409',
        message = 'This job already has an escrow hold for another provider.';
    end if;
    if v_existing.status = 'held' then
      return pg_catalog.jsonb_build_object('escrow', pg_catalog.to_jsonb(v_existing), 'placed', false);
    end if;
    if v_existing.status <> 'cancelled' then
      raise exception using errcode = 'TB409',
        message = pg_catalog.format('This job''s escrow is already ''%s'' and cannot be re-held.', v_existing.status);
    end if;
    v_amount := v_job.budget;
  else
    v_amount := v_job.budget;
  end if;

  v_available := public.wallet_available_balance(v_job.client_id);
  if v_available < v_amount then
    raise exception using errcode = 'TB402',
      message = 'Insufficient wallet balance',
      detail = pg_catalog.jsonb_build_object('needed', v_amount, 'available', v_available)::pg_catalog.text;
  end if;

  if v_had_row then
    update public.escrow_transactions
       set status = 'held',
           provider_id = p_provider_id,
           amount = v_amount,
           held_at = pg_catalog.now(),
           released_at = null,
           refunded_at = null,
           funding_method = p_funding_method,
           funding_payment_intent_id = p_payment_intent_id,
           funding_charge_id = p_charge_id
     where id = v_existing.id
    returning * into v_row;
  else
    insert into public.escrow_transactions
      (job_id, client_id, provider_id, amount,
       funding_method, funding_payment_intent_id, funding_charge_id)
    values
      (p_job_id, v_job.client_id, p_provider_id, v_amount,
       p_funding_method, p_payment_intent_id, p_charge_id)
    returning * into v_row;
  end if;

  insert into public.wallet_transactions
    (profile_id, direction, kind, status, amount, title, job_id)
  values
    (v_job.client_id, 'debit', 'escrow_hold', 'completed', v_amount,
     pg_catalog.left('Escrow hold — ' || coalesce(v_job.title, 'job'), 120), p_job_id);

  return pg_catalog.jsonb_build_object('escrow', pg_catalog.to_jsonb(v_row), 'placed', true);
end;
$$;

create or replace function public.pass_through_balances(
  p_profile_id uuid default null,
  p_queue_provider_payouts boolean default false
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  amount numeric;
  destination text;
  queued boolean;
  sent integer := 0;
begin
  for r in
    select p.id, p.role
      from profiles p
     where (p_profile_id is null or p.id = p_profile_id)
       and exists (select 1 from wallet_transactions t where t.profile_id = p.id)
  loop
    perform wallet_lock(r.id);
    amount := wallet_available_balance(r.id);
    -- A client's payment for a hire or a price change is credited and then
    -- held in two steps. Leave fresh payments alone so a sweep in between
    -- cannot refund the money the hold is about to use (0073); one that is
    -- still unused after the grace period is refunded as before.
    if r.role <> 'provider' then
      amount := amount - coalesce((
        select sum(t.amount) from wallet_transactions t
         where t.profile_id = r.id
           and t.direction = 'credit'
           and t.kind = 'topup'
           and t.status = 'completed'
           and t.created_at > now() - interval '15 minutes'
      ), 0);
    end if;
    continue when amount <= 0;
    queued := false;
    if r.role = 'provider' then
      destination := payout_destination_label(r.id);
      continue when destination is null;
      queued := p_queue_provider_payouts;
    else
      destination := 'Original payment method';
    end if;
    insert into wallet_transactions
      (profile_id, direction, kind, amount, title, status,
       withdrawal_destination, review_note)
    values
      (r.id, 'debit', 'withdrawal', amount,
       case when r.role = 'provider' then 'Payout sent' else 'Refund sent' end,
       (case when queued then 'pending' else 'completed' end)::wallet_txn_status,
       destination,
       case when queued then 'Sending via Xendit'
            else 'SIM-' || upper(substr(md5(gen_random_uuid()::text), 1, 10)) end);
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

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
  -- The difference was credited in its own step: hold it under the client's
  -- wallet lock and only if it is still there (0073).
  perform public.wallet_lock(j.client_id);
  if public.wallet_available_balance(j.client_id) < delta then
    raise exception using errcode = 'TB402', message = 'The price difference is no longer available to hold';
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

commit;
