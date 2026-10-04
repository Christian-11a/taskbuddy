-- Hold completed-job escrow for 72 hours; timely complaints block release.
-- Do not rewrite older migrations: this also upgrades existing installations.
begin;

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
begin
  if p_next = 'held' then
    raise exception using errcode = 'TB409', message = 'Use escrow_place_hold to hold funds';
  end if;

  -- Match raise_job_dispute: lock the job before changing its escrow. A timely
  -- complaint and automatic release cannot both win. Admin decisions on a
  -- disputed payment remain independent of the automatic warranty deadline.
  if p_expected = 'held' and p_next = 'released' then
    select j.* into v_job from public.jobs as j
      join public.escrow_transactions as e on e.job_id = j.id
      where e.id = p_escrow_id for update of j;
    if not found then return null; end if;
    if v_job.status <> 'completed' or v_job.completed_at is null
       or pg_catalog.now() < v_job.completed_at + interval '72 hours'
       or exists (select 1 from public.disputes as d
                  where d.job_id = v_job.id and d.status = 'open') then
      return null;
    end if;
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

create or replace function public.raise_job_dispute(p_job_id uuid, p_actor_id uuid, p_reason text, p_details text)
returns disputes language plpgsql security definer set search_path = public as $$
declare job jobs; payment escrow_transactions; complaint disputes;
begin
  select * into job from jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if p_actor_id <> job.client_id and p_actor_id is distinct from job.assigned_provider_id then
    raise exception 'Not your job';
  end if;
  if job.status = 'completed' then
    if job.completed_at is null or now() >= job.completed_at + interval '72 hours' then
      raise exception 'The three-day dispute window has ended';
    end if;
  elsif job.status not in ('assigned', 'confirmed', 'in_progress', 'cancelled') then
    raise exception 'This job is not eligible for a dispute';
  end if;
  select * into payment from escrow_transactions where job_id = p_job_id for update;
  if not found then raise exception 'This job has no payment to dispute'; end if;
  insert into disputes(escrow_id, job_id, raised_by, reason, details)
  values (payment.id, p_job_id, p_actor_id, p_reason, p_details) returning * into complaint;
  if payment.status = 'held' then
    update escrow_transactions set status = 'disputed' where id = payment.id;
  end if;
  return complaint;
end;
$$;
revoke all on function public.raise_job_dispute(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.raise_job_dispute(uuid, uuid, text, text) to service_role;

commit;
