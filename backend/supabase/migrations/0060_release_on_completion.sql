-- Release payment as soon as the client confirms the job is complete.
--
-- 0040 held a completed job's payment for a 72-hour warranty before paying the
-- provider. The warranty is removed: confirming completion is the client's
-- acceptance of the work, and the payment is released at once. Complaints
-- must be raised before confirming; an open complaint still blocks release.
-- Terms & Conditions version 3 says so (mobile/src/lib/legalText.ts).
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
